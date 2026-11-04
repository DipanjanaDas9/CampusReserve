
import logging
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo
from google.genai import errors
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai.extractor import extract_room_requirements
from app.core.dependencies import get_current_user
from app.routers.availability import check_availability
from app.routers.facilities import get_facilities


router = APIRouter(
    prefix="/rooms",
    tags=["AI Room Search"],
)

CAMPUS_ZONE = ZoneInfo("America/Chicago")


class AIRoomSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    search_date: date | None = Field(default=None, alias="date")
    start_time: time | None = None
    end_time: time | None = None


def to_utc(search_date: date, local_time: time) -> datetime:
    """Convert campus-local time to UTC, rejecting ambiguous times."""
    if local_time.tzinfo is not None:
        raise HTTPException(
            status_code=422,
            detail="Please provide local times without UTC offsets.",
        )

    naive = datetime.combine(search_date, local_time)
    candidates = [
        naive.replace(tzinfo=CAMPUS_ZONE, fold=fold)
        for fold in (0, 1)
    ]

    valid = [
        candidate
        for candidate in candidates
        if candidate.astimezone(timezone.utc)
        .astimezone(CAMPUS_ZONE)
        .replace(tzinfo=None) == naive
    ]

    if not valid:
        raise HTTPException(
            status_code=422,
            detail="The requested local time does not exist.",
        )

    if (
        len(valid) == 2
        and valid[0].utcoffset() != valid[1].utcoffset()
    ):
        raise HTTPException(
            status_code=422,
            detail="The requested local time is ambiguous.",
        )

    return valid[0].astimezone(timezone.utc)


def normalize_equipment(value: str) -> str:
    return " ".join(value.strip().casefold().split()).rstrip("s")


@router.post("/ai-search")
def ai_search_rooms(
    request: AIRoomSearchRequest,
    current_user: dict = Depends(get_current_user),
):
    campus_today = datetime.now(CAMPUS_ZONE).date()

    try:
        extracted = extract_room_requirements(
            request.query,
            reference_date=campus_today,
        )
    except errors.ClientError as exc:
        if exc.code == 429:
            raise HTTPException(
                status_code=429,
                detail=(
                    "The AI room search has reached its daily "
                    "Gemini request limit. Please try again "
                    "after the quota resets, or use Search Spaces."
                ),
            ) from exc

        logging.exception("Gemini client error")
        raise HTTPException(
            status_code=502,
            detail="The AI service could not process this request.",
        ) from exc
    except RuntimeError as exc:
        if "GEMINI_API_KEY is missing" in str(exc):
            raise HTTPException(
                status_code=503,
                detail="Gemini AI is not configured on this server.",
            ) from exc

        logging.exception("Gemini extraction failed")
        raise HTTPException(
            status_code=502,
            detail="The AI service could not process this request.",
        ) from exc
    except Exception as exc:
        logging.exception("Gemini extraction failed")
        raise HTTPException(
            status_code=502,
            detail="The AI service could not process this request.",
        ) from exc

    try:
        # Explicit form values take priority over AI interpretation.
        search_date = (
            request.search_date
            or (date.fromisoformat(extracted.date) if extracted.date else None)
        )
        start_time = (
            request.start_time
            or (
                time.fromisoformat(extracted.start_time)
                if extracted.start_time else None
            )
        )
        end_time = (
            request.end_time
            or (
                time.fromisoformat(extracted.end_time)
                if extracted.end_time else None
            )
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="The AI returned an invalid date or time.",
        ) from exc

    missing = []
    if search_date is None:
        missing.append("date")
    if start_time is None:
        missing.append("start time")
    if end_time is None:
        missing.append("end time")

    interpreted = extracted.model_dump()
    interpreted.update({
        "date": search_date.isoformat() if search_date else None,
        "start_time": start_time.isoformat(timespec="minutes") if start_time else None,
        "end_time": end_time.isoformat(timespec="minutes") if end_time else None,
        "missing_information": list(dict.fromkeys(
            extracted.missing_information + missing
        )),
    })

    if missing:
        return {
            "interpreted_requirements": interpreted,
            "results": [],
        }

    start_utc = to_utc(search_date, start_time)
    end_utc = to_utc(search_date, end_time)

    if start_utc <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=422,
            detail="The reservation must start in the future.",
        )

    if end_utc <= start_utc:
        raise HTTPException(
            status_code=422,
            detail="End time must be after start time.",
        )

    group_size = extracted.group_size or 1
    if group_size < 1:
        raise HTTPException(
            status_code=422,
            detail="Group size must be at least one.",
        )

    required_equipment = {
        normalize_equipment(item)
        for item in extracted.equipment
        if item.strip()
    }

    results = []

    for facility in get_facilities():
        if not facility["is_active"]:
            continue

        if facility["capacity"] < group_size:
            continue

        available_equipment = {
            normalize_equipment(item)
            for item in facility["equipment"]
        }

        if not required_equipment.issubset(available_equipment):
            continue

        # Reuse existing CampusReserve booking rules.
        availability = check_availability(
            facility_id=facility["id"],
            start_time=start_utc,
            end_time=end_utc,
            attendees=group_size,
        )

        if availability["available"]:
            results.append(facility)

    results.sort(key=lambda room: (room["capacity"], room["name"]))

    return {
        "interpreted_requirements": interpreted,
        "results": results,
    }
