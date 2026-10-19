
import pytest
from pydantic import ValidationError


from backend.ai_service import (
    RoomSearchIntent,
    build_room_search_params,
    parse_room_search,
)


def test_empty_request_is_rejected():
    with pytest.raises(ValueError):
        parse_room_search("")


def test_whitespace_request_is_rejected():
    with pytest.raises(ValueError):
        parse_room_search("   ")


def test_default_intent_fields():
    intent = RoomSearchIntent()

    assert intent.capacity is None
    assert intent.location is None
    assert intent.equipment == []


def test_capacity_must_be_positive():
    with pytest.raises(ValidationError):
        RoomSearchIntent(capacity=0)


def test_placeholder_does_not_invent_requirements():
    intent = parse_room_search("Find a room")

    assert intent.capacity is None
    assert intent.location is None
    assert intent.equipment == []

def test_extracts_capacity_and_projector():
    intent = parse_room_search(
        "Find a room for 6 people with a projector"
    )

    assert intent.capacity == 6
    assert "projector" in intent.equipment


def test_extracts_whiteboard():
    intent = parse_room_search("I need a room with a whiteboard")

    assert "whiteboard" in intent.equipment


def test_request_without_requirements_returns_defaults():
    intent = parse_room_search("Find a room")

    assert intent.capacity is None
    assert intent.location is None
    assert intent.equipment == []
def test_extracts_explicit_location():
    intent = parse_room_search(
        "Find a room in Engineering Building"
    )

    assert intent.location == "engineering building"


def test_extracts_capacity_equipment_and_location():
    intent = parse_room_search(
        "Find a room for 6 people in Engineering Building "
        "with a projector"
    )

    assert intent.capacity == 6
    assert intent.location == "engineering building"
    assert "projector" in intent.equipment

def test_builds_room_search_parameters():
    intent = RoomSearchIntent(
        capacity=6,
        equipment=["projector"],
    )

    params = build_room_search_params(
        intent,
        search_date="2026-11-01",
        start_time="10:00:00",
        end_time="11:00:00",
    )

    assert params["date"] == "2026-11-01"
    assert params["start_time"] == "10:00:00"
    assert params["end_time"] == "11:00:00"
    assert params["min_capacity"] == 6
    assert params["equipment"] == ["projector"]


def test_missing_date_or_time_is_rejected():
    intent = RoomSearchIntent(capacity=4)

    with pytest.raises(ValueError):
        build_room_search_params(
            intent,
            search_date="",
            start_time="10:00:00",
            end_time="11:00:00",
        )


def test_default_capacity_is_one():
    intent = RoomSearchIntent()

    params = build_room_search_params(
        intent,
        search_date="2026-11-01",
        start_time="10:00:00",
        end_time="11:00:00",
    )

    assert params["min_capacity"] == 1
