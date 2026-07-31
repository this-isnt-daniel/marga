from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from ..graph.builder import graph
from ..schemas.api import ApprovalCard, ApprovalDecision
from ..models.database import get_db
from ..models.domain import ApprovalCardDB
from ..db import crud
import json, os, pathlib

router = APIRouter()

@router.get("/cards/pending", response_model=List[ApprovalCard])
async def list_pending_cards(db: AsyncSession = Depends(get_db)):
    try:
        return await crud.get_pending_cards(db)
    except Exception as e:
        print(f"Notice: Database offline, returning empty pending cards list. ({e})")
        return []

@router.get("/cards/{event_id}", response_model=ApprovalCard)
async def get_card(event_id: str, db: AsyncSession = Depends(get_db)):
    card = await crud.get_card(db, event_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card

@router.post("/cards/{event_id}/decision")
async def record_decision(
    event_id: str,
    decision: ApprovalDecision,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    card = await crud.get_card(db, event_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    # Update state in DB
    await crud.update_card_status(db, event_id, decision.decision, decision.chosen_quote_id)

    # Resume the LangGraph using Command
    from langgraph.types import Command
    
    # In a real app we'd load the thread_id associated with the event
    thread_id = await crud.get_thread_id(db, event_id) or event_id
    config = {"configurable": {"thread_id": thread_id}}
    
    async def resume_graph():
        try:
            print(f"Resuming graph for thread_id {thread_id}...")
            await graph.ainvoke(
                Command(resume={
                    "decision": decision.decision,
                    "chosen_quote_id": decision.chosen_quote_id,
                    "manager_note": decision.manager_note
                }),
                config=config
            )
            print(f"Graph resumed and completed successfully for {thread_id}.")
        except Exception as e:
            print(f"CRITICAL ERROR IN GRAPH RESUMPTION: {e}")
            import traceback
            traceback.print_exc()
        
    background_tasks.add_task(resume_graph)

    response_data = {"status": "recorded", "decision": decision.decision}
    
    from ..websockets.manager import broadcast_api_call
    await broadcast_api_call(
        service="Marga Agent Backend",
        endpoint=f"/cards/{event_id}/decision",
        request_payload={
            "decision": decision.decision,
            "chosen_quote_id": decision.chosen_quote_id,
            "manager_note": decision.manager_note
        },
        response_payload=response_data,
        status=200
    )

    return response_data


# ── Live Dashboard Data Endpoints ──────────────────────────────────────────

def _load_pos_raw() -> list:
    """Load purchase orders from the data file."""
    data_path = pathlib.Path(__file__).parent.parent.parent / "data" / "purchase_orders.json"
    if not data_path.exists():
        return []
    with open(data_path) as f:
        return json.load(f)


@router.get("/inventory/at-risk")
async def get_inventory_at_risk():
    """
    Returns live inventory risk stats computed from the actual PO data file.
    Used to populate the dashboard stat cards with real numbers.
    """
    pos = _load_pos_raw()
    # Only count submitted (docstatus=1) POs
    active_pos = [p for p in pos if p.get("docstatus", 0) == 1]

    route_map: dict = {}
    for po in active_pos:
        route = po.get("custom_route", "Unknown")
        items = po.get("items", [])
        total_qty = sum(i.get("qty", 0) for i in items)
        total_val = sum(i.get("qty", 0) * i.get("rate", 0.0) for i in items)

        if route not in route_map:
            route_map[route] = {"route": route, "po_count": 0, "exposure_usd": 0.0, "pos": []}
        route_map[route]["po_count"] += 1
        route_map[route]["exposure_usd"] += total_val
        route_map[route]["pos"].append({
            "po_id": po.get("name"),
            "supplier": po.get("supplier", ""),
            "vessel_id": po.get("custom_vessel_id", ""),
            "product": items[0].get("item_name", "") if items else "",
            "item_code": items[0].get("item_code", "") if items else "",
            "quantity": total_qty,
            "value_usd": total_val,
            "match_confidence": po.get("custom_match_confidence", 1.0),
        })

    routes = sorted(route_map.values(), key=lambda r: r["exposure_usd"], reverse=True)
    total_exposure = sum(r["exposure_usd"] for r in routes)

    return {
        "total_pos": len(active_pos),
        "at_risk_pos": len(active_pos),   # all active POs are tracked; NOAA events subset this
        "total_exposure_usd": round(total_exposure, 2),
        "routes": [
            {
                "route": r["route"],
                "po_count": r["po_count"],
                "exposure_usd": round(r["exposure_usd"], 2),
                "pos": r["pos"],
            }
            for r in routes
        ],
    }


@router.get("/events/active")
async def get_active_events(db: AsyncSession = Depends(get_db)):
    """
    Returns all approval cards (pending + recently resolved) enriched with
    event details for the Active Alerts panel on the dashboard.
    Gracefully handles offline database by returning empty list.
    """
    try:
        result = await db.execute(select(ApprovalCardDB).order_by(ApprovalCardDB.updated_at.desc()).limit(20))
        db_cards = result.scalars().all()
    except Exception as e:
        print(f"Notice: Database offline, returning empty active events list. ({e})")
        return []

    events = []
    for db_card in db_cards:
        data = db_card.card_data or {}
        event = data.get("event", {})
        exposure = data.get("exposure", {})
        cost = data.get("cost_analysis", {})
        events.append({
            "event_id": db_card.event_id,
            "status": db_card.status,
            "route": event.get("route", ""),
            "vessel_id": event.get("vessel_id", ""),
            "source": event.get("source", ""),
            "description": event.get("description", ""),
            "detected_at": event.get("detected_at", ""),
            "matched_pos": exposure.get("matched_pos", []),
            "exposure_usd": exposure.get("total_inventory_value_usd", 0.0),
            "stockout_cost_usd": cost.get("stockout_cost_usd", 0.0),
            "reroute_savings_usd": cost.get("reroute_savings_usd", 0.0),
            "chosen_quote_id": db_card.chosen_quote_id,
        })

    return events


@router.get("/audit/logs")
async def get_audit_log(limit: int = 100, event_id: Optional[str] = None):
    """
    Returns the in-memory audit trail of all agent actions.
    Supports filtering by event_id and limiting results.
    """
    from ..websockets.manager import get_audit_logs
    return get_audit_logs(limit=limit, event_id=event_id)
