
import logging
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from google.genai import errors
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai.extractor import extract_room_requirements
from ai.ranking import clock_label, rank_rooms
from app.core.dependencies import get_current_user
from app.routers.availability import check_availability
from app.routers.facilities import get_facilities


router = APIRouter(
    prefix="/rooms",
    tags=["AI Room Search"],
)

CAMPUS_ZONE = ZoneInfo("America/Chicago")
NOW_DEFAULT_MINUTES = 60  # length searched for "now" when the request gives no end time (message says 1 hour)


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


def resolve_building(requested, facilities):
    """Resolve shorthand only if it identifies one actual catalog building."""
    names = sorted({room["building_name"] for room in facilities if room["building_name"]})
    normalized = " ".join(requested.strip().casefold().split())
    exact = [name for name in names if name.strip().casefold() == normalized]
    if exact:
        return exact
    words = set(normalized.split()) - {"the", "a", "an"}
    return [name for name in names if words and words.issubset(set(name.casefold().split()))]


@router.post("/ai-search")
def ai_search_rooms(
    request: AIRoomSearchRequest,
    current_user: dict = Depends(get_current_user),
):
    campus_now = datetime.now(CAMPUS_ZONE)
    campus_today = campus_now.date()

    try:
        extracted = extract_room_requirements(
            request.query,
            reference_date=campus_today,
            reference_time=campus_now.time().replace(second=0, microsecond=0),
        )
    except errors.ServerError as exc:
        logging.warning("Gemini unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "The AI service is busy right now. Please try again "
                "in a minute, or use Search Spaces."
            ),
        ) from exc
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

    assumptions = []
    starts_now = extracted.starts_now and request.start_time is None
    if starts_now:
        # Start at the next 5-minute mark so the booking is in the future.
        start = campus_now.replace(second=0, microsecond=0)
        start += timedelta(minutes=5 - start.minute % 5)
        search_date, start_time = start.date(), start.time()

    if start_time is not None and end_time is None and search_date is not None:
        length = extracted.duration_minutes
        if length is None and starts_now:
            length = NOW_DEFAULT_MINUTES
            assumptions.append("Searched for 1 hour because no end time was given; use Edit to change it")
        if length is not None:
            end = datetime.combine(search_date, start_time) + timedelta(minutes=length)
            end_time = end.time() if end.date() == search_date else time(23, 59)

    if starts_now and end_time is not None:
        assumptions.insert(0, f"Starting now: {clock_label(start_time.strftime('%H:%M'))} "
                              f"to {clock_label(end_time.strftime('%H:%M'))}")

    # Only what the search needs; Gemini's own list mixes field names and optional details.
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
        "missing_information": missing,
        "assumptions": assumptions,
    })

    facilities = get_facilities()
    if extracted.building_name:
        matches = resolve_building(extracted.building_name, facilities)
        if len(matches) > 1:
            interpreted["building_options"] = matches
            interpreted["missing_information"].append("Choose a building: " + ", ".join(matches))
            return {"interpreted_requirements": interpreted, "results": []}
        if not matches:
            interpreted["missing_information"].append("No catalog building matches: " + extracted.building_name)
            return {"interpreted_requirements": interpreted, "results": []}
        interpreted["building_name"] = matches[0]

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

    group_size = extracted.group_size if extracted.group_size is not None else 1
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

    for facility in facilities:
        if not facility["is_active"]:
            continue

        if facility["capacity"] < group_size:
            continue

        if extracted.floor_number is not None and facility["floor_number"] != extracted.floor_number:
            continue
        if any(
            requested and normalize_equipment(requested) != normalize_equipment(facility[field] or "")
            for field, requested in (
                ("building_name", interpreted["building_name"]),
                ("room_number", extracted.room_number),
                ("room_type", extracted.room_type),
            )
        ):
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

    return {
        "interpreted_requirements": interpreted,
        "results": rank_rooms(results, interpreted),
    }
