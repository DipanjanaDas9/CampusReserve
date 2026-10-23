from pydantic import BaseModel, Field


class FacilityRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    capacity: int = Field(gt=0)
    equipment: list[str] = Field(default_factory=list)
    location: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    restrictions: str | None = None