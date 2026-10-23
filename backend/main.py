
from contextlib import closing
import json
import os
from pathlib import Path
import hashlib
import hmac
import re
import secrets
import sqlite3
import jwt
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from backend.ai_service import (
    RoomSearchIntent,
    build_room_search_params,
    parse_room_search,
)
from backend.ai.extractor import extract_room_requirements
app = FastAPI(title="Campus Reservation API")
app = FastAPI(title="Campus Reservation API")
security = HTTPBearer(auto_error=False)

# Store the database next to this Python file.
DATABASE_PATH = Path(
    os.environ.get(
        "CAMPUSRESERVE_DB_PATH",
        Path(__file__).resolve().parent / "campusreserve.db",
    )
)

# Allow requests from the local React development server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    with closing(get_connection()) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                capacity INTEGER NOT NULL CHECK (capacity > 0),
                location TEXT NOT NULL,
                equipment TEXT NOT NULL DEFAULT '[]',
                is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1))
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER NOT NULL REFERENCES rooms(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'cancelled')),
                CHECK (start_time < end_time)
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_reservations_room_time_status
            ON reservations (room_id, status, start_time, end_time)
            """
        )
        room_count = connection.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
        if room_count == 0:
            connection.executemany(
                """
                INSERT INTO rooms (name, capacity, location, equipment, is_sample)
                VALUES (?, ?, ?, ?, 1)
                """,
                [
                    ("SAMPLE — Focus Room", 4, "Sample location", json.dumps(["Whiteboard"])),
                    ("SAMPLE — Collaboration Room", 8, "Sample location", json.dumps(["Whiteboard", "Projector"])),
                    ("SAMPLE — Computer Lab", 20, "Sample location", json.dumps(["Computers", "Projector"])),
                ],
            )
        connection.commit()


# Create the table when the application starts.
initialize_database()


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

class LoginRequest(BaseModel):
    email: str
    password: str



class AIRoomSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    search_date: date | None = Field(default=None, alias="date")
    start_time: time | None = None
    end_time: time | None = None


def hash_password(password: str) -> str:
    """Hash a password using PBKDF2 and a unique random salt."""
    salt = secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        600_000,
    )
    return f"{salt.hex()}:{password_hash.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a password against its stored hash."""
    try:
        salt_hex, expected_hash_hex = stored_hash.split(":")
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(expected_hash_hex)
    except (ValueError, TypeError):
        return False

    actual_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        600_000,
    )
    return hmac.compare_digest(actual_hash, expected_hash)


@app.get("/")
def home():
    return {"message": "Campus Reservation API is running!"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/facilities")
def get_facilities():
    return [
        {
            "id": 1,
            "name": "Study Room A",
            "capacity": 6,
            "equipment": ["Whiteboard", "Projector"],
        },
        {
            "id": 2,
            "name": "Computer Lab",
            "capacity": 25,
            "equipment": ["Computers", "Projector"],
        },
        {
            "id": 3,
            "name": "Practice Room",
            "capacity": 10,
            "equipment": ["Whiteboard"],
        },
    ]


def get_campus_timezone() -> ZoneInfo:
    """Get the explicitly configured campus timezone (IANA name)."""
    timezone_name = os.environ.get("CAMPUS_TIME_ZONE", "").strip()
    if not timezone_name:
        raise HTTPException(
            status_code=503,
            detail="Room search is not configured. Set CAMPUS_TIME_ZONE to the campus IANA time zone.",
        )
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        raise HTTPException(
            status_code=503,
            detail="CAMPUS_TIME_ZONE is not a recognized IANA time zone.",
        )


def local_time_to_utc(search_date: date, local_time: time, campus_zone: ZoneInfo) -> datetime:
    if local_time.tzinfo is not None:
        raise HTTPException(status_code=422, detail="Times must be local times without a UTC offset.")

    naive = datetime.combine(search_date, local_time)
    candidates = [naive.replace(tzinfo=campus_zone, fold=fold) for fold in (0, 1)]
    valid = [
        candidate
        for candidate in candidates
        if candidate.astimezone(timezone.utc).astimezone(campus_zone).replace(tzinfo=None) == naive
    ]
    if not valid:
        raise HTTPException(
            status_code=422,
            detail="This local time does not exist because of a daylight-saving time change.",
        )
    if len(valid) == 2 and valid[0].utcoffset() != valid[1].utcoffset():
        raise HTTPException(
            status_code=422,
            detail="This local time is ambiguous because of a daylight-saving time change.",
        )
    return valid[0].astimezone(timezone.utc)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> int:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")
    return user_id


@app.get("/rooms/search")
def search_rooms(
    search_date: date = Query(alias="date"),
    start_time: time = Query(),
    end_time: time = Query(),
    min_capacity: int = Query(ge=1, le=10000),
    equipment: list[str] = Query(default=[]),
    _user_id: int = Depends(get_current_user),
):
    campus_zone = get_campus_timezone()
    start_utc = local_time_to_utc(search_date, start_time, campus_zone)
    end_utc = local_time_to_utc(search_date, end_time, campus_zone)
    if search_date < datetime.now(campus_zone).date():
        raise HTTPException(status_code=422, detail="date must be today or a future date at the campus.")
    if end_utc <= start_utc:
        raise HTTPException(status_code=422, detail="end_time must be later than start_time.")

    required_equipment = {item.strip().casefold() for item in equipment}
    if "" in required_equipment:
        raise HTTPException(status_code=422, detail="Equipment values cannot be empty.")
    start_text = start_utc.isoformat(timespec="seconds")
    end_text = end_utc.isoformat(timespec="seconds")

    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT rooms.id, rooms.name, rooms.capacity, rooms.location,
                   rooms.equipment, rooms.is_sample
            FROM rooms
            WHERE rooms.capacity >= ?
              AND NOT EXISTS (
                  SELECT 1 FROM reservations
                  WHERE reservations.room_id = rooms.id
                    AND reservations.status = 'active'
                    AND reservations.start_time < ?
                    AND reservations.end_time > ?
              )
            ORDER BY rooms.capacity, rooms.name
            """,
            (min_capacity, end_text, start_text),
        ).fetchall()

    results = []
    for row in rows:
        room_equipment = json.loads(row["equipment"])
        if not required_equipment.issubset({item.casefold() for item in room_equipment}):
            continue
        results.append(
            {
                "id": row["id"],
                "name": row["name"],
                "capacity": row["capacity"],
                "location": row["location"],
                "equipment": room_equipment,
                "is_sample": bool(row["is_sample"]),
            }
        )
    return results


@app.post("/rooms/ai-search")
def ai_search_rooms(
    request: AIRoomSearchRequest,
    user_id: int = Depends(get_current_user),
):
    try:
        requirements = extract_room_requirements(
            request.query,
            reference_date=date.today(),
        )

        # Prefer dates and times extracted by Gemini.
        search_date = (
            date.fromisoformat(requirements.date)
            if requirements.date
            else request.search_date
        )
        start_time = (
            time.fromisoformat(requirements.start_time)
            if requirements.start_time
            else request.start_time
        )
        end_time = (
            time.fromisoformat(requirements.end_time)
            if requirements.end_time
            else request.end_time
        )

        # Validate the extracted booking date and time.
        if search_date < date.today():
            raise HTTPException(
                status_code=422,
                detail="The requested date must be today or a future date.",
            )

        if end_time <= start_time:
            raise HTTPException(
                status_code=422,
                detail="End time must be later than start time.",
            )

        intent = RoomSearchIntent(
            capacity=requirements.group_size,
            equipment=requirements.equipment,
        )

        params = build_room_search_params(
            intent,
            search_date=search_date.isoformat(),
            start_time=start_time.isoformat(),
            end_time=end_time.isoformat(),
        )

        results = search_rooms(
            search_date=search_date,
            start_time=start_time,
            end_time=end_time,
            min_capacity=params["min_capacity"],
            equipment=params.get("equipment", []),
            _user_id=user_id,
        )

        return {
            "query": request.query,
            "interpreted_requirements": requirements.model_dump(),
            "results": results,
        }

    except HTTPException:
        raise
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422,
            detail="The extracted room requirements are invalid. Please clarify your request.",
        ) from exc
    except Exception as exc:
        import logging
        logging.exception("AI room search failed")
        raise HTTPException(
            status_code=502,
            detail="The AI service could not process your request. Please try again.",
        ) from exc


SECRET_KEY = secrets.token_hex(32)
ALGORITHM = "HS256"


@app.post("/auth/login")
def login(request: LoginRequest):
    email = request.email.strip().lower()

    with closing(get_connection()) as connection:
        user = connection.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    if user is None or not verify_password(
        request.password, user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    token = jwt.encode(
        {
            "sub": str(user["id"]),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
        },
    }

@app.post("/auth/register", status_code=201)
def register_user(user: RegisterRequest):
    name = user.name.strip()
    email = user.email.strip().lower()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty.",
        )

    # Basic email-format validation.
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid email address.",
        )

    password_hash = hash_password(user.password)

    try:
        with closing(get_connection()) as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (name, email, password_hash),
            )
            connection.commit()
            user_id = cursor.lastrowid

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    return {
        "message": "Account created successfully.",
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
        },
    }
