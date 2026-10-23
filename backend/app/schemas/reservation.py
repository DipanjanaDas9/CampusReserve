from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ReservationRequest(BaseModel):
    facility_id: int = Field(gt=0)
    start_time: datetime
    end_time: datetime


class ReservationDecision(BaseModel):
    status: Literal["approved", "denied"]