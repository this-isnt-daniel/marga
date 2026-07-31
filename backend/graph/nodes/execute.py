from typing import Any, Dict
from ..state import AgentState
import requests
import os
import asyncio

BOOKING_API_URL = os.getenv("BOOKING_API_URL", "http://localhost:8003")

async def execute_node(state: AgentState) -> Dict[str, Any]:
    """
    Executes the approved reroute by calling the booking API.
    If rejected, logs and exits without booking.
    """
    from ...websockets.manager import broadcast_agent_thought, broadcast_api_call

    decision = state.get("approval_decision")
    quote_id = state.get("chosen_quote_id")
    event_id = state.get("event_id")
    matched_pos = state.get("matched_pos", [])

    if decision == "approved" and quote_id:
        await asyncio.sleep(1.5)
        await broadcast_agent_thought(
            node="execute",
            thought=f"Approval received. Booking reroute via quote {quote_id} for {len(matched_pos)} POs...",
            confidence_score=0.99
        )

        await asyncio.sleep(2.0)
        # Call the real booking API
        payload = {
            "event_id": event_id,
            "po_ids": matched_pos,
            "quote_id": quote_id,
            "decision": {
                "event_id": event_id,
                "decision": "approved",
                "chosen_quote_id": quote_id,
                "manager_note": state.get("manager_note", "Approved via Dashboard"),
            }
        }
        
        try:
            resp = requests.post(f"{BOOKING_API_URL}/book", json=payload, timeout=10)
            resp.raise_for_status()
            booking = resp.json()
            result = f"Booking confirmed. Reference: {booking.get('booking_reference', 'N/A')}"
            
            await asyncio.sleep(1.5)
            await broadcast_api_call(
                service="Mock Booking Engine",
                endpoint="/book",
                request_payload=payload,
                response_payload=booking,
                status=200
            )

            await asyncio.sleep(1.5)
            await broadcast_agent_thought(
                node="execute",
                thought=result,
                confidence_score=1.0
            )
        except requests.exceptions.RequestException as e:
            result = f"Booking API call failed: {e}. Manual booking may be required."
            
            await broadcast_api_call(
                service="Mock Booking Engine",
                endpoint="/book",
                request_payload=payload,
                response_payload={"error": str(e)},
                status=500
            )
            
            await broadcast_agent_thought(
                node="execute",
                thought=result,
                confidence_score=0.5
            )
    else:
        await broadcast_agent_thought(
            node="execute",
            thought="Reroute rejected by human operator. No action taken.",
            confidence_score=1.0
        )
        result = "Reroute rejected or no quote selected. No action taken."
        
    return {"execution_result": result}
