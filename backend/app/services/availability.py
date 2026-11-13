
from datetime import datetime, time

from fastapi import HTTPException

from app.core.config import CAMPUS_TIMEZONE


def parse_facility_time(value: str) -> time:
    """Convert facility opening and closing hours to time objects."""

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
    """Check that a reservation is within facility operating hours."""

    if not facility["opening_time"] or not facility["closing_time"]:
        raise HTTPException(
            status_code=409,
            detail="Facility operating hours are not configured"
        )

    opening = parse_facility_time(facility["opening_time"])
    closing = parse_facility_time(facility["closing_time"])

    # Convert UTC timestamps to campus local time.
    local_start = start.astimezone(CAMPUS_TIMEZONE)
    local_end = end.astimezone(CAMPUS_TIMEZONE)

    # Overnight facility hours are not supported yet.
    if opening >= closing:
        raise HTTPException(
            status_code=409,
            detail="Overnight facility hours are not yet supported"
        )

    # Prevent reservations crossing midnight.
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
