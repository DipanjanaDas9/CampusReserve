
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


# Pending requests hold their time slot so two students cannot request the same hour.
BLOCKING_STATUSES = ("pending", "approved")

RESERVATIONS_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS {table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL REFERENCES rooms(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        purpose TEXT NOT NULL DEFAULT '',
        attendees INTEGER NOT NULL DEFAULT 1 CHECK (attendees > 0),
        notes TEXT NOT NULL DEFAULT '',
        decision_reason TEXT NOT NULL DEFAULT '',
        checked_in_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (start_time < end_time)
    )
"""


def table_columns(connection, table: str) -> set[str]:
    return {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}


def add_column_if_missing(connection, table: str, column: str, definition: str):
    if column not in table_columns(connection, table):
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def migrate_reservations_table(connection):
    """Upgrade the Sprint 4 reservations table ('active'/'cancelled') to the approval workflow."""
    columns = table_columns(connection, "reservations")
    if not columns or "purpose" in columns:
        return
    connection.execute(RESERVATIONS_TABLE_SQL.format(table="reservations_new"))
    connection.execute(
        """
        INSERT INTO reservations_new (id, room_id, user_id, start_time, end_time, status)
        SELECT id, room_id, user_id, start_time, end_time,
               CASE status WHEN 'active' THEN 'approved' ELSE status END
        FROM reservations
        """
    )
    connection.execute("DROP TABLE reservations")
    connection.execute("ALTER TABLE reservations_new RENAME TO reservations")


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
        add_column_if_missing(
            connection,
            "users",
            "role",
            "TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin'))",
        )
        add_column_if_missing(connection, "rooms", "description", "TEXT NOT NULL DEFAULT ''")
        migrate_reservations_table(connection)
        connection.execute(RESERVATIONS_TABLE_SQL.format(table="reservations"))
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                kind TEXT NOT NULL
                    CHECK (kind IN ('submitted', 'approved', 'rejected', 'cancelled', 'checked_in', 'system')),
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                reservation_id INTEGER REFERENCES reservations(id),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                read_at TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_notifications_user
            ON notifications (user_id, created_at)
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
    with closing(get_connection()) as connection:
        rows = connection.execute("SELECT * FROM rooms ORDER BY name").fetchall()
    return [room_from_row(row) for row in rows]


def room_from_row(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "capacity": row["capacity"],
        "location": row["location"],
        "equipment": json.loads(row["equipment"]),
        "description": row["description"],
        "is_sample": bool(row["is_sample"]),
    }


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
                    AND reservations.status IN ('pending', 'approved')
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
        campus_today = datetime.now(get_campus_timezone()).date()
        requirements = extract_room_requirements(
            request.query,
            reference_date=campus_today,
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
        if search_date < campus_today:
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


# Set CAMPUSRESERVE_SECRET_KEY so tokens survive a server restart; a random
# key is used otherwise (every restart then signs everyone out).
SECRET_KEY = os.environ.get("CAMPUSRESERVE_SECRET_KEY") or secrets.token_hex(32)
ALGORITHM = "HS256"


@app.post("/auth/login")
def login(request: LoginRequest):
    email = request.email.strip().lower()

    with closing(get_connection()) as connection:
        user = connection.execute(
            "SELECT id, name, email, password_hash, role FROM users WHERE email = ?",
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
            "role": user["role"],
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


# ---------------------------------------------------------------------------
# Rooms, availability, reservations, check-in, notifications and admin.
# ---------------------------------------------------------------------------

# Bookable hours shown on the availability calendar (campus local time).
OPENING_HOUR = 8
CLOSING_HOUR = 19
# Students may check in from 15 minutes before to 30 minutes after the start.
CHECK_IN_OPENS_BEFORE = timedelta(minutes=15)
CHECK_IN_CLOSES_AFTER = timedelta(minutes=30)
MAX_AVAILABILITY_DAYS = 31


class ReservationRequest(BaseModel):
    room_id: int
    booking_date: date = Field(alias="date")
    start_time: time
    end_time: time
    purpose: str = Field(min_length=1, max_length=200)
    attendees: int = Field(ge=1, le=10000)
    notes: str = Field(default="", max_length=1000)


class DecisionRequest(BaseModel):
    reason: str = Field(default="", max_length=500)


class RoomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(ge=1, le=10000)
    location: str = Field(min_length=1, max_length=200)
    equipment: list[str] = Field(default_factory=list, max_length=20)
    description: str = Field(default="", max_length=1000)


def require_admin(user_id: int = Depends(get_current_user)) -> int:
    with closing(get_connection()) as connection:
        row = connection.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None or row["role"] != "admin":
        raise HTTPException(status_code=403, detail="Administrator access required.")
    return user_id


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_utc(text: str) -> datetime:
    return datetime.fromisoformat(text)


def get_room_or_404(connection, room_id: int):
    row = connection.execute("SELECT * FROM rooms WHERE id = ?", (room_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Room not found.")
    return row


def notify(connection, user_id: int, kind: str, title: str, body: str, reservation_id: int | None = None):
    connection.execute(
        """
        INSERT INTO notifications (user_id, kind, title, body, reservation_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, kind, title, body, reservation_id),
    )


RESERVATION_SELECT = """
    SELECT reservations.*, rooms.name AS room_name, rooms.location AS room_location,
           users.name AS user_name, users.email AS user_email
    FROM reservations
    JOIN rooms ON rooms.id = reservations.room_id
    JOIN users ON users.id = reservations.user_id
"""


def describe_slot(start: datetime, end: datetime, campus_zone: ZoneInfo) -> str:
    local_start = start.astimezone(campus_zone)
    local_end = end.astimezone(campus_zone)
    return f"{local_start:%a %b} {local_start.day}, {local_start:%H:%M}–{local_end:%H:%M}"


def reservation_from_row(row, campus_zone: ZoneInfo, now: datetime) -> dict:
    start = parse_utc(row["start_time"])
    end = parse_utc(row["end_time"])
    local_start = start.astimezone(campus_zone)
    local_end = end.astimezone(campus_zone)
    check_in_opens = start - CHECK_IN_OPENS_BEFORE
    check_in_closes = start + CHECK_IN_CLOSES_AFTER
    approved = row["status"] == "approved"
    return {
        "id": row["id"],
        "room": {"id": row["room_id"], "name": row["room_name"], "location": row["room_location"]},
        "user": {"id": row["user_id"], "name": row["user_name"], "email": row["user_email"]},
        "date": local_start.date().isoformat(),
        "start_time": local_start.strftime("%H:%M"),
        "end_time": local_end.strftime("%H:%M"),
        "start_utc": row["start_time"],
        "end_utc": row["end_time"],
        "status": row["status"],
        "purpose": row["purpose"],
        "attendees": row["attendees"],
        "notes": row["notes"],
        "decision_reason": row["decision_reason"],
        "checked_in_at": row["checked_in_at"],
        "created_at": row["created_at"],
        "is_past": end <= now,
        "can_cancel": row["status"] in BLOCKING_STATUSES and start > now,
        "check_in_window": {
            "opens": check_in_opens.astimezone(campus_zone).strftime("%H:%M"),
            "closes": check_in_closes.astimezone(campus_zone).strftime("%H:%M"),
        },
        "can_check_in": approved and row["checked_in_at"] is None and check_in_opens <= now <= check_in_closes,
        "is_no_show": approved and row["checked_in_at"] is None and now > check_in_closes,
    }


def has_conflict(connection, room_id: int, start_text: str, end_text: str, exclude_id: int | None = None) -> bool:
    return connection.execute(
        """
        SELECT 1 FROM reservations
        WHERE room_id = ?
          AND status IN ('pending', 'approved')
          AND start_time < ?
          AND end_time > ?
          AND id != ?
        LIMIT 1
        """,
        (room_id, end_text, start_text, exclude_id or -1),
    ).fetchone() is not None


@app.get("/rooms")
def list_rooms(_user_id: int = Depends(get_current_user)):
    return get_facilities()


@app.get("/rooms/{room_id}")
def get_room(room_id: int, _user_id: int = Depends(get_current_user)):
    with closing(get_connection()) as connection:
        return room_from_row(get_room_or_404(connection, room_id))


@app.get("/rooms/{room_id}/availability")
def get_room_availability(
    room_id: int,
    start: date = Query(),
    end: date = Query(),
    _user_id: int = Depends(get_current_user),
):
    """Hourly slots (campus local time) between start and end dates, inclusive."""
    if end < start:
        raise HTTPException(status_code=422, detail="end must be on or after start.")
    if (end - start).days >= MAX_AVAILABILITY_DAYS:
        raise HTTPException(status_code=422, detail=f"Request at most {MAX_AVAILABILITY_DAYS} days at a time.")
    campus_zone = get_campus_timezone()
    range_start = datetime.combine(start, time(0), campus_zone).astimezone(timezone.utc)
    range_end = datetime.combine(end + timedelta(days=1), time(0), campus_zone).astimezone(timezone.utc)

    with closing(get_connection()) as connection:
        get_room_or_404(connection, room_id)
        busy = [
            (parse_utc(row["start_time"]), parse_utc(row["end_time"]))
            for row in connection.execute(
                """
                SELECT start_time, end_time FROM reservations
                WHERE room_id = ? AND status IN ('pending', 'approved')
                  AND start_time < ? AND end_time > ?
                """,
                (room_id, range_end.isoformat(timespec="seconds"), range_start.isoformat(timespec="seconds")),
            )
        ]

    now = utc_now()
    slots = []
    day = start
    while day <= end:
        for hour in range(OPENING_HOUR, CLOSING_HOUR):
            slot_start = datetime.combine(day, time(hour), campus_zone).astimezone(timezone.utc)
            slot_end = slot_start + timedelta(hours=1)
            if any(b_start < slot_end and b_end > slot_start for b_start, b_end in busy):
                status = "booked"
            elif slot_start < now:
                status = "past"
            else:
                status = "available"
            slots.append({"date": day.isoformat(), "hour": hour, "status": status})
        day += timedelta(days=1)
    return slots


@app.post("/reservations", status_code=201)
def create_reservation(request: ReservationRequest, user_id: int = Depends(get_current_user)):
    campus_zone = get_campus_timezone()
    start = local_time_to_utc(request.booking_date, request.start_time, campus_zone)
    end = local_time_to_utc(request.booking_date, request.end_time, campus_zone)
    if end <= start:
        raise HTTPException(status_code=422, detail="End time must be later than start time.")
    if start <= utc_now():
        raise HTTPException(status_code=422, detail="Reservations must start in the future.")
    if request.start_time < time(OPENING_HOUR) or request.end_time > time(CLOSING_HOUR) or request.end_time == time(0):
        raise HTTPException(
            status_code=422,
            detail=f"Reservations must be between {OPENING_HOUR:02d}:00 and {CLOSING_HOUR:02d}:00.",
        )
    start_text = start.isoformat(timespec="seconds")
    end_text = end.isoformat(timespec="seconds")

    with closing(get_connection()) as connection:
        # IMMEDIATE takes the write lock before the conflict check, so two
        # simultaneous requests for the same slot cannot both succeed.
        connection.execute("BEGIN IMMEDIATE")
        try:
            room = get_room_or_404(connection, request.room_id)
            if request.attendees > room["capacity"]:
                raise HTTPException(
                    status_code=422,
                    detail=f"{room['name']} holds at most {room['capacity']} people.",
                )
            if has_conflict(connection, request.room_id, start_text, end_text):
                raise HTTPException(status_code=409, detail="This time slot is no longer available.")
            cursor = connection.execute(
                """
                INSERT INTO reservations (room_id, user_id, start_time, end_time, purpose, attendees, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.room_id,
                    user_id,
                    start_text,
                    end_text,
                    request.purpose.strip(),
                    request.attendees,
                    request.notes.strip(),
                ),
            )
            reservation_id = cursor.lastrowid
            notify(
                connection,
                user_id,
                "submitted",
                "Reservation request submitted",
                f"{room['name']}, {describe_slot(start, end, campus_zone)} is waiting for approval.",
                reservation_id,
            )
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        row = connection.execute(RESERVATION_SELECT + " WHERE reservations.id = ?", (reservation_id,)).fetchone()
    return reservation_from_row(row, campus_zone, utc_now())


@app.get("/reservations/me")
def list_my_reservations(user_id: int = Depends(get_current_user)):
    campus_zone = get_campus_timezone()
    now = utc_now()
    with closing(get_connection()) as connection:
        rows = connection.execute(
            RESERVATION_SELECT + " WHERE reservations.user_id = ? ORDER BY reservations.start_time DESC",
            (user_id,),
        ).fetchall()
    return [reservation_from_row(row, campus_zone, now) for row in rows]


def get_own_reservation(connection, reservation_id: int, user_id: int):
    row = connection.execute(
        RESERVATION_SELECT + " WHERE reservations.id = ? AND reservations.user_id = ?",
        (reservation_id, user_id),
    ).fetchone()
    # Another student's reservation is reported as missing, not forbidden,
    # so IDs cannot be probed.
    if row is None:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    return row


@app.post("/reservations/{reservation_id}/cancel")
def cancel_reservation(reservation_id: int, user_id: int = Depends(get_current_user)):
    campus_zone = get_campus_timezone()
    now = utc_now()
    with closing(get_connection()) as connection:
        row = get_own_reservation(connection, reservation_id, user_id)
        if not reservation_from_row(row, campus_zone, now)["can_cancel"]:
            raise HTTPException(status_code=409, detail="Only upcoming pending or approved reservations can be cancelled.")
        connection.execute("UPDATE reservations SET status = 'cancelled' WHERE id = ?", (reservation_id,))
        notify(
            connection,
            user_id,
            "cancelled",
            "Reservation cancelled",
            f"{row['room_name']}, {describe_slot(parse_utc(row['start_time']), parse_utc(row['end_time']), campus_zone)} was cancelled.",
            reservation_id,
        )
        connection.commit()
        row = get_own_reservation(connection, reservation_id, user_id)
    return reservation_from_row(row, campus_zone, utc_now())


@app.post("/reservations/{reservation_id}/check-in")
def check_in(reservation_id: int, user_id: int = Depends(get_current_user)):
    campus_zone = get_campus_timezone()
    now = utc_now()
    with closing(get_connection()) as connection:
        row = get_own_reservation(connection, reservation_id, user_id)
        reservation = reservation_from_row(row, campus_zone, now)
        if row["status"] != "approved":
            raise HTTPException(status_code=409, detail="Only approved reservations can be checked in.")
        if row["checked_in_at"] is not None:
            raise HTTPException(status_code=409, detail="You have already checked in.")
        if not reservation["can_check_in"]:
            window = reservation["check_in_window"]
            raise HTTPException(
                status_code=409,
                detail=f"Check-in is open from {window['opens']} to {window['closes']} on {reservation['date']}.",
            )
        connection.execute(
            "UPDATE reservations SET checked_in_at = ? WHERE id = ?",
            (now.isoformat(timespec="seconds"), reservation_id),
        )
        notify(connection, user_id, "checked_in", "Checked in", f"You checked in to {row['room_name']}.", reservation_id)
        connection.commit()
        row = get_own_reservation(connection, reservation_id, user_id)
    return reservation_from_row(row, campus_zone, utc_now())


@app.get("/notifications/me")
def list_my_notifications(user_id: int = Depends(get_current_user)):
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT id, kind, title, body, reservation_id, created_at, read_at
            FROM notifications WHERE user_id = ?
            ORDER BY created_at DESC, id DESC LIMIT 100
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) | {"read": row["read_at"] is not None} for row in rows]


@app.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, user_id: int = Depends(get_current_user)):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            "UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?",
            (utc_now().isoformat(timespec="seconds"), notification_id, user_id),
        )
        connection.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"id": notification_id, "read": True}


@app.post("/notifications/read-all")
def mark_all_notifications_read(user_id: int = Depends(get_current_user)):
    with closing(get_connection()) as connection:
        connection.execute(
            "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
            (utc_now().isoformat(timespec="seconds"), user_id),
        )
        connection.commit()
    return {"read": True}


@app.get("/admin/reservations")
def admin_list_reservations(
    status: str | None = Query(default=None, pattern="^(pending|approved|rejected|cancelled)$"),
    _admin_id: int = Depends(require_admin),
):
    campus_zone = get_campus_timezone()
    now = utc_now()
    query = RESERVATION_SELECT
    params: tuple = ()
    if status:
        query += " WHERE reservations.status = ?"
        params = (status,)
    with closing(get_connection()) as connection:
        rows = connection.execute(query + " ORDER BY reservations.start_time", params).fetchall()
    return [reservation_from_row(row, campus_zone, now) for row in rows]


def decide_reservation(reservation_id: int, new_status: str, reason: str) -> dict:
    campus_zone = get_campus_timezone()
    with closing(get_connection()) as connection:
        row = connection.execute(RESERVATION_SELECT + " WHERE reservations.id = ?", (reservation_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Reservation not found.")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"This reservation is already {row['status']}.")
        start = parse_utc(row["start_time"])
        if new_status == "approved" and start <= utc_now():
            raise HTTPException(status_code=409, detail="This reservation has already started and can no longer be approved.")
        connection.execute(
            "UPDATE reservations SET status = ?, decision_reason = ? WHERE id = ?",
            (new_status, reason.strip(), reservation_id),
        )
        slot = f"{row['room_name']}, {describe_slot(start, parse_utc(row['end_time']), campus_zone)}"
        if new_status == "approved":
            notify(connection, row["user_id"], "approved", "Reservation approved", f"{slot} is confirmed.", reservation_id)
        else:
            suffix = f" Reason: {reason.strip()}" if reason.strip() else ""
            notify(connection, row["user_id"], "rejected", "Reservation declined", f"{slot} was declined.{suffix}", reservation_id)
        connection.commit()
        row = connection.execute(RESERVATION_SELECT + " WHERE reservations.id = ?", (reservation_id,)).fetchone()
    return reservation_from_row(row, campus_zone, utc_now())


@app.post("/admin/reservations/{reservation_id}/approve")
def admin_approve_reservation(reservation_id: int, _admin_id: int = Depends(require_admin)):
    return decide_reservation(reservation_id, "approved", "")


@app.post("/admin/reservations/{reservation_id}/reject")
def admin_reject_reservation(
    reservation_id: int,
    request: DecisionRequest,
    _admin_id: int = Depends(require_admin),
):
    return decide_reservation(reservation_id, "rejected", request.reason)


@app.get("/admin/stats")
def admin_stats(_admin_id: int = Depends(require_admin)):
    campus_zone = get_campus_timezone()
    now = utc_now()
    local_today = now.astimezone(campus_zone).date()
    today_start = datetime.combine(local_today, time(0), campus_zone).astimezone(timezone.utc)
    today_end = today_start + timedelta(days=1)
    no_show_cutoff = (now - CHECK_IN_CLOSES_AFTER).isoformat(timespec="seconds")
    with closing(get_connection()) as connection:
        def count(sql, params=()):
            return connection.execute(sql, params).fetchone()[0]

        return {
            "pending": count("SELECT COUNT(*) FROM reservations WHERE status = 'pending'"),
            "approved_today": count(
                "SELECT COUNT(*) FROM reservations WHERE status = 'approved' AND start_time >= ? AND start_time < ?",
                (today_start.isoformat(timespec="seconds"), today_end.isoformat(timespec="seconds")),
            ),
            "upcoming_approved": count(
                "SELECT COUNT(*) FROM reservations WHERE status = 'approved' AND start_time > ?",
                (now.isoformat(timespec="seconds"),),
            ),
            "no_shows": count(
                "SELECT COUNT(*) FROM reservations WHERE status = 'approved' AND checked_in_at IS NULL AND start_time < ?",
                (no_show_cutoff,),
            ),
            "rooms": count("SELECT COUNT(*) FROM rooms"),
            "students": count("SELECT COUNT(*) FROM users WHERE role = 'student'"),
        }


def clean_equipment(items: list[str]) -> list[str]:
    cleaned = []
    for item in items:
        item = item.strip()
        if item and item.casefold() not in {existing.casefold() for existing in cleaned}:
            cleaned.append(item)
    return cleaned


@app.post("/admin/rooms", status_code=201)
def admin_create_room(request: RoomRequest, _admin_id: int = Depends(require_admin)):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            """
            INSERT INTO rooms (name, capacity, location, equipment, description, is_sample)
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (
                request.name.strip(),
                request.capacity,
                request.location.strip(),
                json.dumps(clean_equipment(request.equipment)),
                request.description.strip(),
            ),
        )
        connection.commit()
        return room_from_row(get_room_or_404(connection, cursor.lastrowid))


@app.put("/admin/rooms/{room_id}")
def admin_update_room(room_id: int, request: RoomRequest, _admin_id: int = Depends(require_admin)):
    with closing(get_connection()) as connection:
        get_room_or_404(connection, room_id)
        largest_booking = connection.execute(
            """
            SELECT MAX(attendees) FROM reservations
            WHERE room_id = ? AND status IN ('pending', 'approved') AND end_time > ?
            """,
            (room_id, utc_now().isoformat(timespec="seconds")),
        ).fetchone()[0]
        if largest_booking and request.capacity < largest_booking:
            raise HTTPException(
                status_code=409,
                detail=f"An upcoming reservation needs room for {largest_booking} people.",
            )
        connection.execute(
            """
            UPDATE rooms SET name = ?, capacity = ?, location = ?, equipment = ?, description = ?
            WHERE id = ?
            """,
            (
                request.name.strip(),
                request.capacity,
                request.location.strip(),
                json.dumps(clean_equipment(request.equipment)),
                request.description.strip(),
                room_id,
            ),
        )
        connection.commit()
        return room_from_row(get_room_or_404(connection, room_id))


@app.delete("/admin/rooms/{room_id}", status_code=204)
def admin_delete_room(room_id: int, _admin_id: int = Depends(require_admin)):
    with closing(get_connection()) as connection:
        get_room_or_404(connection, room_id)
        if connection.execute("SELECT 1 FROM reservations WHERE room_id = ? LIMIT 1", (room_id,)).fetchone():
            raise HTTPException(status_code=409, detail="Rooms with reservation history cannot be deleted.")
        connection.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
        connection.commit()
