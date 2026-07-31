import os
from dotenv import load_dotenv

# Load environment variables before importing routers that initialize the LLM
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv() # Fallback for root .env

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
from .routers.ws import router as ws_router
from .routers.hitl import router as hitl_router
from .routers.map import router as map_router
from .graph.builder import graph
import uuid

app = FastAPI(title="Marga Backend API", description="LangGraph-powered supply chain disruption agent.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the HITL dashboard at /dashboard
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

import sys
import asyncio

# Fix Windows Psycopg event loop compatibility
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:
        pass

@app.on_event("startup")
async def startup():
    from .models.database import init_db, DATABASE_URL
    from psycopg_pool import AsyncConnectionPool
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from .graph.builder import graph

    print("Initializing database connection...")
    try:
        await asyncio.wait_for(init_db(), timeout=3.0)
        print("Database tables initialized successfully.")

        # Set up LangGraph Postgres checkpointer
        psycopg_url = DATABASE_URL.replace("+asyncpg", "")
        app.state.pool = AsyncConnectionPool(
            conninfo=psycopg_url,
            max_size=20,
            kwargs={"autocommit": True},
            open=False
        )
        await asyncio.wait_for(app.state.pool.open(), timeout=3.0)
        saver = AsyncPostgresSaver(app.state.pool)
        await asyncio.wait_for(saver.setup(), timeout=3.0)
        graph.checkpointer = saver
        print("LangGraph Postgres checkpointer configured.")
    except Exception as e:
        print("Notice: Postgres database not available ({e}). Using in-memory state saver.")

    # Start NOAA background polling task
    from .services.noaa_poller import run_poller
    app.state.poller_task = asyncio.create_task(run_poller())
    print("NOAA maritime alert poller started.")

    # Start News background polling task
    from .services.news_poller import run_news_poller
    app.state.news_poller_task = asyncio.create_task(run_news_poller())
    print("News intelligence poller started.")


@app.on_event("shutdown")
async def shutdown():
    if hasattr(app.state, "pool"):
        await app.state.pool.close()
    if hasattr(app.state, "poller_task"):
        app.state.poller_task.cancel()
    if hasattr(app.state, "news_poller_task"):
        app.state.news_poller_task.cancel()

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Marga Supply Chain Agent API is running.",
        "documentation": "http://localhost:8000/docs",
        "frontend_url": "http://localhost:3000",
        "dashboard_url": "http://localhost:8000/dashboard"
    }

@app.get("/dashboard", include_in_schema=False)
def serve_dashboard():
    dashboard_file = STATIC_DIR / "dashboard.html"
    if dashboard_file.exists():
        return FileResponse(str(dashboard_file))
    return {"message": "Dashboard HTML file not found."}

app.include_router(ws_router)
app.include_router(hitl_router)
app.include_router(map_router)


@app.post("/trigger_disruption")
async def trigger_disruption(event_id: str = "EVT-9999"):
    # This acts as the entry point to start the LangGraph
    thread_id = f"{event_id}-{str(uuid.uuid4())}"
    config = {"configurable": {"thread_id": thread_id}}
    
    from .db import crud
    from .models.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await crud.save_thread(db, event_id, thread_id)
    
    initial_state = {
        "event_id": event_id,
        "raw_event": {
            "vessel_id": "V-559",
            "source": "NOAA",
            "route": "Suez",
            "description": "Sandstorm disrupting Suez Canal passage.",
        },
    }
    
    async def run_graph_task():
        try:
            print(f"Starting graph for {event_id}...")
            await graph.ainvoke(initial_state, config=config)
            print(f"Graph completed successfully for {event_id}.")
        except Exception as e:
            print(f"CRITICAL ERROR IN GRAPH EXECUTION: {e}")
            import traceback
            traceback.print_exc()

    import asyncio
    asyncio.create_task(run_graph_task())
    return {"status": "started", "thread_id": thread_id}


from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class SandboxPayload(BaseModel):
    event_headline: str
    event_description: str
    severity: str
    exposure_value_usd: float
    matched_pos: List[str]
    freight_quotes: List[Dict[str, Any]]

@app.post("/simulate-sandbox")
async def simulate_sandbox(payload: SandboxPayload):
    import uuid
    event_id = f"SBX-{str(uuid.uuid4())[:6].upper()}"
    thread_id = f"{event_id}-{str(uuid.uuid4())}"
    config = {"configurable": {"thread_id": thread_id}}
    
    from .db import crud
    from .models.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await crud.save_thread(db, event_id, thread_id)
        
    initial_state = {
        "event_id": event_id,
        "raw_event": {
            "vessel_id": "SANDBOX-01",
            "source": "Sandbox Editor",
            "route": "Custom Scenario",
            "description": payload.event_description,
        },
        "news_context": f"Headline: {payload.event_headline}",
        "llm_disruption_analysis": {
            "disruption_type": "Custom Sandbox Event",
            "severity": payload.severity,
        },
        "matched_pos": payload.matched_pos,
        "exposure_value": payload.exposure_value_usd,
        "freight_quotes": payload.freight_quotes,
    }
    
    async def run_graph_task():
        from .websockets.manager import broadcast_agent_thought, broadcast_api_call, broadcast_reasoning_step
        try:
            print(f"Starting Sandbox graph for {event_id}...")
            
            # 1. Simulate Poller Broadcast
            await asyncio.sleep(0.5)
            await broadcast_agent_thought(
                node="news_poller",
                thought=f"Simulated God Mode event received: {payload.event_headline}",
                confidence_score=1.0
            )
            
            # 2. Simulate Analyzer Broadcast
            await asyncio.sleep(1.0)
            await broadcast_agent_thought(
                node="news_analyzer",
                thought=f"Disruption detected from Sandbox override: {payload.event_description}. Severity: {payload.severity}. Injecting custom ERP and Freight parameters into state.",
                confidence_score=1.0
            )

            # 3. Simulate ERP Broadcast
            await asyncio.sleep(1.5)
            
            # Dynamic ERP thought
            if payload.exposure_value_usd > 10000000:
                erp_context = f"CATASTROPHIC EXPOSURE: Found {len(payload.matched_pos)} high-value POs at risk. Immediate executive escalation required for ${payload.exposure_value_usd:,.2f} inventory."
            elif payload.exposure_value_usd > 1000000:
                erp_context = f"High-risk inventory identified. {len(payload.matched_pos)} POs worth ${payload.exposure_value_usd:,.2f} are currently transiting the affected zone."
            elif payload.exposure_value_usd > 0:
                erp_context = f"Minor exposure detected. Found {len(payload.matched_pos)} POs worth ${payload.exposure_value_usd:,.2f}. Monitoring situation closely."
            else:
                erp_context = "No direct inventory exposure found in the affected region. $0 at risk."
                
            await broadcast_agent_thought(
                node="reasoning_node",
                thought=erp_context,
                confidence_score=0.96,
                tool_calls=[{"tool_name": "query_erp", "rationale": "Checking active purchase orders against disruption zone."}]
            )
            await broadcast_reasoning_step(
                step_number=1,
                step_title="ERP Exposure Analysis",
                reasoning_text=erp_context,
                data_snapshot={"matched_pos": payload.matched_pos, "exposure_value_usd": payload.exposure_value_usd},
                confidence=0.96
            )

            # 4. Simulate Freight Broadcast
            await asyncio.sleep(1.5)
            
            # Dynamic Freight thought
            freight_len = len(payload.freight_quotes)
            if freight_len == 0 or any("error" in q for q in payload.freight_quotes):
                freight_context = "CRITICAL: No viable freight capacity available. All regional carriers have suspended operations."
            elif freight_len > 2:
                freight_context = f"Capacity secured. Retrieved {freight_len} alternative quotes across mixed modes (Ocean/Air). Standard rerouting protocols can be applied."
            else:
                freight_context = f"Limited capacity detected. Only {freight_len} premium routing options available. Expedited rates apply."
                
            await broadcast_agent_thought(
                node="reasoning_node",
                thought=freight_context,
                confidence_score=0.93,
                tool_calls=[{"tool_name": "get_freight_quotes", "rationale": "Polling project44 for emergency capacity."}]
            )
            await broadcast_reasoning_step(
                step_number=2,
                step_title="Freight Quote Analysis",
                reasoning_text=freight_context,
                data_snapshot={"quote_count": freight_len, "quotes": payload.freight_quotes},
                confidence=0.93
            )
            
            await graph.ainvoke(initial_state, config=config)
            print(f"Sandbox Graph completed successfully for {event_id}.")
        except Exception as e:
            print(f"CRITICAL ERROR IN SANDBOX GRAPH EXECUTION: {e}")
            import traceback
            traceback.print_exc()

    import asyncio
    asyncio.create_task(run_graph_task())
    return {"status": "started", "event_id": event_id, "thread_id": thread_id}



# ── NOAA Polling endpoints ──────────────────────────────────────────────────

@app.get("/events/polling/status", tags=["Events"])
def get_polling_status():
    """
    Returns the current status of the NOAA background poller:
    whether it's running, when it last polled, how many alerts have
    been triggered, and how many unique events have been seen.
    """
    from .services.noaa_poller import get_status
    return get_status()


class SimulateEventPayload(BaseModel):
    route: str = "Shanghai to Los Angeles"
    vessel_id: str = "Evergreen"
    description: str = "Simulated maritime disruption for testing."
    event_type: str = "Gale Warning"

@app.post("/events/simulate", tags=["Events"])
async def simulate_event(payload: SimulateEventPayload):
    """
    Manually simulate a maritime disruption event and trigger the
    LangGraph agent — useful for demos and frontend development without
    waiting for a real NOAA alert.
    """
    event_id = f"SIM-{str(uuid.uuid4())[:8].upper()}"
    thread_id = f"{event_id}-{str(uuid.uuid4())[:8]}"
    config = {"configurable": {"thread_id": thread_id}}

    from .db import crud
    from .models.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            await crud.save_thread(db, event_id, thread_id)
    except Exception:
        pass

    from langchain_core.messages import SystemMessage
    from datetime import datetime, timezone
    initial_state = {
        "event_id": event_id,
        "route": payload.route,
        "vessel_id": payload.vessel_id,
        "current_step": "start",
        "messages": [SystemMessage(content=f"Simulated event triggered: {payload.event_type} - {payload.description}")],
        "audit_trail": [{
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "node": "system",
            "action": "event_received",
            "details": f"Simulated {payload.event_type} on {payload.route} affecting {payload.vessel_id}"
        }],
        "raw_event": {
            "vessel_id": payload.vessel_id,
            "source": "SIMULATION",
            "route": payload.route,
            "description": payload.description,
            "event_type": payload.event_type,
        },
    }

    async def run_graph_task():
        try:
            await graph.ainvoke(initial_state, config=config)
        except Exception as e:
            import traceback
            traceback.print_exc()

    asyncio.create_task(run_graph_task())
    
    response_data = {
        "status": "started",
        "event_id": event_id,
        "thread_id": thread_id,
        "route": payload.route,
        "vessel_id": payload.vessel_id,
    }
    from .websockets.manager import broadcast_api_call
    await broadcast_api_call(
        service="Marga Agent Backend",
        endpoint="/events/simulate",
        request_payload={
            "route": payload.route,
            "vessel_id": payload.vessel_id,
            "description": payload.description,
            "event_type": payload.event_type,
        },
        response_payload=response_data,
        status=200
    )
    
    return response_data

# ── News Intelligence endpoints ────────────────────────────────────────────

@app.get("/events/news/status", tags=["Events"])
def get_news_polling_status():
    """
    Returns the current status of the News intelligence poller:
    whether it's running, when it last polled, how many articles
    have been analyzed, and how many disruptions triggered.
    """
    from .services.news_poller import get_news_status
    return get_news_status()


class NewsSimulatePayload(BaseModel):
    headline: str = "Major port strike shuts down Shanghai Terminal 2, affecting Trans-Pacific shipping"
    description: str = "Workers at Shanghai's busiest container terminal have launched an indefinite strike, halting operations and causing severe delays for vessels on the Trans-Pacific route to Los Angeles and Long Beach."
    source: str = "Reuters"

@app.post("/events/news/simulate", tags=["Events"])
async def simulate_news_event(payload: NewsSimulatePayload):
    """
    Manually simulate a news article and run it through Gemini 2.5 Pro
    analysis. If the LLM identifies a real disruption, it triggers the
    full LangGraph agent pipeline.

    Perfect for demos — no NEWS_API_KEY required.
    """
    from .services.news_poller import simulate_news_article
    result = await simulate_news_article(payload.headline, payload.description, payload.source)
    
    from .websockets.manager import broadcast_api_call
    await broadcast_api_call(
        service="Marga Agent Backend",
        endpoint="/events/news/simulate",
        request_payload={
            "headline": payload.headline,
            "description": payload.description,
            "source": payload.source
        },
        response_payload=result,
        status=200
    )
    
    return result
