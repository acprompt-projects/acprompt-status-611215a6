import asyncio
import time
import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

app = FastAPI(title="ACPrompt Status API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

STARTED_AT = time.time()
incidents: list[dict] = []
services: dict[str, dict] = {}
websocket_clients: list[WebSocket] = []

DEFAULT_SERVICES = [
    {"name": "acprompt-core", "url": "http://localhost:8000/health"},
    {"name": "acprompt-scheduler", "url": "http://localhost:8001/health"},
    {"name": "acprompt-registry", "url": "http://localhost:8002/health"},
    {"name": "acprompt-logger", "url": "http://localhost:8003/health"},
]

class IncidentCreate(BaseModel):
    service: str
    title: str
    severity: str = "warning"
    detail: Optional[str] = None

class ServiceRegister(BaseModel):
    name: str
    url: str

def uptime_seconds() -> float:
    return round(time.time() - STARTED_AT, 2)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

async def ping_service(name: str, url: str, timeout: float = 3.0) -> dict:
    status = "unknown"
    latency_ms = None
    try:
        async with httpx.AsyncClient() as client:
            t0 = time.time()
            resp = await client.get(url, timeout=timeout)
            latency_ms = round((time.time() - t0) * 1000, 1)
            status = "healthy" if resp.status_code < 400 else "degraded"
    except httpx.TimeoutException:
        status = "down"
        latency_ms = None
    except Exception:
        status = "down"
        latency_ms = None
    return {"name": name, "url": url, "status": status, "latency_ms": latency_ms, "checked_at": now_iso()}

async def poll_all_services():
    tasks = [ping_service(s["name"], s["url"]) for s in DEFAULT_SERVICES if s["name"] not in services]
    tasks += [ping_service(svc["name"], svc["url"]) for svc in services.values()]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    changed = False
    for r in results:
        if isinstance(r, Exception):
            continue
        prev = services.get(r["name"], {}).get("status")
        services[r["name"]] = r
        if prev and prev != r["status"]:
            changed = True
            if r["status"] == "down" and prev != "down":
                incidents.append({
                    "id": len(incidents) + 1,
                    "service": r["name"],
                    "title": f"{r['name']} went down",
                    "severity": "critical",
                    "detail": f"Status changed from {prev} to down",
                    "created_at": now_iso(),
                    "resolved_at": None,
                })
            elif prev == "down" and r["status"] != "down":
                for inc in reversed(incidents):
                    if inc["service"] == r["name"] and inc["resolved_at"] is None:
                        inc["resolved_at"] = now_iso()
                        break
    if changed:
        await broadcast_status()

async def broadcast_status():
    payload = {"services": list(services.values()), "incidents": incidents[-20:]}
    dead = []
    for ws in websocket_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        websocket_clients.remove(ws)

async def poller_loop():
    while True:
        await poll_all_services()
        await asyncio.sleep(10)

@app.on_event("startup")
async def startup():
    for s in DEFAULT_SERVICES:
        services[s["name"]] = {"name": s["name"], "url": s["url"], "status": "unknown", "latency_ms": None, "checked_at": None}
    asyncio.create_task(poller_loop())

@app.get("/api/health")
async def health():
    return {"status": "ok", "uptime_s": uptime_seconds(), "started_at": datetime.fromtimestamp(STARTED_AT, tz=timezone.utc).isoformat()}

@app.get("/api/status")
async def get_status():
    return {"uptime_s": uptime_seconds(), "services": list(services.values()), "incidents": incidents[-50:], "updated_at": now_iso()}

@app.get("/api/incidents")
async def get_incidents(limit: int = 50):
    return {"incidents": incidents[-limit:], "total": len(incidents)}

@app.post("/api/incidents")
async def create_incident(payload: IncidentCreate):
    inc = {"id": len(incidents) + 1, "service": payload.service, "title": payload.title,
           "severity": payload.severity, "detail": payload.detail, "created_at": now_iso(), "resolved_at": None}
    incidents.append(inc)
    await broadcast_status()
    return inc

@app.patch("/api/incidents/{incident_id}")
async def resolve_incident(incident_id: int):
    for inc in incidents:
        if inc["id"] == incident_id:
            inc["resolved_at"] = now_iso()
            await broadcast_status()
            return inc
    return {"error": "not found"}, 404

@app.post("/api/services")
async def register_service(payload: ServiceRegister):
    services[payload.name] = {"name": payload.name, "url": payload.url, "status": "unknown", "latency_ms": None, "checked_at": None}
    return {"registered": payload.name}

@app.websocket("/ws/status")
async def ws_status(ws: WebSocket):
    await ws.accept()
    websocket_clients.append(ws)
    try:
        await ws.send_json({"services": list(services.values()), "incidents": incidents[-20:]})
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in websocket_clients:
            websocket_clients.remove(ws)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8090, reload=True)