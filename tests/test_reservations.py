import os
import shutil
import sqlite3
import tempfile
from concurrent.futures import ThreadPoolExecutor
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


DAY = "2099-06-10"
# "Now" for most tests: the day before DAY, so every slot on DAY is in the future.
NOW = datetime(2099, 6, 9, 12, 0, tzinfo=timezone.utc)


def token_for(user_id):
    return main.jwt.encode(
        {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        main.SECRET_KEY,
        algorithm=main.ALGORITHM,
    )


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "test.db")
    monkeypatch.setattr(main, "utc_now", lambda: NOW)
    main.initialize_database()
    with main.get_connection() as connection:
        connection.execute("DELETE FROM rooms")
        connection.executemany(
            "INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'not-used', ?)",
            [
                (1, "Student One", "one@example.edu", "student"),
                (2, "Student Two", "two@example.edu", "student"),
                (3, "Admin", "admin@example.edu", "admin"),
            ],
        )
        connection.execute(
            "INSERT INTO rooms (id, name, capacity, location, equipment, is_sample) VALUES (10, 'Room 10', 6, 'Library', '[\"Whiteboard\"]', 0)"
        )
        connection.commit()


@pytest.fixture
def clients(db):
    with TestClient(main.app) as one, TestClient(main.app) as two, TestClient(main.app) as admin:
        one.headers["Authorization"] = f"Bearer {token_for(1)}"
        two.headers["Authorization"] = f"Bearer {token_for(2)}"
        admin.headers["Authorization"] = f"Bearer {token_for(3)}"
        yield one, two, admin


@pytest.fixture(autouse=True, scope="session")
def remove_import_test_database():
    yield
    shutil.rmtree(TEST_DATABASE_DIRECTORY, ignore_errors=True)


def book(client, start="10:00", end="12:00", room_id=10, attendees=4, date=DAY):
    return client.post(
        "/reservations",
        json={
            "room_id": room_id,
            "date": date,
            "start_time": start,
            "end_time": end,
            "purpose": "Group study",
            "attendees": attendees,
        },
    )


def set_now(monkeypatch, iso):
    monkeypatch.setattr(main, "utc_now", lambda: datetime.fromisoformat(iso))


# --- booking and conflict detection -------------------------------------------------


def test_booking_creates_pending_request_and_notification(clients):
    one, _, _ = clients

    response = book(one)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert (body["date"], body["start_time"], body["end_time"]) == (DAY, "10:00", "12:00")
    assert body["can_cancel"] is True
    assert [n["kind"] for n in one.get("/notifications/me").json()] == ["submitted"]


@pytest.mark.parametrize(
    "start, end",
    [("11:00", "13:00"), ("09:00", "11:00"), ("10:30", "11:30"), ("09:00", "13:00")],
    ids=["overlaps-end", "overlaps-start", "inside", "surrounds"],
)
def test_overlapping_request_is_rejected(clients, start, end):
    one, two, _ = clients
    book(one)

    response = book(two, start, end)

    assert response.status_code == 409


def test_back_to_back_requests_are_allowed(clients):
    one, two, _ = clients
    book(one, "10:00", "12:00")

    assert book(two, "12:00", "13:00").status_code == 201
    assert book(two, "08:00", "10:00").status_code == 201


def test_cancelled_or_rejected_slot_can_be_booked_again(clients):
    one, two, admin = clients
    first = book(one).json()
    one.post(f"/reservations/{first['id']}/cancel")
    second = book(two).json()
    admin.post(f"/admin/reservations/{second['id']}/reject", json={"reason": "Room closed"})

    assert book(one).status_code == 201


def test_concurrent_requests_for_same_slot_only_one_succeeds(clients):
    one, two, _ = clients

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda c: book(c).status_code, [one, two] * 4))

    assert results.count(201) == 1
    assert results.count(409) == 7


@pytest.mark.parametrize(
    "overrides, detail",
    [
        ({"attendees": 7}, "holds at most 6"),
        ({"start": "07:00", "end": "09:00"}, "between 08:00 and 19:00"),
        ({"start": "18:00", "end": "20:00"}, "between 08:00 and 19:00"),
        ({"start": "12:00", "end": "11:00"}, "later than start"),
        ({"date": "2099-06-09", "start": "09:00", "end": "10:00"}, "in the future"),
    ],
    ids=["over-capacity", "before-opening", "after-closing", "end-before-start", "already-started"],
)
def test_invalid_booking_is_rejected(clients, overrides, detail):
    one, _, _ = clients

    response = book(one, **overrides)

    assert response.status_code == 422
    assert detail in response.json()["detail"]


def test_booking_unknown_room_returns_404(clients):
    one, _, _ = clients
    assert book(one, room_id=999).status_code == 404


def test_pending_request_hides_room_from_search(clients):
    one, two, _ = clients
    book(one)

    response = two.get(
        "/rooms/search",
        params={"date": DAY, "start_time": "11:00", "end_time": "12:00", "min_capacity": 1},
    )

    assert response.json() == []


# --- availability calendar ---------------------------------------------------------


def test_availability_marks_booked_and_past_slots(clients, monkeypatch):
    one, _, _ = clients
    book(one, "10:00", "12:00")
    set_now(monkeypatch, "2099-06-10T09:30:00+00:00")

    slots = one.get("/rooms/10/availability", params={"start": DAY, "end": DAY}).json()
    status = {slot["hour"]: slot["status"] for slot in slots}

    assert sorted(status) == list(range(8, 19))
    assert status[8] == "past" and status[9] == "past"
    assert status[10] == "booked" and status[11] == "booked"
    assert status[12] == "available"


def test_availability_range_is_limited(clients):
    one, _, _ = clients
    response = one.get("/rooms/10/availability", params={"start": "2099-06-01", "end": "2099-07-15"})
    assert response.status_code == 422


# --- my reservations, cancel and ownership -----------------------------------------


def test_students_only_see_their_own_reservations(clients):
    one, two, _ = clients
    book(one)

    assert len(one.get("/reservations/me").json()) == 1
    assert two.get("/reservations/me").json() == []


def test_student_cannot_cancel_or_check_in_someone_elses_reservation(clients):
    one, two, _ = clients
    reservation_id = book(one).json()["id"]

    assert two.post(f"/reservations/{reservation_id}/cancel").status_code == 404
    assert two.post(f"/reservations/{reservation_id}/check-in").status_code == 404


def test_cannot_cancel_started_or_already_cancelled_reservation(clients, monkeypatch):
    one, _, _ = clients
    reservation_id = book(one).json()["id"]
    assert one.post(f"/reservations/{reservation_id}/cancel").json()["status"] == "cancelled"
    assert one.post(f"/reservations/{reservation_id}/cancel").status_code == 409

    second = book(one, "14:00", "15:00").json()["id"]
    set_now(monkeypatch, "2099-06-10T14:05:00+00:00")
    assert one.post(f"/reservations/{second}/cancel").status_code == 409


# --- check-in ------------------------------------------------------------------------


@pytest.fixture
def approved_id(clients):
    one, _, admin = clients
    reservation_id = book(one, "10:00", "12:00").json()["id"]
    admin.post(f"/admin/reservations/{reservation_id}/approve")
    return reservation_id


@pytest.mark.parametrize(
    "now, expected",
    [
        ("2099-06-10T09:44:00+00:00", 409),
        ("2099-06-10T09:45:00+00:00", 200),
        ("2099-06-10T10:30:00+00:00", 200),
        ("2099-06-10T10:31:00+00:00", 409),
    ],
    ids=["too-early", "window-opens", "window-closes", "too-late"],
)
def test_check_in_window(clients, approved_id, monkeypatch, now, expected):
    one, _, _ = clients
    set_now(monkeypatch, now)

    assert one.post(f"/reservations/{approved_id}/check-in").status_code == expected


def test_check_in_only_once_and_only_when_approved(clients, approved_id, monkeypatch):
    one, _, _ = clients
    pending_id = book(one, "14:00", "15:00").json()["id"]
    set_now(monkeypatch, "2099-06-10T10:00:00+00:00")

    assert one.post(f"/reservations/{approved_id}/check-in").json()["checked_in_at"]
    assert one.post(f"/reservations/{approved_id}/check-in").status_code == 409
    set_now(monkeypatch, "2099-06-10T14:00:00+00:00")
    assert one.post(f"/reservations/{pending_id}/check-in").status_code == 409


# --- notifications -------------------------------------------------------------------


def test_notifications_follow_the_reservation_lifecycle(clients, approved_id):
    one, two, _ = clients

    kinds = [n["kind"] for n in one.get("/notifications/me").json()]

    assert kinds == ["approved", "submitted"]
    assert two.get("/notifications/me").json() == []


def test_mark_notifications_read(clients):
    one, two, _ = clients
    book(one)
    book(one, "14:00", "15:00")
    first = one.get("/notifications/me").json()[0]["id"]

    assert two.post(f"/notifications/{first}/read").status_code == 404
    one.post(f"/notifications/{first}/read")
    assert [n["read"] for n in one.get("/notifications/me").json()] == [True, False]
    one.post("/notifications/read-all")
    assert all(n["read"] for n in one.get("/notifications/me").json())


# --- administrator workflow ------------------------------------------------------------


ADMIN_ENDPOINTS = [
    ("get", "/admin/reservations", None),
    ("get", "/admin/stats", None),
    ("post", "/admin/reservations/1/approve", None),
    ("post", "/admin/reservations/1/reject", {"reason": ""}),
    ("post", "/admin/rooms", {"name": "X", "capacity": 2, "location": "Y"}),
    ("put", "/admin/rooms/10", {"name": "X", "capacity": 2, "location": "Y"}),
    ("delete", "/admin/rooms/10", None),
]


@pytest.mark.parametrize("method, path, payload", ADMIN_ENDPOINTS)
def test_students_cannot_use_admin_endpoints(clients, method, path, payload):
    one, _, _ = clients
    kwargs = {"json": payload} if payload is not None else {}

    assert getattr(one, method)(path, **kwargs).status_code == 403


@pytest.mark.parametrize("method, path, payload", ADMIN_ENDPOINTS)
def test_admin_endpoints_require_login(db, method, path, payload):
    kwargs = {"json": payload} if payload is not None else {}
    with TestClient(main.app) as anonymous:
        assert getattr(anonymous, method)(path, **kwargs).status_code == 401


def test_admin_approves_and_rejects_pending_requests(clients):
    one, two, admin = clients
    first = book(one, "10:00", "11:00").json()["id"]
    second = book(two, "11:00", "12:00").json()["id"]

    assert [r["id"] for r in admin.get("/admin/reservations", params={"status": "pending"}).json()] == [first, second]
    assert admin.post(f"/admin/reservations/{first}/approve").json()["status"] == "approved"
    rejected = admin.post(f"/admin/reservations/{second}/reject", json={"reason": "Exam week"}).json()
    assert (rejected["status"], rejected["decision_reason"]) == ("rejected", "Exam week")
    assert admin.post(f"/admin/reservations/{first}/approve").status_code == 409
    assert "Exam week" in two.get("/notifications/me").json()[0]["body"]


def test_admin_cannot_approve_a_request_that_already_started(clients, monkeypatch):
    one, _, admin = clients
    reservation_id = book(one).json()["id"]
    set_now(monkeypatch, "2099-06-10T10:05:00+00:00")

    assert admin.post(f"/admin/reservations/{reservation_id}/approve").status_code == 409


def test_admin_stats_count_pending_and_no_shows(clients, approved_id, monkeypatch):
    one, _, admin = clients
    book(one, "14:00", "15:00")
    set_now(monkeypatch, "2099-06-10T11:00:00+00:00")

    stats = admin.get("/admin/stats").json()

    assert stats["pending"] == 1
    assert stats["no_shows"] == 1
    assert stats["approved_today"] == 1
    assert stats["rooms"] == 1 and stats["students"] == 2


def test_admin_manages_rooms(clients):
    one, _, admin = clients

    created = admin.post(
        "/admin/rooms",
        json={"name": " Lab 2 ", "capacity": 20, "location": "ERB", "equipment": ["Projector", " projector ", ""]},
    )
    assert created.status_code == 201
    room = created.json()
    assert (room["name"], room["equipment"]) == ("Lab 2", ["Projector"])

    updated = admin.put(f"/admin/rooms/{room['id']}", json={"name": "Lab 2", "capacity": 25, "location": "ERB"})
    assert updated.json()["capacity"] == 25
    assert one.get(f"/rooms/{room['id']}").json()["capacity"] == 25

    assert admin.delete(f"/admin/rooms/{room['id']}").status_code == 204
    assert one.get(f"/rooms/{room['id']}").status_code == 404


def test_room_with_bookings_cannot_be_deleted_or_shrunk_below_a_booking(clients):
    one, _, admin = clients
    book(one, attendees=5)

    assert admin.delete("/admin/rooms/10").status_code == 409
    shrink = {"name": "Room 10", "capacity": 4, "location": "Library"}
    assert admin.put("/admin/rooms/10", json=shrink).status_code == 409


def test_login_reports_admin_role(db):
    with main.get_connection() as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = 3", (main.hash_password("admin-password-1"),)
        )
        connection.commit()
    with TestClient(main.app) as client:
        user = client.post("/auth/login", json={"email": "admin@example.edu", "password": "admin-password-1"}).json()["user"]
    assert user["role"] == "admin"


# --- migration -----------------------------------------------------------------------


def test_sprint4_database_is_migrated(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
                            password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE rooms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, capacity INTEGER NOT NULL,
                            location TEXT NOT NULL, equipment TEXT NOT NULL DEFAULT '[]', is_sample INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE reservations (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
                                   start_time TEXT NOT NULL, end_time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
        INSERT INTO users (name, email, password_hash) VALUES ('Old', 'old@example.edu', 'x');
        INSERT INTO rooms (name, capacity, location) VALUES ('Old room', 4, 'B');
        INSERT INTO reservations (room_id, user_id, start_time, end_time, status)
        VALUES (1, 1, '2099-01-01T10:00:00+00:00', '2099-01-01T11:00:00+00:00', 'active'),
               (1, 1, '2099-01-02T10:00:00+00:00', '2099-01-02T11:00:00+00:00', 'cancelled');
        """
    )
    old.close()
    monkeypatch.setattr(main, "DATABASE_PATH", path)

    main.initialize_database()

    with main.get_connection() as connection:
        statuses = [row["status"] for row in connection.execute("SELECT status FROM reservations ORDER BY id")]
        role = connection.execute("SELECT role FROM users").fetchone()["role"]
    assert statuses == ["approved", "cancelled"]
    assert role == "student"
