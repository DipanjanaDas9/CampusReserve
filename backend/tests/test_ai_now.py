"""AI search for "now", the list of missing details, and Gemini outages. Gemini is mocked."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
from google.genai import errors

from ai.extractor import RoomRequirements
from app.routers import ai
from test_ai_catalog import ai_room  # noqa: F401  (fixture: Central Library LIB-301, open 08:00-22:00)

CAMPUS = ZoneInfo("America/Chicago")


def freeze(monkeypatch, local):
    """Pretend the campus clock reads `local` (a naive datetime in America/Chicago)."""
    fixed = local.replace(tzinfo=CAMPUS)

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed.astimezone(tz or timezone.utc)

    monkeypatch.setattr(ai, "datetime", FrozenDatetime)


def mock(monkeypatch, captured=None, **changes):
    values = dict(group_size=None, date=None, start_time=None, end_time=None, building_name=None,
                  floor_number=None, room_number=None, room_type=None, equipment=[],
                  missing_information=["building_name", "group_size", "start_time", "end_time"])
    values.update(changes)

    def extract(query, reference_date=None, reference_time=None):
        if captured is not None:
            captured.update(reference_date=reference_date, reference_time=reference_time)
        return RoomRequirements(**values)

    monkeypatch.setattr(ai, "extract_room_requirements", extract)


def search(client, headers, **body):
    response = client.post("/rooms/ai-search", headers=headers, json={"query": "Which rooms are empty now?", **body})
    assert response.status_code == 200, response.text
    return response.json()


def test_now_searches_from_the_next_five_minutes_for_one_hour(client, student, ai_room, monkeypatch):
    freeze(monkeypatch, datetime(2099, 6, 10, 14, 2))
    captured = {}
    mock(monkeypatch, captured, starts_now=True, date="2099-06-10")

    data = search(client, student)
    understood = data["interpreted_requirements"]

    assert str(captured["reference_time"]) == "14:02:00"
    assert (understood["date"], understood["start_time"], understood["end_time"]) == ("2099-06-10", "14:05", "15:05")
    assert understood["assumptions"] == [
        "Starting now: 2:05 PM to 3:05 PM",
        "Searched for 1 hour because no end time was given; use Edit to change it"]
    assert understood["missing_information"] == []
    assert [room["id"] for room in data["results"]] == [ai_room["id"]]


def test_now_uses_a_stated_duration_instead_of_one_hour(client, student, ai_room, monkeypatch):
    freeze(monkeypatch, datetime(2099, 6, 10, 9, 0))
    mock(monkeypatch, starts_now=True, duration_minutes=120)

    understood = search(client, student)["interpreted_requirements"]

    assert (understood["start_time"], understood["end_time"]) == ("09:05", "11:05")
    assert understood["assumptions"] == ["Starting now: 9:05 AM to 11:05 AM"]


def test_now_uses_a_stated_end_time(client, student, ai_room, monkeypatch):
    freeze(monkeypatch, datetime(2099, 6, 10, 9, 0))
    mock(monkeypatch, starts_now=True, end_time="10:30")

    understood = search(client, student)["interpreted_requirements"]

    assert (understood["start_time"], understood["end_time"]) == ("09:05", "10:30")


def test_now_after_closing_finds_nothing_instead_of_failing(client, student, ai_room, monkeypatch):
    freeze(monkeypatch, datetime(2099, 6, 10, 23, 30))
    mock(monkeypatch, starts_now=True)

    data = search(client, student)

    assert data["interpreted_requirements"]["start_time"] == "23:35"
    assert data["interpreted_requirements"]["end_time"] == "23:59"
    assert data["results"] == []


def test_edited_times_override_now(client, student, ai_room, monkeypatch):
    freeze(monkeypatch, datetime(2099, 6, 10, 9, 0))
    mock(monkeypatch, starts_now=True)

    understood = search(client, student, date="2099-06-10", start_time="15:00", end_time="16:00")["interpreted_requirements"]

    assert (understood["start_time"], understood["end_time"]) == ("15:00", "16:00")
    assert understood["assumptions"] == []


def test_missing_details_list_only_what_the_search_needs_in_plain_words(client, student, ai_room, monkeypatch):
    mock(monkeypatch, date="2099-06-10")

    understood = search(client, student)["interpreted_requirements"]

    assert understood["missing_information"] == ["start time", "end time"]


def test_a_start_time_without_an_end_still_asks_for_the_end(client, student, ai_room, monkeypatch):
    mock(monkeypatch, date="2099-06-10", start_time="14:00")

    understood = search(client, student)["interpreted_requirements"]

    assert understood["missing_information"] == ["end time"]


def test_a_stated_duration_fills_the_end_time(client, student, ai_room, monkeypatch):
    mock(monkeypatch, date="2099-06-10", start_time="14:00", duration_minutes=90)

    understood = search(client, student)["interpreted_requirements"]

    assert understood["end_time"] == "15:30"
    assert understood["assumptions"] == []


@pytest.mark.parametrize("code, status", [(503, "UNAVAILABLE"), (504, "DEADLINE_EXCEEDED")])
def test_gemini_outage_says_busy_and_points_to_search_spaces(client, student, monkeypatch, code, status):
    def busy(*args, **kwargs):
        raise errors.ServerError(code, {"error": {"code": code, "message": "busy", "status": status}})

    monkeypatch.setattr(ai, "extract_room_requirements", busy)

    response = client.post("/rooms/ai-search", headers=student, json={"query": "Room now"})

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "The AI service is busy right now. Please try again in a minute, or use Search Spaces.")
