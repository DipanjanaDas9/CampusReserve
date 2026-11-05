

from datetime import date

from google.genai import types
from pydantic import BaseModel, Field

from .provider import get_ai_model, get_gemini_client


class RoomRequirements(BaseModel):
    """Room requirements extracted from a user's natural-language request."""

    building_name: str | None = Field(default=None, description="Explicitly requested building, or null")
    floor_number: int | None = Field(default=None, description="Floor as an integer: third floor = 3, ground floor = 0, basement = -1; null if unspecified")
    room_number: str | None = Field(default=None, description="Explicitly requested room number, or null")
    room_type: str | None = Field(default=None, description="Explicit room type such as study room, computer lab, meeting room, or null")
    group_size: int | None = Field(
        ge=1,
        description="Number of people who need the room, or null if unspecified."
    )
    date: str | None = Field(
        description="Requested date in YYYY-MM-DD format, or null if unknown."
    )
    start_time: str | None = Field(
        description="Requested start time in 24-hour HH:MM format, or null if unknown."
    )
    end_time: str | None = Field(
        description="Requested end time in 24-hour HH:MM format, or null if unknown."
    )
    equipment: list[str] = Field(
        description="Equipment explicitly requested, such as a projector or whiteboard."
    )
    missing_information: list[str] = Field(
        description="Important booking details the user has not provided."
    )


def extract_room_requirements(
    request_text: str,
    reference_date: date | None = None,
) -> RoomRequirements:
    """Use Gemini to extract structured room-booking requirements."""

    if not request_text or not request_text.strip():
        raise ValueError("Please enter a room-booking request.")

    today = reference_date or date.today()
    client = get_gemini_client()

    response = client.models.generate_content(
        model=get_ai_model(),
        contents=(
            f"Reference date: {today.isoformat()}\n"
            f"Room request: {request_text}"
        ),
        config=types.GenerateContentConfig(
            system_instruction=(
                "You extract room-booking requirements for CampusReserve. "
                "Return data matching the supplied schema. "
                "Never invent details the user did not provide. "
                "Extract building, floor, room number, and room type only when explicitly requested. "
                "Capacity is maximum occupants; never infer live occupancy. "
                "Convert ordinal floors to integers: third floor means 3, ground floor means 0, basement means -1. "
                "Preserve building mentions such as 'the library'; do not invent a formal building name. "
                "Normalize room types: study room, computer lab, laboratory, conference room, meeting room, multipurpose room, collaboration room. "
                "For example, 'a study room for 6 people on the third floor of the library tomorrow with a projector' "
                "means group_size 6, floor_number 3, building_name library, room_type study room, equipment [projector], "
                "and tomorrow's date. Start and end times remain null and must be requested. "
                "Use null for unknown group size, date, start time, or end time. "
                "Use an empty equipment list when no equipment is requested. "
                "Convert dates to YYYY-MM-DD and times to 24-hour HH:MM. "
                "Resolve relative dates such as 'tomorrow' using the reference "
                "date supplied in the user message. "
                "If a date or time is ambiguous, use null rather than guessing. "
                "List important unspecified booking details in missing_information."
            ),
            response_mime_type="application/json",
            response_schema=RoomRequirements,
        ),
    )

    if not response.text:
        raise RuntimeError(
            "Gemini did not return structured room requirements. Please try again."
        )

    try:
        return RoomRequirements.model_validate_json(response.text)
    except ValueError as exc:
        raise RuntimeError(
            "Gemini returned invalid room requirements. Please try again."
        ) from exc
