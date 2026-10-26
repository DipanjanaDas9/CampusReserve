from contextlib import closing
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import get_connection
from app.core.dependencies import get_current_user
from app.schemas.reservation import ReservationRequest
from app.core.config import CAMPUS_TIMEZONE
from app.services.availability import validate_facility_hours

router = APIRouter(
    prefix="/reservations",
    tags=["Reservations"]
)
@router.get("/me")
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
                r.attendees,
                r.purpose,
                r.notes,
                r.created_at
                
            FROM reservations r
            JOIN facilities f ON r.facility_id = f.id
            WHERE r.user_id = ?
            ORDER BY r.start_time DESC
            """,
            (current_user["id"],)
        ).fetchall()

    return [dict(reservation) for reservation in reservations]

@router.post("", status_code=201)
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
                SELECT id, name, capacity, opening_time, closing_time
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
            if reservation.attendees > facility["capacity"]:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Room capacity is {facility['capacity']}, "
                        f"but {reservation.attendees} attendees were requested"
                    )
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
                (user_id, facility_id, start_time, end_time,attendees, purpose, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    current_user["id"],
                    reservation.facility_id,
                    start_str,
                    end_str,
                    reservation.attendees,
                    reservation.purpose.strip(),
                    reservation.notes,
                )
            )

            
            reservation_id = cursor.lastrowid

            connection.execute(
                """
                INSERT INTO notifications
                    (user_id, reservation_id, kind, title, body)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    current_user["id"],
                    reservation_id,
                    "system",
                    "Reservation request submitted",
                    (
                        f"Your reservation request for {facility['name']} "
                        "has been submitted and is awaiting administrator approval."
                    ),
                )
            )

            connection.commit()


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
            "attendees": reservation.attendees,
            "purpose": reservation.purpose.strip(),
            "notes": reservation.notes,
            "status": "pending"
        }
    }

@router.patch("/{reservation_id}/cancel")
def cancel_reservation(
    reservation_id: int,
    current_user: dict = Depends(get_current_user)
):
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")

            reservation = connection.execute(
                """
                SELECT
                    r.id,
                    r.user_id,
                    r.status,
                    f.name AS facility_name
                FROM reservations r
                JOIN facilities f ON r.facility_id = f.id
                WHERE r.id = ?
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

            connection.execute(
                """
                INSERT INTO notifications
                    (user_id, reservation_id, kind, title, body)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    current_user["id"],
                    reservation_id,
                    "cancelled",
                    "Reservation cancelled",
                    (
                        f"Your reservation for {reservation['facility_name']} "
                        "has been successfully cancelled."
                    ),
                )
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