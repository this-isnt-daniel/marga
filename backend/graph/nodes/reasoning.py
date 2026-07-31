"""
backend/graph/nodes/reasoning.py

The reasoning node is called by the router whenever the state is incomplete.
Each call handles ONE missing piece (ERP → freight → cost) then returns so
the router can re-evaluate. This gives the LLM visibility into each step.

For demo scenarios (Suez, Hormuz, Bab el-Mandeb, Malacca), emits rich
scenario-specific reasoning broadcasts so the frontend can display
detailed chain-of-thought.
"""

from typing import Any, Dict, Optional
import asyncio
from ..state import AgentState
from langchain_google_genai import ChatGoogleGenerativeAI
from ...tools.erp import query_erp
from ...tools.freight import get_freight_quotes
from ...tools.cost_engine import calculate_stockout_cost

llm = ChatGoogleGenerativeAI(model="gemini-3.1-pro", temperature=0)
tools = [query_erp, get_freight_quotes, calculate_stockout_cost]
llm_with_tools = llm.bind_tools(tools)


# ── Scenario-specific reasoning text ────────────────────────────────────────

SCENARIO_REASONING = {
    "hormuz": {
        "erp_start": "🛢️ CRITICAL: Strait of Hormuz closure detected. This waterway handles 21% of global oil trade. Querying ERP for all active purchase orders transiting Hormuz...",
        "erp_result": "Found {count} impacted POs worth ${value:,.2f} — predominantly petroleum and petrochemical products from Saudi Aramco, ADNOC, and SABIC. This is a high-value energy corridor disruption.",
        "freight_start": "Requesting emergency freight alternatives from project44. Primary option: reroute via Cape of Good Hope (+26 days). Air freight available for critical LNG shipments at premium rates.",
        "freight_result": "Obtained {count} alternative quotes. Ocean reroute via Cape of Good Hope available at lower cost but +26 day transit. Air freight premium but viable for high-value LNG cargo.",
        "cost_result": "Stockout impact analysis: {delay}-day disruption → ${stockout:,.2f} penalty risk. Best reroute ({carrier}) costs ${reroute:,.2f}. Net savings: ${savings:,.2f}. Recommendation: IMMEDIATE REROUTE.",
    },
    "bab el mandeb": {
        "erp_start": "⚠️ Bab el-Mandeb Strait closure confirmed. This choke point connects the Red Sea to the Gulf of Aden — critical for Asia-Europe trade. Checking exposed inventory...",
        "erp_result": "Found {count} POs affected worth ${value:,.2f}: diverse cargo mix including steel coils, textiles, and electronics. Multiple transport modes may be required for optimal rerouting.",
        "freight_start": "Fetching reroute options. Cape of Good Hope adds ~18 days for ocean freight. Air freight available but expensive for heavy steel cargo. Evaluating mixed-mode strategy.",
        "freight_result": "Obtained {count} alternative quotes. Recommend mixed-mode: air-freight high-value electronics, ocean-reroute heavy cargo via Cape of Good Hope.",
        "cost_result": "{delay}-day delay → ${stockout:,.2f} stockout risk. Best option: {carrier} at ${reroute:,.2f}. Blended savings: ${savings:,.2f}. Recommend split-mode rerouting.",
    },
    "malacca": {
        "erp_start": "🚨 CATASTROPHIC: Strait of Malacca collision has shut down the world's busiest shipping lane (25% of global trade). Scanning ERP for semiconductor and electronics exposure...",
        "erp_result": "Found {count} POs impacted — total exposure ${value:,.2f}. Includes TSMC semiconductor wafers, Samsung EV batteries, and Foxconn PCBs. Extremely high-value, time-sensitive cargo.",
        "freight_start": "Emergency freight scan: Sunda Strait bypass available (ocean, +28 days). Air freight for semiconductor wafers is viable given exceptional value-to-weight ratio. No rail option for maritime cargo.",
        "freight_result": "Obtained {count} alternative quotes. Sunda Strait ocean bypass and air freight options available. Value of cargo justifies premium air rates for semiconductors.",
        "cost_result": "{delay}-day blockage → ${stockout:,.2f} projected stockout cost. Best reroute: {carrier} at ${reroute:,.2f}. Savings: ${savings:,.2f}. CRITICAL PRIORITY — escalating to human approval.",
    },
    "suez": {
        "erp_start": "🚢 Suez Canal blockage confirmed. Querying ERP for all purchase orders transiting the Middle East to Europe corridor via Suez...",
        "erp_result": "Found {count} impacted POs worth ${value:,.2f} including crude oil and LNG shipments. Multiple suppliers affected across the energy supply chain.",
        "freight_start": "Requesting freight alternatives. Cape of Good Hope reroute available (ocean, +15 days). Air freight quotes requested for time-critical cargo.",
        "freight_result": "Obtained {count} alternative freight quotes including Cape of Good Hope ocean reroute and emergency air freight options.",
        "cost_result": "{delay}-day delay → ${stockout:,.2f} stockout risk. Best reroute: {carrier} at ${reroute:,.2f}. Net savings: ${savings:,.2f}. Recommending immediate Cape reroute.",
    },
}


def _detect_scenario(route: str) -> Optional[str]:
    """Detect which demo scenario this route belongs to."""
    route_lower = route.lower()
    if "hormuz" in route_lower:
        return "hormuz"
    elif "bab el mandeb" in route_lower:
        return "bab el mandeb"
    elif "malacca" in route_lower:
        return "malacca"
    elif "suez" in route_lower:
        return "suez"
    return None


async def reasoning_node(state: AgentState) -> Dict[str, Any]:
    """
    Checks what data is missing from the agent state and calls the appropriate
    tool to fill the gap. Broadcasts each step as a visible agent thought.
    """
    from ...websockets.manager import broadcast_agent_thought, broadcast_api_call, broadcast_reasoning_step

    # Include news context in the initial broadcast if available
    news_analysis = state.get("llm_disruption_analysis")
    news_ctx = state.get("news_context", "")
    alt_routes = state.get("alternative_routes_suggested", [])

    raw_event = state.get("raw_event", {})
    route = raw_event.get("route", "")
    scenario = _detect_scenario(route)
    reasoning = SCENARIO_REASONING.get(scenario, {}) if scenario else {}

    initial_thought = "Analyzing disruption event and determining required actions..."
    if news_analysis:
        initial_thought += (
            f" Source: News intelligence ({news_analysis.get('disruption_type', 'unknown')}). "
            f"Severity: {news_analysis.get('severity', 'unknown')}. "
            f"LLM-suggested alternatives: {', '.join(alt_routes) if alt_routes else 'none yet'}."
        )

    await broadcast_agent_thought(
        node="reasoning_node",
        thought=initial_thought,
        confidence_score=0.9,
    )

    updates: Dict[str, Any] = {}

    # ── Step 1: Query ERP if we don't have PO data yet ────────────────────
    if state.get("matched_pos") is None:
        vessel_id = raw_event.get("vessel_id", "")

        # Emit scenario-specific reasoning
        if reasoning.get("erp_start"):
            await asyncio.sleep(1.5)
            await broadcast_reasoning_step(
                step_number=1,
                step_title="Querying ERP System",
                reasoning_text=reasoning["erp_start"],
                confidence=0.9,
            )

        await asyncio.sleep(2.0)
        request_payload = {"vessel_id": vessel_id, "route": route}
        result = query_erp.invoke(request_payload)

        await broadcast_api_call(
            service="Mock ERP System (ERPNext)",
            endpoint=f"/exposure?vessel_id={vessel_id}&route={route}",
            request_payload=request_payload,
            response_payload=result,
            status=500 if result.get("status") == "error" else 200,
        )

        if result.get("status") == "error":
            await broadcast_agent_thought(
                node="reasoning_node",
                thought=f"ERP query failed: {result.get('error')}. Check that the mock ERP service is running.",
                confidence_score=0.3,
            )
        else:
            updates["matched_pos"] = result.get("matched_pos", [])
            updates["exposure_value"] = result.get("total_inventory_value_usd", 0.0)
            note = result.get("data_quality_note", "")

            # Use scenario-specific result text or generic
            if reasoning.get("erp_result"):
                thought_text = reasoning["erp_result"].format(
                    count=len(updates["matched_pos"]),
                    value=updates["exposure_value"],
                )
            else:
                thought_text = (
                    f"ERP query complete. Found {len(updates['matched_pos'])} impacted POs "
                    f"worth ${updates['exposure_value']:,.2f}. "
                    + (f"⚠️ {note}" if note else "")
                )

            await asyncio.sleep(1.5)
            await broadcast_reasoning_step(
                step_number=1,
                step_title="ERP Exposure Analysis",
                reasoning_text=thought_text,
                data_snapshot={
                    "matched_pos": updates["matched_pos"],
                    "exposure_value_usd": updates["exposure_value"],
                },
                confidence=0.95,
            )

            await broadcast_agent_thought(
                node="reasoning_node",
                thought=thought_text,
                confidence_score=0.95,
                tool_calls=[{"tool_name": "query_erp", "rationale": "Checking affected inventory."}],
            )

    # ── Step 2: Get freight quotes if POs found but no quotes yet ─────────
    elif state.get("freight_quotes") is None and len(state.get("matched_pos", [])) > 0:
        # Emit scenario-specific reasoning
        if reasoning.get("freight_start"):
            await asyncio.sleep(1.5)
            await broadcast_reasoning_step(
                step_number=2,
                step_title="Fetching Freight Alternatives",
                reasoning_text=reasoning["freight_start"],
                confidence=0.9,
            )

        await asyncio.sleep(2.5)

        # Derive origin from route
        origin = "Shanghai"
        destination = "Los Angeles"
        if " to " in route:
            parts = route.split(" to ", 1)
            origin, destination = parts[0].strip(), parts[1].strip()

        request_payload = {
            "origin": origin,
            "destination": destination,
            "weight_kg": 50000.0,
        }
        quotes = get_freight_quotes.invoke(request_payload)

        await broadcast_api_call(
            service="Mock Freight Carrier (project44)",
            endpoint=f"/quotes?origin={origin}&destination={destination}",
            request_payload=request_payload,
            response_payload={"quotes": quotes},
            status=500 if any("error" in q for q in quotes) else 200,
        )

        # Also fetch quotes for LLM-suggested alternative routes
        if alt_routes:
            for alt_route in alt_routes[:3]:
                if " to " in alt_route or " via " in alt_route:
                    alt_origin = origin
                    alt_dest = destination
                    if " to " in alt_route:
                        parts = alt_route.split(" to ", 1)
                        alt_origin, alt_dest = parts[0].strip(), parts[1].strip()
                    elif " via " in alt_route:
                        alt_dest = alt_route.split(" via ", 1)[1].strip()

                    try:
                        alt_quotes = get_freight_quotes.invoke({
                            "origin": alt_origin,
                            "destination": alt_dest,
                            "weight_kg": 50000.0,
                        })
                        quotes.extend(alt_quotes)
                    except Exception:
                        pass

        valid_quotes = [q for q in quotes if "error" not in q]

        if not valid_quotes:
            await broadcast_agent_thought(
                node="reasoning_node",
                thought="No freight quotes returned. Check that the mock freight service is running on port 8002.",
                confidence_score=0.3,
            )
            updates["freight_quotes"] = [{"error": "No quotes available"}]
        else:
            updates["freight_quotes"] = valid_quotes

            if reasoning.get("freight_result"):
                thought_text = reasoning["freight_result"].format(count=len(valid_quotes))
            else:
                thought_text = f"Obtained {len(valid_quotes)} alternative freight quotes."
                if alt_routes:
                    thought_text += f" (includes quotes for alternatives: {', '.join(alt_routes[:3])})"

            await asyncio.sleep(1.5)
            await broadcast_reasoning_step(
                step_number=2,
                step_title="Freight Quote Analysis",
                reasoning_text=thought_text,
                data_snapshot={"quote_count": len(valid_quotes), "quotes": valid_quotes},
                confidence=0.92,
            )

            await broadcast_agent_thought(
                node="reasoning_node",
                thought=thought_text,
                confidence_score=0.92,
                tool_calls=[{"tool_name": "get_freight_quotes", "rationale": "Finding rerouting options."}],
            )

    # ── Step 3: Calculate cost analysis if we have quotes but no analysis ─
    elif not state.get("cost_analysis"):
        exposure_value = state.get("exposure_value", 0.0)
        quotes = state.get("freight_quotes", [])
        valid_quotes = [q for q in quotes if "error" not in q]

        delay_days = 10
        if scenario == "hormuz":
            delay_days = 14
        elif scenario == "bab el mandeb":
            delay_days = 18
        elif scenario == "malacca":
            delay_days = 21

        await asyncio.sleep(2.0)
        cost_result = calculate_stockout_cost.invoke({
            "inventory_value": exposure_value,
            "delay_days": delay_days,
        })

        best_quote = min(valid_quotes, key=lambda q: q.get("cost_usd", float("inf"))) if valid_quotes else None

        stockout_cost = cost_result.get("stockout_cost_usd", 0.0)
        best_cost = best_quote.get("cost_usd", 0.0) if best_quote else 0.0
        carrier_name = best_quote.get("carrier", "N/A") if best_quote else "N/A"

        updates["cost_analysis"] = {
            "stockout_cost_usd": stockout_cost,
            "reroute_savings_usd": max(0.0, stockout_cost - best_cost),
            "recommendation": cost_result.get("recommendation", ""),
            "best_reroute_option": {"quote_id": best_quote["quote_id"]} if best_quote else None,
        }

        if reasoning.get("cost_result"):
            thought_text = reasoning["cost_result"].format(
                delay=delay_days,
                stockout=stockout_cost,
                carrier=carrier_name,
                reroute=best_cost,
                savings=updates["cost_analysis"]["reroute_savings_usd"],
            )
        else:
            thought_text = (
                f"Cost analysis complete. Stockout risk: ${stockout_cost:,.2f}. "
                f"Best reroute: ${best_cost:,.2f} via {carrier_name}. "
                f"Projected savings: ${updates['cost_analysis']['reroute_savings_usd']:,.2f}."
            )

        await asyncio.sleep(1.5)
        await broadcast_reasoning_step(
            step_number=3,
            step_title="Cost-Benefit Analysis",
            reasoning_text=thought_text,
            data_snapshot={
                "stockout_cost_usd": stockout_cost,
                "best_reroute_cost_usd": best_cost,
                "savings_usd": updates["cost_analysis"]["reroute_savings_usd"],
                "delay_days": delay_days,
            },
            confidence=0.88,
        )

        await broadcast_agent_thought(
            node="reasoning_node",
            thought=thought_text,
            confidence_score=0.88,
            tool_calls=[{"tool_name": "calculate_stockout_cost", "rationale": "Evaluating financial impact."}],
        )

    return updates
