import os
import shutil
import tempfile
from datetime import date, datetime, timedelta, timezone
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
from backend.ai.extractor import RoomRequirements


FUTURE_DATE = "2099-06-10"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "test.db")
    main.initialize_database()

    with main.get_connection() as connection:
        connection.execute("DELETE FROM rooms")
        connection.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            ("Test User", "ai-search-test@example.edu", "not-used"),
        )
        connection.executemany(
            "INSERT INTO rooms (name, capacity, location, equipment, is_sample) VALUES (?, ?, ?, ?, 0)",
            [
                ("Small", 4, "Test building", main.json.dumps(["Whiteboard"])),
                ("Projector room", 8, "Test building", main.json.dumps(["Whiteboard", "Projector"])),
            ],
        )
        connection.commit()

    token = main.jwt.encode(
        {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
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


def fake_extractor(monkeypatch, **fields):
    """Replace the Gemini call with a fixed RoomRequirements result."""
    requirements = RoomRequirements(
        group_size=fields.get("group_size"),
        date=fields.get("date"),
        start_time=fields.get("start_time"),
        end_time=fields.get("end_time"),
        equipment=fields.get("equipment", []),
        missing_information=fields.get("missing_information", []),
    )
    calls = []

    def extract(request_text, reference_date=None):
        calls.append(request_text)
        return requirements

    monkeypatch.setattr(main, "extract_room_requirements", extract)
    return calls


def ai_search(client, query="Find a room", **fields):
    return client.post("/rooms/ai-search", json={"query": query, **fields})


def test_extracted_requirements_drive_room_search(client, monkeypatch):
    calls = fake_extractor(
        monkeypatch,
        group_size=6,
        date=FUTURE_DATE,
        start_time="10:00",
        end_time="11:00",
        equipment=["projector"],
    )

    response = ai_search(client, "Room for 6 people with a projector")

    assert response.status_code == 200
    body = response.json()
    assert calls == ["Room for 6 people with a projector"]
    assert [room["name"] for room in body["results"]] == ["Projector room"]
    assert body["interpreted_requirements"]["group_size"] == 6


def test_form_fields_are_used_when_ai_finds_no_date_or_time(client, monkeypatch):
    fake_extractor(monkeypatch, group_size=2)

    response = ai_search(client, date=FUTURE_DATE, start_time="10:00", end_time="11:00")

    assert response.status_code == 200
    assert [room["name"] for room in response.json()["results"]] == ["Small", "Projector room"]


def test_booked_room_is_not_returned(client, monkeypatch):
    fake_extractor(monkeypatch, date=FUTURE_DATE, start_time="10:00", end_time="11:00", equipment=["projector"])
    with main.get_connection() as connection:
        connection.execute(
            "INSERT INTO reservations (room_id, user_id, start_time, end_time) "
            "SELECT id, 1, ?, ? FROM rooms WHERE name = 'Projector room'",
            ("2099-06-10T10:30:00+00:00", "2099-06-10T11:30:00+00:00"),
        )
        connection.commit()

    response = ai_search(client)

    assert response.status_code == 200
    assert response.json()["results"] == []


@pytest.mark.parametrize(
    "fields",
    [
        {"date": "2000-01-01", "start_time": "10:00", "end_time": "11:00"},
        {"date": FUTURE_DATE, "start_time": "11:00", "end_time": "10:00"},
        {"date": "tomorrow", "start_time": "10:00", "end_time": "11:00"},
        {},
    ],
    ids=["past-date", "end-before-start", "unparseable-date", "no-date-or-time"],
)
def test_unusable_requirements_return_422(client, monkeypatch, fields):
    fake_extractor(monkeypatch, **fields)

    assert ai_search(client).status_code == 422


def test_ai_service_failure_returns_502(client, monkeypatch):
    def failing_extractor(request_text, reference_date=None):
        raise RuntimeError("Gemini did not return structured room requirements.")

    monkeypatch.setattr(main, "extract_room_requirements", failing_extractor)

    response = ai_search(client)

    assert response.status_code == 502
    assert "Gemini" not in response.json()["detail"]


def test_empty_query_is_rejected_before_calling_ai(client, monkeypatch):
    calls = fake_extractor(monkeypatch)

    assert ai_search(client, query="").status_code == 422
    assert calls == []


def test_ai_search_requires_authentication(monkeypatch):
    calls = fake_extractor(monkeypatch)

    with TestClient(main.app) as test_client:
        response = test_client.post("/rooms/ai-search", json={"query": "Find a room"})

    assert response.status_code == 401
    assert calls == []
