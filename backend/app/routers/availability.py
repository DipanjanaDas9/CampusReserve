
from contextlib import closing
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from app.db.connection import get_connection
from app.services.availability import validate_facility_hours


router = APIRouter(
    prefix="/facilities",
    tags=["Availability"]
)


@router.get("/{facility_id}/availability")
def check_availability(
    facility_id: int,
    start_time: datetime,
    end_time: datetime,
    attendees: int | None = Query(default=None, ge=1),
):
    # Require timezone-aware timestamps.
    if (
        start_time.utcoffset() is None
        or end_time.utcoffset() is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Start and end times must include a timezone"
        )

    start = start_time.astimezone(timezone.utc)
    end = end_time.astimezone(timezone.utc)

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

    with closing(get_connection()) as connection:

        facility = connection.execute(
            """
            SELECT id, name, capacity, opening_time, closing_time
            FROM facilities
            WHERE id = ?
            """,
            (facility_id,),
        ).fetchone()

        if facility is None:
            raise HTTPException(
                status_code=404,
                detail="Facility not found"
            )


        if attendees is not None and attendees > facility["capacity"]:
            return {
                "facility_id": facility_id,
                "available": False,
                "reason": (
                    f"Room capacity is {facility['capacity']}, "
                    f"but {attendees} attendees were requested"
                ),
            }

        # Use the same operating-hours validation as reservations.
        try:
            validate_facility_hours(facility, start, end)
        except HTTPException as error:
            if error.status_code == 409:
                return {
                    "facility_id": facility_id,
                    "available": False,
                    "reason": error.detail,
                }
            raise

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
                facility_id,
                end.isoformat(),
                start.isoformat(),
            ),
        ).fetchone()

    if conflict:
        return {
            "facility_id": facility_id,
            "available": False,
            "reason": "Facility already reserved for this time",
        }

    return {
        "facility_id": facility_id,
        "available": True,
        "reason": None,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }
