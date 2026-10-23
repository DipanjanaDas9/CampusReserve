
from contextlib import closing
from pathlib import Path
import hashlib
import hmac
import re
import secrets
import sqlite3
import jwt
from datetime import datetime, timedelta, timezone, time
from zoneinfo import ZoneInfo
from fastapi import HTTPException
import json
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Literal



app = FastAPI(title="Campus Reservation API")

# Store the database next to this Python file.
DATABASE_PATH = Path(__file__).resolve().parent / "campusreserve.db"

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

        # Create users table
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

        # Create facilities table
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS facilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                capacity INTEGER NOT NULL CHECK (capacity > 0),
                equipment TEXT NOT NULL DEFAULT '[]',
                location TEXT,
                opening_time TEXT,
                closing_time TEXT,
                restrictions TEXT
            )
            """
        )

        # Check whether the users table has a role column
        columns = connection.execute(
            "PRAGMA table_info(users)"
        ).fetchall()

        column_names = [column["name"] for column in columns]

        # Add role column if it doesn't exist
        if "role" not in column_names:
            connection.execute(
                """
                ALTER TABLE users
                ADD COLUMN role TEXT NOT NULL DEFAULT 'student'
                CHECK (role IN ('student', 'admin'))
                """
            )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                facility_id INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending',
                        'approved',
                        'denied',
                        'cancelled'
                    )),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (facility_id) REFERENCES facilities(id),

                CHECK (start_time < end_time)
            )
            """
        )
        reservation_columns = connection.execute(
        "PRAGMA table_info(reservations)"
        ).fetchall()

        column_names = [column["name"] for column in reservation_columns]

        if "checked_in_at" not in column_names:
            connection.execute(
            """
            ALTER TABLE reservations
            ADD COLUMN checked_in_at TEXT
            """
            )
        

        connection.commit()


# Create the table when the application starts.
initialize_database()

class FacilityRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(gt=0)
    equipment: list[str] = Field(default_factory=list)
    location: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    restrictions: str | None = None

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

class LoginRequest(BaseModel):
    email: str
    password: str

class ReservationRequest(BaseModel):
    facility_id: int = Field(gt=0)
    start_time: datetime
    end_time: datetime

class ReservationDecision(BaseModel):
    status: Literal["approved", "denied"]

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

CAMPUS_TIMEZONE = ZoneInfo("America/Chicago")


def parse_facility_time(value: str) -> time:
    """Support existing 24-hour and AM/PM facility times."""

    for format_string in ("%H:%M", "%I:%M%p", "%I:%M %p"):
        try:
            return datetime.strptime(
                value.strip(), format_string
            ).time()
        except ValueError:
            continue

    raise HTTPException(
        status_code=400,
        detail=f"Invalid facility operating time: {value}"
    )


def validate_facility_hours(facility, start, end):
    # Facilities must have configured opening/closing hours.
    if not facility["opening_time"] or not facility["closing_time"]:
        raise HTTPException(
            status_code=409,
            detail="Facility operating hours are not configured"
        )

    opening = parse_facility_time(facility["opening_time"])
    closing = parse_facility_time(facility["closing_time"])

    local_start = start.astimezone(CAMPUS_TIMEZONE)
    local_end = end.astimezone(CAMPUS_TIMEZONE)

    # First version supports same-day facilities only.
    if opening >= closing:
        raise HTTPException(
            status_code=409,
            detail="Overnight facility hours are not yet supported"
        )

    # Prevent bookings crossing midnight.
    if local_start.date() != local_end.date():
        raise HTTPException(
            status_code=409,
            detail="Reservations must start and end on the same campus day"
        )

    if (
        local_start.time() < opening
        or local_end.time() > closing
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Reservation is outside facility operating hours. "
                f"Available hours: {opening.strftime('%H:%M')} "
                f"to {closing.strftime('%H:%M')}"
            )
        )


@app.get("/")
def home():
    return {"message": "Campus Reservation API is running!"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/facilities")
def get_facilities():
    with closing(get_connection()) as connection:
        facilities = connection.execute(
            "SELECT * FROM facilities ORDER BY id"
        ).fetchall()

    return [
        {
            "id": facility["id"],
            "name": facility["name"],
            "capacity": facility["capacity"],
            "equipment": json.loads(facility["equipment"]),
            "location": facility["location"],
            "opening_time": facility["opening_time"],
            "closing_time": facility["closing_time"],
            "restrictions": facility["restrictions"],
        }
        for facility in facilities
    ]

@app.get("/facilities/{facility_id}")
def get_facility(facility_id: int):
    with closing(get_connection()) as connection:
        facility = connection.execute(
            "SELECT * FROM facilities WHERE id = ?",
            (facility_id,),
        ).fetchone()

    if facility is None:
        raise HTTPException(
            status_code=404,
            detail="Facility not found",
        )

    return {
        "id": facility["id"],
        "name": facility["name"],
        "capacity": facility["capacity"],
        "equipment": json.loads(facility["equipment"]),
        "location": facility["location"],
        "opening_time": facility["opening_time"],
        "closing_time": facility["closing_time"],
        "restrictions": facility["restrictions"],
    }

SECRET_KEY = secrets.token_hex(32)
ALGORITHM = "HS256"
security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = int(payload["sub"])

    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    with closing(get_connection()) as connection:
        user = connection.execute(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return dict(user)

def require_admin(
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required"
        )

    return current_user



@app.get("/auth/me")
def get_my_profile(
    current_user: dict = Depends(get_current_user)
):
    return current_user

@app.post("/facilities", status_code=201)
def create_facility(facility: FacilityRequest,
    admin: dict = Depends(require_admin)):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            """
            INSERT INTO facilities
            (name, capacity, equipment, location,
             opening_time, closing_time, restrictions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                facility.name,
                facility.capacity,
                json.dumps(facility.equipment),
                facility.location,
                facility.opening_time,
                facility.closing_time,
                facility.restrictions,
            ),
        )

        connection.commit()
        facility_id = cursor.lastrowid

    return {
        "message": "Facility created successfully",
        "facility": {
            "id": facility_id,
            **facility.model_dump(),
        },
    }

@app.delete("/facilities/{facility_id}")
def delete_facility(facility_id: int,
    admin: dict = Depends(require_admin)):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            "DELETE FROM facilities WHERE id = ?",
            (facility_id,),
        )

        connection.commit()

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Facility not found",
            )

    return {
        "message": "Facility deleted successfully",
        "facility_id": facility_id,
    }

@app.post("/auth/login")
def login(request: LoginRequest):
    email = request.email.strip().lower()

    with closing(get_connection()) as connection:
        user = connection.execute(
        "SELECT id, name, email, role, password_hash FROM users WHERE email = ?",            
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

@app.put("/facilities/{facility_id}")
def update_facility(facility_id: int,
    facility: FacilityRequest,
    admin: dict = Depends(require_admin)):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            """
            UPDATE facilities
            SET name = ?,
                capacity = ?,
                equipment = ?,
                location = ?,
                opening_time = ?,
                closing_time = ?,
                restrictions = ?
            WHERE id = ?
            """,
            (
                facility.name,
                facility.capacity,
                json.dumps(facility.equipment),
                facility.location,
                facility.opening_time,
                facility.closing_time,
                facility.restrictions,
                facility_id,
            ),
        )

        connection.commit()

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Facility not found",
            )

    return {
        "message": "Facility updated successfully",
        "facility": {
            "id": facility_id,
            **facility.model_dump(),
        },
    }

@app.post("/reservations", status_code=201)
def create_reservation(
    reservation: ReservationRequest,
    current_user: dict = Depends(get_current_user)
):
    start = reservation.start_time
    end = reservation.end_time

    # Require timezone-aware dates
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(
            status_code=400,
            detail="Start and end times must include a timezone"
        )

    # Convert both dates to UTC
    start = start.astimezone(timezone.utc)
    end = end.astimezone(timezone.utc)

    # Validate reservation times
    if start <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="Reservation must be in the future"
        )

    if end <= start:
        raise HTTPException(
            status_code=400,
            detail="End time must be after start time"
        )

    start_str = start.isoformat()
    end_str = end.isoformat()

    with closing(get_connection()) as connection:
        try:
            # Lock before checking availability to avoid
            # simultaneous requests booking the same room.
            connection.execute("BEGIN IMMEDIATE")

            facility = connection.execute(
                """
                SELECT id, opening_time, closing_time
                FROM facilities
                WHERE id = ?
                """,
                (reservation.facility_id,)
            ).fetchone()

            if facility is None:
                raise HTTPException(
                    status_code=404,
                    detail="Facility not found"
                )

            # Check room operating hours before checking booking conflicts.
            validate_facility_hours(facility, start, end)

            # Check for overlapping reservations
            conflict = connection.execute(
                """
                SELECT id FROM reservations
                WHERE facility_id = ?
                  AND status IN ('pending', 'approved')
                  AND start_time < ?
                  AND end_time > ?
                LIMIT 1
                """,
                (
                    reservation.facility_id,
                    end_str,
                    start_str,
                )
            ).fetchone()

            if conflict:
                raise HTTPException(
                    status_code=409,
                    detail="Facility already reserved for this time"
                )

            cursor = connection.execute(
                """
                INSERT INTO reservations
                (user_id, facility_id, start_time, end_time)
                VALUES (?, ?, ?, ?)
                """,
                (
                    current_user["id"],
                    reservation.facility_id,
                    start_str,
                    end_str,
                )
            )

            connection.commit()
            reservation_id = cursor.lastrowid

        except Exception:
            connection.rollback()
            raise

    return {
        "message": "Reservation requested successfully",
        "reservation": {
            "id": reservation_id,
            "user_id": current_user["id"],
            "facility_id": reservation.facility_id,
            "start_time": start_str,
            "end_time": end_str,
            "status": "pending"
        }
    }

@app.get("/reservations/me")
def get_my_reservations(
    current_user: dict = Depends(get_current_user)
):
    with closing(get_connection()) as connection:
        reservations = connection.execute(
            """
            SELECT
                r.id,
                r.facility_id,
                f.name AS facility_name,
                r.start_time,
                r.end_time,
                r.status,
                r.checked_in_at,
                r.created_at
            FROM reservations r
            JOIN facilities f ON r.facility_id = f.id
            WHERE r.user_id = ?
            ORDER BY r.start_time DESC
            """,
            (current_user["id"],)
        ).fetchall()

    return [dict(reservation) for reservation in reservations]

@app.patch("/reservations/{reservation_id}/decision")
def decide_reservation(
    reservation_id: int,
    decision: ReservationDecision,
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")

            reservation = connection.execute(
                """
                SELECT id, status
                FROM reservations
                WHERE id = ?
                """,
                (reservation_id,)
            ).fetchone()

            if reservation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Reservation not found"
                )

            if reservation["status"] != "pending":
                raise HTTPException(
                    status_code=409,
                    detail="Only pending reservations can be reviewed"
                )

            connection.execute(
                """
                UPDATE reservations
                SET status = ?
                WHERE id = ?
                """,
                (decision.status, reservation_id)
            )

            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "message": f"Reservation {decision.status} successfully",
        "reservation_id": reservation_id,
        "status": decision.status
    }

@app.patch("/reservations/{reservation_id}/cancel")
def cancel_reservation(
    reservation_id: int,
    current_user: dict = Depends(get_current_user)
):
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")

            reservation = connection.execute(
                """
                SELECT id, user_id, status
                FROM reservations
                WHERE id = ?
                """,
                (reservation_id,)
            ).fetchone()

            if reservation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Reservation not found"
                )

            # Only the reservation owner can cancel it
            if reservation["user_id"] != current_user["id"]:
                raise HTTPException(
                    status_code=403,
                    detail="You can only cancel your own reservations"
                )

            # Only pending or approved reservations can be cancelled
            if reservation["status"] not in ("pending", "approved"):
                raise HTTPException(
                    status_code=409,
                    detail="This reservation cannot be cancelled"
                )

            connection.execute(
                """
                UPDATE reservations
                SET status = 'cancelled'
                WHERE id = ?
                """,
                (reservation_id,)
            )

            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "message": "Reservation cancelled successfully",
        "reservation_id": reservation_id,
        "status": "cancelled"
    }

@app.patch("/reservations/{reservation_id}/check-in")
def check_in_reservation(
    reservation_id: int,
    current_user: dict = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)

    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")

            reservation = connection.execute(
                """
                SELECT id, user_id, status,
                       start_time, end_time, checked_in_at
                FROM reservations
                WHERE id = ?
                """,
                (reservation_id,)
            ).fetchone()

            if reservation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Reservation not found"
                )

            if reservation["user_id"] != current_user["id"]:
                raise HTTPException(
                    status_code=403,
                    detail="You can only check in to your own reservations"
                )

            if reservation["status"] != "approved":
                raise HTTPException(
                    status_code=409,
                    detail="Only approved reservations allow check-in"
                )

            if reservation["checked_in_at"] is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Already checked in"
                )

            start = datetime.fromisoformat(reservation["start_time"])
            end = datetime.fromisoformat(reservation["end_time"])

            # Allow check-in 15 minutes before the booking begins.
            if not (start - timedelta(minutes=15) <= now < end):
                raise HTTPException(
                    status_code=409,
                    detail="Check-in is not available at this time"
                )

            checked_in_at = now.isoformat()

            connection.execute(
                """
                UPDATE reservations
                SET checked_in_at = ?
                WHERE id = ?
                """,
                (checked_in_at, reservation_id)
            )

            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "message": "Checked in successfully",
        "reservation_id": reservation_id,
        "status": "approved",
        "checked_in_at": checked_in_at
    }