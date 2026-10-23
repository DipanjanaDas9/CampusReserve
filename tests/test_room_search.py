import os
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# Isolate the import-time database initialization from the development database.
TEST_DATABASE_DIRECTORY = Path(
    tempfile.mkdtemp(prefix=".campusreserve-tests-", dir=Path(__file__).resolve().parent)
)
os.environ["CAMPUSRESERVE_DB_PATH"] = str(TEST_DATABASE_DIRECTORY / "import.db")
os.environ["CAMPUS_TIME_ZONE"] = "UTC"

from backend import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    database_path = tmp_path / "test.db"
    monkeypatch.setattr(main, "DATABASE_PATH", database_path)
    main.initialize_database()

    with main.get_connection() as connection:
        connection.execute("DELETE FROM rooms")
        connection.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            ("Test User", "search-test@example.edu", "not-used"),
        )
        connection.commit()

    token = main.jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        main.SECRET_KEY,
        algorithm=main.ALGORITHM,
    )
    with TestClient(main.app) as test_client:
        test_client.headers["Authorization"] = f"Bearer {token}"
        yield test_client


@pytest.fixture(autouse=True, scope="session")
def remove_import_test_database():
    yield
    shutil.rmtree(TEST_DATABASE_DIRECTORY, ignore_errors=True)


def add_room(client, name="Test room", capacity=8, equipment=None):
    with main.get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO rooms (name, capacity, location, equipment, is_sample) VALUES (?, ?, ?, ?, 0)",
            (name, capacity, "Test building", main.json.dumps(equipment or [])),
        )
        connection.commit()
        return cursor.lastrowid


def reserve(client, room_id, start, end, status="approved"):
    with main.get_connection() as connection:
        connection.execute(
            "INSERT INTO reservations (room_id, user_id, start_time, end_time, status) VALUES (?, 1, ?, ?, ?)",
            (room_id, start, end, status),
        )
        connection.commit()


def search(client, **overrides):
    params = {
        "date": "2099-06-10",
        "start_time": "10:00",
        "end_time": "11:00",
        "min_capacity": 1,
    }
    params.update(overrides)
    return client.get("/rooms/search", params=params)


def test_filters_by_minimum_capacity(client):
    add_room(client, "Small", capacity=2)
    add_room(client, "Large", capacity=6)

    response = search(client, min_capacity=5)

    assert response.status_code == 200
    assert [room["name"] for room in response.json()] == ["Large"]


def test_all_required_equipment_must_match_case_insensitively(client):
    add_room(client, "Equipped", equipment=["Whiteboard", "Projector"])
    add_room(client, "Partial", equipment=["Whiteboard"])

    response = search(client, equipment=["whiteboard", "Projector"])

    assert response.status_code == 200
    assert [room["name"] for room in response.json()] == ["Equipped"]


def test_overlapping_active_reservation_excludes_room(client):
    room_id = add_room(client)
    reserve(client, room_id, "2099-06-10T10:30:00+00:00", "2099-06-10T11:30:00+00:00")

    assert search(client).json() == []


def test_back_to_back_reservation_does_not_exclude_room(client):
    room_id = add_room(client)
    reserve(client, room_id, "2099-06-10T11:00:00+00:00", "2099-06-10T12:00:00+00:00")

    assert [room["id"] for room in search(client).json()] == [room_id]


def test_cancelled_reservation_does_not_exclude_room(client):
    room_id = add_room(client)
    reserve(
        client,
        room_id,
        "2099-06-10T10:30:00+00:00",
        "2099-06-10T11:30:00+00:00",
        status="cancelled",
    )

    assert [room["id"] for room in search(client).json()] == [room_id]


@pytest.mark.parametrize(
    "overrides",
    [
        {"date": "not-a-date"},
        {"date": "2000-01-01"},
        {"min_capacity": 0},
        {"end_time": "09:00"},
    ],
)
def test_invalid_search_input_returns_422(client, overrides):
    assert search(client, **overrides).status_code == 422


def test_search_requires_authentication():
    with TestClient(main.app) as test_client:
        response = test_client.get(
            "/rooms/search",
            params={"date": "2099-06-10", "start_time": "10:00", "end_time": "11:00", "min_capacity": 1},
        )
    assert response.status_code == 401


def test_missing_campus_timezone_is_reported(client, monkeypatch):
    monkeypatch.delenv("CAMPUS_TIME_ZONE")
    response = search(client)
    assert response.status_code == 503
    assert "CAMPUS_TIME_ZONE" in response.json()["detail"]
