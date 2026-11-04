from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ReservationRequest(BaseModel):
    facility_id: int = Field(gt=0)
    start_time: datetime
    end_time: datetime
    attendees: int = Field(default=1, ge=1)
    purpose: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=1000)


class ReservationDecision(BaseModel):
    status: Literal["approved", "denied"]