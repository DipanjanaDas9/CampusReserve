
"""
CampusReserve AI Room Search

Extract basic room requirements from natural-language requests.
This version uses rules as a baseline before AI model integration.
"""

import re
from typing import Optional

from pydantic import BaseModel, Field


class RoomSearchIntent(BaseModel):
    """Structured requirements for a room search."""

    capacity: Optional[int] = Field(default=None, ge=1)
    location: Optional[str] = None
    equipment: list[str] = Field(default_factory=list)


EQUIPMENT_KEYWORDS = {
    "projector": ["projector", "projectors"],
    "whiteboard": ["whiteboard", "white board"],
    "computer": ["computer", "computers", "desktop"],
    "monitor": ["monitor", "monitors"],
    "video conferencing": ["video conferencing", "video conference"],
}


def parse_room_search(user_query: str) -> RoomSearchIntent:
    """Extract basic room requirements from a user's request."""

    if not user_query or not user_query.strip():
        raise ValueError("Please enter a room search request.")

    query = user_query.strip().lower()

    # Extract capacity from phrases such as:
    # "for 6 people", "capacity 10", or "10 seats".
    capacity = None
    patterns = [
        r"\bfor\s+(\d+)\s*(?:people|persons|students|attendees)?\b",
        r"\bcapacity\s*(?:of\s*)?(\d+)\b",
        r"\b(\d+)\s*(?:people|persons|students|attendees|seats)\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, query)
        if match:
            capacity = int(match.group(1))
            break

    if capacity is not None and capacity < 1:
        raise ValueError("Capacity must be at least 1.")

    # Extract recognized equipment.
    equipment = []
    for canonical_name, keywords in EQUIPMENT_KEYWORDS.items():
        if any(keyword in query for keyword in keywords):
            equipment.append(canonical_name)

        # Extract a location only when the user explicitly specifies one.
    location = None

    location_patterns = [
        r"\b(?:in|at|near)\s+(.+?)(?=\s+(?:with|for|on|from)\b|$)",
        r"\blocation\s*:\s*(.+?)(?=\s+(?:with|for|on|from)\b|$)",
    ]

    for pattern in location_patterns:
        match = re.search(pattern, query)
        if match:
            candidate = match.group(1).strip(" .,!?")
            if candidate:
                location = candidate
                break

    return RoomSearchIntent(
        capacity=capacity,
        location=location,
        equipment=equipment,
    )


def build_room_search_params(
    intent: RoomSearchIntent,
    search_date: str,
    start_time: str,
    end_time: str,
) -> dict:
    """Build parameters for CampusReserve's existing room-search API."""

    if not search_date or not start_time or not end_time:
        raise ValueError("Date, start time, and end time are required.")

    params = {
        "date": search_date,
        "start_time": start_time,
        "end_time": end_time,
        "min_capacity": intent.capacity or 1,
    }

    if intent.equipment:
        params["equipment"] = intent.equipment

    return params
