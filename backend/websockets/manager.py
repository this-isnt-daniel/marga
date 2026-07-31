import json
import os
import time
from typing import Dict, Any, Optional, List
from fastapi import WebSocket
from collections import deque

# ── In-memory audit log ─────────────────────────────────────────────────────
_audit_log: deque = deque(maxlen=500)
AUDIT_LOG_FILE = "data/audit_log.jsonl"

def _load_audit_logs():
    if os.path.exists(AUDIT_LOG_FILE):
        try:
            with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        _audit_log.append(json.loads(line))
        except Exception as e:
            print(f"Error loading audit logs: {e}")

_load_audit_logs()

def _log_entry(msg_type: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a timestamped audit log entry, append to ring buffer, and write to disk."""
    entry = {
        "timestamp": time.time(),
        "type": msg_type,
        "data": data,
    }
    _audit_log.append(entry)
    
    try:
        os.makedirs(os.path.dirname(AUDIT_LOG_FILE), exist_ok=True)
        with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        print(f"Error writing audit log to disk: {e}")
        
    return entry

def get_audit_logs(limit: int = 100, event_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return audit log entries, newest first. Optionally filter by event_id."""
    logs = list(_audit_log)
    logs.reverse()  # newest first
    if event_id:
        logs = [
            l for l in logs
            if event_id.lower() in str(l.get("data", {})).lower()
        ]
    return logs[:limit]


# ── WebSocket Connection Manager ────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                try:
                    self.active_connections.remove(connection)
                except ValueError:
                    pass

manager = ConnectionManager()


# ── Broadcast helpers ───────────────────────────────────────────────────────

async def broadcast_graph_update(tracking_id: str, current_node: str, state_summary: str):
    data = {
        "current_node": current_node,
        "tracking_id": tracking_id,
        "state_summary": state_summary,
    }
    _log_entry("state_update", data)
    await manager.broadcast({"type": "state_update", "data": data})


async def broadcast_agent_thought(
    node: str,
    thought: str,
    confidence_score: float,
    tool_calls: list = None,
):
    data = {
        "node": node,
        "thought": thought,
        "confidence_score": confidence_score,
        "tool_calls": tool_calls or [],
    }
    _log_entry("agent_thought", data)
    await manager.broadcast({"type": "agent_thought", "data": data})


async def broadcast_api_call(
    service: str,
    endpoint: str,
    request_payload: dict,
    response_payload: dict,
    status: int = 200,
):
    data = {
        "service": service,
        "endpoint": endpoint,
        "request": request_payload,
        "response": response_payload,
        "status": status,
    }
    _log_entry("api_call", data)
    await manager.broadcast({"type": "api_call", "data": data})


async def broadcast_reasoning_step(
    step_number: int,
    step_title: str,
    reasoning_text: str,
    data_snapshot: Optional[Dict[str, Any]] = None,
    confidence: float = 0.9,
):
    """Emit a structured reasoning step for the frontend reasoning feed."""
    data = {
        "step_number": step_number,
        "step_title": step_title,
        "reasoning_text": reasoning_text,
        "data_snapshot": data_snapshot or {},
        "confidence": confidence,
    }
    _log_entry("reasoning_step", data)
    await manager.broadcast({"type": "reasoning_step", "data": data})
