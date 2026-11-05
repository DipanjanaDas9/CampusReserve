
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class FacilityRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    building_name: str | None = Field(default=None, min_length=1, max_length=100)
    floor_number: int | None = Field(default=None, strict=True)
    room_number: str | None = Field(default=None, min_length=1, max_length=30)
    room_type: str | None = Field(default=None, min_length=1, max_length=60)
    capacity: int = Field(gt=0, description="Maximum occupants, not current occupancy")
    equipment: list[str] = Field(default_factory=list)
    location: str | None = None
    opening_time: str
    closing_time: str
    restrictions: str | None = None

    @field_validator("building_name", "room_number", "room_type", mode="before")
    @classmethod
    def normalize_catalog_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_catalog_identity(self):
        identity = (self.building_name, self.floor_number, self.room_number)
        if any(value is not None for value in identity) and not all(value is not None for value in identity):
            raise ValueError("Building, floor, and room number must be provided together")
        return self

    @field_validator("opening_time", "closing_time")
    @classmethod
    def validate_time_format(cls, value: str) -> str:
        try:
            parsed = datetime.strptime(value, "%H:%M")
        except ValueError:
            raise ValueError(
                "Time must be in HH:MM format, such as 08:00 or 20:00"
            )

        return parsed.strftime("%H:%M")

    @model_validator(mode="after")
    def validate_operating_hours(self):
        opening = datetime.strptime(self.opening_time, "%H:%M").time()
        closing = datetime.strptime(self.closing_time, "%H:%M").time()

        if opening >= closing:
            raise ValueError(
                "Closing time must be later than opening time"
            )

        return self


class FacilityResponse(BaseModel):
    """SQLite facility representation, including incomplete legacy records."""
    id: int
    name: str
    building_name: str | None = None
    floor_number: int | None = None
    room_number: str | None = None
    room_type: str | None = None
    capacity: int = Field(description="Maximum occupants, not current occupancy")
    equipment: list[str]
    location: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    restrictions: str | None = None
    is_active: bool


class FacilityMutationResponse(BaseModel):
    message: str
    facility: FacilityResponse
