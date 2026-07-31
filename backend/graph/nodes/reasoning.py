"""
backend/graph/nodes/reasoning.py

The reasoning node is called by the router whenever the state is incomplete.
Each call handles ONE missing piece (ERP → freight → cost) then returns so
the router can re-evaluate. This gives the LLM visibility into each step.
"""

from typing import Any, Dict
from ..state import AgentState
from langchain_google_genai import ChatGoogleGenerativeAI
from ...tools.erp import query_erp
from ...tools.freight import get_freight_quotes
from ...tools.cost_engine import calculate_stockout_cost

llm = ChatGoogleGenerativeAI(model="gemini-3-flash-preview", temperature=0)
tools = [query_erp, get_freight_quotes, calculate_stockout_cost]
llm_with_tools = llm.bind_tools(tools)


async def reasoning_node(state: AgentState) -> Dict[str, Any]:
    """
    Checks what data is missing from the agent state and calls the appropriate
    tool to fill the gap. Broadcasts each step as a visible agent thought.
    """
    from ...websockets.manager import broadcast_agent_thought, broadcast_api_call

    # Include news context in the initial broadcast if available
    news_analysis = state.get("llm_disruption_analysis")
    news_ctx = state.get("news_context", "")
    alt_routes = state.get("alternative_routes_suggested", [])

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
    raw_event = state.get("raw_event", {})

    # ── Step 1: Query ERP if we don't have PO data yet ────────────────────
    if state.get("matched_pos") is None:
        vessel_id = raw_event.get("vessel_id", "")
        route = raw_event.get("route", "")

        request_payload = {"vessel_id": vessel_id, "route": route}
        result = query_erp.invoke(request_payload)

        await broadcast_api_call(
            service="Mock ERP System",
            endpoint="/exposure",
            request_payload=request_payload,
            response_payload=result,
            status=500 if result.get("status") == "error" else 200
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

            await broadcast_agent_thought(
                node="reasoning_node",
                thought=(
                    f"ERP query complete. Found {len(updates['matched_pos'])} impacted POs "
                    f"worth ${updates['exposure_value']:,.2f}. "
                    + (f"⚠️ {note}" if note else "")
                ),
                confidence_score=0.95,
                tool_calls=[{"tool_name": "query_erp", "rationale": "Checking affected inventory."}],
            )

    # ── Step 2: Get freight quotes if POs found but no quotes yet ─────────
    elif state.get("freight_quotes") is None and len(state.get("matched_pos", [])) > 0:
        # Derive origin from route; default to standard Shanghai→LA demo lane
        route = raw_event.get("route", "")
        origin = "Shanghai"
        destination = "Los Angeles"

        # Try to extract origin/destination from route string (e.g. "Shanghai to Los Angeles")
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
            service="Mock Freight Carrier",
            endpoint="/quotes",
            request_payload=request_payload,
            response_payload={"quotes": quotes},
            status=500 if any("error" in q for q in quotes) else 200
        )

        # If we have LLM-suggested alternative routes from news analysis,
        # also request quotes for those routes
        if alt_routes:
            for alt_route in alt_routes[:3]:  # Cap at 3 alternatives
                if " to " in alt_route or " via " in alt_route:
                    # Try to parse "via PortX" or "Origin to Dest" format
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
                        pass  # Don't fail if an alternative route query fails

        # Filter out error entries
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
            alt_note = ""
            if alt_routes:
                alt_note = f" (includes quotes for LLM-suggested alternatives: {', '.join(alt_routes[:3])})"
            await broadcast_agent_thought(
                node="reasoning_node",
                thought=f"Obtained {len(valid_quotes)} alternative freight quotes.{alt_note}",
                confidence_score=0.92,
                tool_calls=[{"tool_name": "get_freight_quotes", "rationale": "Finding rerouting options."}],
            )

    # ── Step 3: Calculate cost analysis if we have quotes but no analysis ─
    elif not state.get("cost_analysis"):
        exposure_value = state.get("exposure_value", 0.0)
        quotes = state.get("freight_quotes", [])
        valid_quotes = [q for q in quotes if "error" not in q]

        # Use 10-day delay estimate — in a real system this would come from monitoring
        cost_result = calculate_stockout_cost.invoke({
            "inventory_value": exposure_value,
            "delay_days": 10,
        })

        # Pick the cheapest valid quote as the recommended option
        best_quote = min(valid_quotes, key=lambda q: q.get("cost_usd", float("inf"))) if valid_quotes else None

        stockout_cost = cost_result.get("stockout_cost_usd", 0.0)
        best_cost = best_quote.get("cost_usd", 0.0) if best_quote else 0.0

        updates["cost_analysis"] = {
            "stockout_cost_usd": stockout_cost,
            "reroute_savings_usd": max(0.0, stockout_cost - best_cost),
            "recommendation": cost_result.get("recommendation", ""),
            "best_reroute_option": {"quote_id": best_quote["quote_id"]} if best_quote else None,
        }

        await broadcast_agent_thought(
            node="reasoning_node",
            thought=(
                f"Cost analysis complete. Stockout risk: ${stockout_cost:,.2f}. "
                f"Best reroute: ${best_cost:,.2f} via {best_quote.get('carrier', '?') if best_quote else 'N/A'}. "
                f"Projected savings: ${updates['cost_analysis']['reroute_savings_usd']:,.2f}."
            ),
            confidence_score=0.88,
            tool_calls=[{"tool_name": "calculate_stockout_cost", "rationale": "Evaluating financial impact."}],
        )

    return updates
