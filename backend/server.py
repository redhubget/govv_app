from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone, date, time
import os
import uuid
import logging

# ------------------------------------------------------------
# Environment & DB Setup
# ------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')  # IMPORTANT: do not modify .env values

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')
if not MONGO_URL or not DB_NAME:
    raise RuntimeError("Missing MONGO_URL or DB_NAME in backend/.env")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ------------------------------------------------------------
# FastAPI App with /api prefix router
# ------------------------------------------------------------
app = FastAPI()
api = APIRouter(prefix="/api")

# CORSMiddleware as per env
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------
# Helpers (Mongo Serialization & Gamification)
# ------------------------------------------------------------

def prepare_for_mongo(data: Dict[str, Any]) -> Dict[str, Any]:
    # Convert date/time objects to strings for Mongo storage
    if isinstance(data.get('date'), date):
        data['date'] = data['date'].isoformat()
    if isinstance(data.get('time'), time):
        data['time'] = data['time'].strftime('%H:%M:%S')
    # Datetime to ISO
    if isinstance(data.get('start_time'), datetime):
        data['start_time'] = data['start_time'].astimezone(timezone.utc).isoformat()
    if isinstance(data.get('created_at'), datetime):
        data['created_at'] = data['created_at'].astimezone(timezone.utc).isoformat()
    if isinstance(data.get('updated_at'), datetime):
        data['updated_at'] = data['updated_at'].astimezone(timezone.utc).isoformat()
    return data


def parse_from_mongo(item: Dict[str, Any]) -> Dict[str, Any]:
    # Remove Mongo's default _id
    item.pop('_id', None)
    # Parse datetimes from ISO (best-effort)
    for key in ['start_time', 'created_at', 'updated_at']:
        val = item.get(key)
        if isinstance(val, str):
            try:
                item[key] = datetime.fromisoformat(val)
            except Exception:
                pass
    return item


def compute_points(distance_km: float, avg_kmh: float, duration_sec: int) -> int:
    # Simple scoring formula
    base = int(distance_km * 10)
    speed_bonus = int(avg_kmh)
    dur_bonus = int(duration_sec / 120)  # 1 point per 2 minutes
    points = max(0, base + speed_bonus + dur_bonus)
    return points


# ------------------------------------------------------------
# Models
# ------------------------------------------------------------
class TelemetryPoint(BaseModel):
    lat: float
    lng: float
    t: float  # epoch seconds


class ActivityCreate(BaseModel):
    name: Optional[str] = None
    distance_km: float
    duration_sec: int
    avg_kmh: float
    start_time: datetime
    path: List[TelemetryPoint] = Field(default_factory=list)
    notes: Optional[str] = None
    private: bool = False


class Activity(BaseModel):
    id: str
    name: Optional[str] = None
    distance_km: float
    duration_sec: int
    avg_kmh: float
    start_time: datetime
    path: List[TelemetryPoint] = Field(default_factory=list)
    notes: Optional[str] = None
    private: bool = False
    points_earned: int
    created_at: datetime
    updated_at: datetime


class PaginatedActivities(BaseModel):
    items: List[Activity]
    total: int
    limit: int
    offset: int


class APIResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    message: str = ""


class ContactMessage(BaseModel):
    email: str
    subject: str
    message: str


# ------------------------------------------------------------
# Routes
# ------------------------------------------------------------
@api.get("/health", response_model=APIResponse)
async def health() -> APIResponse:
    return APIResponse(success=True, data={"status": "ok"}, message="Service healthy")


@api.post("/activities", response_model=APIResponse)
async def create_activity(payload: ActivityCreate) -> APIResponse:
    try:
        now = datetime.now(timezone.utc)
        points = compute_points(payload.distance_km, payload.avg_kmh, payload.duration_sec)
        act: Dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "distance_km": payload.distance_km,
            "duration_sec": payload.duration_sec,
            "avg_kmh": payload.avg_kmh,
            "start_time": payload.start_time.astimezone(timezone.utc),
            "path": [p.dict() for p in payload.path],
            "notes": payload.notes,
            "private": payload.private,
            "points_earned": points,
            "created_at": now,
            "updated_at": now,
        }
        await db.activities.insert_one(prepare_for_mongo(act.copy()))
        return APIResponse(success=True, data={"activity": parse_from_mongo(act)}, message="Activity saved")
    except Exception as e:
        logging.exception("create_activity failed")
        raise HTTPException(status_code=500, detail=str(e))


@api.get("/activities", response_model=APIResponse)
async def list_activities(limit: int = 20, offset: int = 0) -> APIResponse:
    try:
        q = db.activities.find().sort("created_at", -1).skip(offset).limit(limit)
        docs = await q.to_list(length=limit)
        items = [parse_from_mongo(d) for d in docs]
        total = await db.activities.count_documents({})
        # Convert datetime back to iso for JSON safety
        def ensure_json_safe(doc: Dict[str, Any]) -> Dict[str, Any]:
            out = doc.copy()
            for k in ["start_time", "created_at", "updated_at"]:
                v = out.get(k)
                if isinstance(v, datetime):
                    out[k] = v.isoformat()
            return out
        safe_items = [ensure_json_safe(i) for i in items]
        return APIResponse(success=True, data={"items": safe_items, "total": total, "limit": limit, "offset": offset}, message="OK")
    except Exception as e:
        logging.exception("list_activities failed")
        raise HTTPException(status_code=500, detail=str(e))


@api.get("/activities/{activity_id}", response_model=APIResponse)
async def get_activity(activity_id: str) -> APIResponse:
    try:
        doc = await db.activities.find_one({"id": activity_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Activity not found")
        item = parse_from_mongo(doc)
        for k in ["start_time", "created_at", "updated_at"]:
            if isinstance(item.get(k), datetime):
                item[k] = item[k].isoformat()
        return APIResponse(success=True, data={"activity": item}, message="OK")
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("get_activity failed")
        raise HTTPException(status_code=500, detail=str(e))


# ---- Contact Email (Gmail SMTP placeholder) ----
import smtplib
from email.mime.text import MIMEText


def _send_gmail_email(to_email: str, subject: str, body: str) -> bool:
    """
    Attempts to send email using Gmail SMTP. Requires EMAIL_USER and EMAIL_PASS in backend/.env
    TODO: Ask user to create Gmail App Password and set EMAIL_USER, EMAIL_PASS in backend/.env then restart backend.
    """
    email_user = os.environ.get("EMAIL_USER")
    email_pass = os.environ.get("EMAIL_PASS")
    if not email_user or not email_pass:
        return False
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = email_user
        msg['To'] = to_email
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(email_user, email_pass)
            server.sendmail(email_user, [to_email], msg.as_string())
        return True
    except Exception:
        logging.exception("SMTP send failed")
        return False


@api.post("/contact", response_model=APIResponse)
async def contact_us(payload: ContactMessage) -> APIResponse:
    sent = _send_gmail_email(
        to_email=payload.email,
        subject=f"Go VV Contact: {payload.subject}",
        body=payload.message,
    )
    if sent:
        return APIResponse(success=True, data=None, message="Email sent")
    else:
        # Not failing hard; guiding user to configure
        return APIResponse(success=False, data=None, message="Email not sent. TODO: Configure EMAIL_USER and EMAIL_PASS (Gmail App Password) in backend/.env and restart backend.")


# Register API router
app.include_router(api)


# Graceful shutdown
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()