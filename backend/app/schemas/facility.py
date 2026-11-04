
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class FacilityRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(gt=0)
    equipment: list[str] = Field(default_factory=list)
    location: str | None = None
    opening_time: str
    closing_time: str
    restrictions: str | None = None

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
