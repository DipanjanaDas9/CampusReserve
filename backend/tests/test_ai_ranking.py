"""Ranking of AI search results (issue #21). Gemini is mocked; rooms come from the demo catalog."""
from contextlib import closing

import pytest

from ai.extractor import RoomRequirements
from ai.ranking import rank_rooms, score_room
from app.db import connection as db
from app.routers import ai
from scripts.seed_demo import seed_demo

ROOM = {"id": 1, "name": "Room", "building_name": "Central Library", "floor_number": 2,
        "room_number": "LIB-201", "room_type": "Study room", "capacity": 8}


def search(client, headers, monkeypatch, **requirements):
    values = dict(group_size=None, date="2099-06-10", start_time="14:00", end_time="16:00",
                  building_name=None, floor_number=None, room_number=None, room_type=None,
                  equipment=[], missing_information=[])
    values.update(requirements)
    monkeypatch.setattr(ai, "extract_room_requirements", lambda *args, **kwargs: RoomRequirements(**values))
    response = client.post("/rooms/ai-search", headers=headers, json={"query": "Find a room"})
    assert response.status_code == 200
    return response.json()["results"]


@pytest.fixture
def catalog():
    seed_demo()
    with closing(db.get_connection()) as connection:
        return {row["id"] for row in connection.execute("SELECT id FROM facilities")}


def test_exact_fit_scores_100_and_explains_every_requirement():
    score, reasons, tradeoffs = score_room({**ROOM, "capacity": 6}, {
        "group_size": 6, "building_name": "Central Library", "floor_number": 2,
        "room_type": "study rooms", "equipment": ["Monitor", "whiteboard"],
        "start_time": "14:00", "end_time": "16:00"})

    assert score == 100
    assert reasons == ["Seats exactly your group of 6", "In Central Library", "On floor 2",
                       "Is a study room", "Has monitor and whiteboard", "Free from 2:00 PM to 4:00 PM"]
    assert tradeoffs == []


def test_empty_seats_lower_the_score_but_never_below_zero():
    small, _, _ = score_room({**ROOM, "capacity": 8}, {"group_size": 6})
    huge, _, tradeoffs = score_room({**ROOM, "capacity": 1000}, {"group_size": 1})

    assert 0 <= huge < small < 100
    assert tradeoffs == ["Larger than you need: 999 seats would be empty"]


def test_without_a_group_size_rooms_tie_and_the_smaller_room_comes_first():
    rooms = [{**ROOM, "id": 2, "name": "B", "capacity": 20}, {**ROOM, "id": 3, "name": "A", "capacity": 4}]

    ranked = rank_rooms(rooms, {"group_size": None})

    assert [room["id"] for room in ranked] == [3, 2]
    assert {room["match_score"] for room in ranked} == {100}
    assert "Group size not given" in ranked[0]["match_tradeoffs"][0]


def test_ranking_keeps_every_room_field_and_adds_nothing_else():
    ranked = rank_rooms([ROOM], {"group_size": 2})

    assert {key: ranked[0][key] for key in ROOM} == ROOM
    assert set(ranked[0]) - set(ROOM) == {"match_score", "match_reasons", "match_tradeoffs"}


def test_closest_fit_meeting_room_is_ranked_first(client, student, catalog, monkeypatch):
    results = search(client, student, monkeypatch, group_size=10, room_type="meeting room", equipment=["monitor"])

    assert [(room["room_number"], room["match_score"]) for room in results] == [
        ("SC-101", 100), ("SC-202", 92), ("SC-102", 81)]
    assert results[0]["match_reasons"][:3] == [
        "Seats exactly your group of 10", "Is a meeting room", "Has monitor"]


def test_oversized_rooms_rank_lower_and_say_why(client, student, catalog, monkeypatch):
    results = search(client, student, monkeypatch, group_size=6, equipment=["projector"])

    assert [room["room_number"] for room in results] == ["SCI-202", "ENG-312", "ENG-110", "SC-110", "SC-210"]
    scores = [room["match_score"] for room in results]
    assert scores == sorted(scores, reverse=True)
    assert results[-1]["match_tradeoffs"] == ["Larger than you need: 94 seats would be empty"]


def test_ranking_never_adds_rooms_that_are_booked_or_unknown(client, student, catalog, monkeypatch):
    first = search(client, student, monkeypatch, group_size=10, room_type="meeting room", equipment=["monitor"])[0]
    booking = client.post("/reservations", headers=student, json={
        "facility_id": first["id"], "purpose": "Study",
        "start_time": "2099-06-10T14:00:00-05:00", "end_time": "2099-06-10T16:00:00-05:00"})
    assert booking.status_code == 201

    results = search(client, student, monkeypatch, group_size=10, room_type="meeting room", equipment=["monitor"])

    assert [room["room_number"] for room in results] == ["SC-202", "SC-102"]
    assert {room["id"] for room in results} <= catalog
