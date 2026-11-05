"""Catalog migration and API regression tests; all databases are temporary."""
import sqlite3
from contextlib import closing

import pytest

from app.db import connection as db
from app.db.catalog import DEMO_ROOMS
from app.db.database import initialize_database
from scripts.seed_demo import seed_demo
from test_facilities import ROOM

ADDRESS = {"building_name": "Campus Library", "floor_number": 0, "room_number": "G01", "room_type": "Study room"}


def test_old_schema_migrates_without_changing_rows_or_foreign_keys(tmp_path, monkeypatch):
    path = tmp_path / "legacy.db"
    monkeypatch.setattr(db, "DATABASE_PATH", path)
    with sqlite3.connect(path) as connection:
        connection.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE facilities (id INTEGER PRIMARY KEY, name TEXT NOT NULL,
                capacity INTEGER NOT NULL, equipment TEXT DEFAULT '[]', location TEXT,
                opening_time TEXT, closing_time TEXT, restrictions TEXT);
            CREATE TABLE reservations (id INTEGER PRIMARY KEY, user_id INTEGER,
                facility_id INTEGER REFERENCES facilities(id), start_time TEXT,
                end_time TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            INSERT INTO users VALUES (7, 'Existing user', 'existing@example.edu', 'unchanged', '2026-01-01');
            INSERT INTO facilities VALUES (42, 'Legacy room', 8, '["Monitor"]', 'Original location', '08:00', '20:00', 'Original rules');
            INSERT INTO reservations VALUES (19, 7, 42, '2099-01-01T14:00:00+00:00', '2099-01-01T15:00:00+00:00', 'approved', '2026-01-01');
        """)
        original = {table: connection.execute(f"SELECT * FROM {table}").fetchall() for table in ("users", "facilities", "reservations")}
    initialize_database()
    initialize_database()
    with closing(db.get_connection()) as connection:
        for table, rows in original.items():
            migrated = connection.execute(f"SELECT * FROM {table}").fetchall()
            assert [tuple(row)[:len(rows[0])] for row in migrated] == rows
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute("SELECT building_name FROM facilities WHERE id=42").fetchone()[0] is None


def test_seed_is_opt_in_repeat_safe_and_preserves_admin_edits(monkeypatch):
    with closing(db.get_connection()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM facilities").fetchone()[0] == 0
    assert seed_demo() == len(DEMO_ROOMS)
    with closing(db.get_connection()) as connection, connection:
        first = connection.execute("SELECT * FROM facilities ORDER BY id LIMIT 1").fetchone()
        connection.execute("UPDATE facilities SET capacity=99, is_active=0 WHERE id=?", (first["id"],))
    assert seed_demo() == 0
    with closing(db.get_connection()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM facilities").fetchone()[0] == len(DEMO_ROOMS)
        room = connection.execute("SELECT * FROM facilities WHERE id=?", (first["id"],)).fetchone()
        assert room["capacity"] == 99 and room["is_active"] == 0
        assert connection.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM reservations").fetchone()[0] == 0


def test_catalog_roundtrip_and_legacy_update(client, admin):
    created = client.post("/facilities", headers=admin, json={**ROOM, **ADDRESS})
    assert created.status_code == 201
    room = created.json()["facility"]
    assert all(room[key] == value for key, value in ADDRESS.items())
    response = client.put(f"/facilities/{room['id']}", headers=admin, json={**ROOM, "capacity": 12})
    assert response.status_code == 200
    assert response.json()["facility"]["building_name"] == ADDRESS["building_name"]
    assert response.json()["facility"]["floor_number"] == 0


def test_identity_unique_on_create_update_and_direct_sql(client, admin):
    first = client.post("/facilities", headers=admin, json={**ROOM, **ADDRESS}).json()["facility"]
    duplicate = {**ROOM, **ADDRESS, "building_name": " campus library ", "room_number": "g01"}
    assert client.post("/facilities", headers=admin, json=duplicate).status_code == 409
    second = client.post("/facilities", headers=admin, json={**ROOM, **ADDRESS, "room_number": "G02"}).json()["facility"]
    assert client.put(f"/facilities/{second['id']}", headers=admin, json=duplicate).status_code == 409
    assert client.get(f"/facilities/{second['id']}").json()["room_number"] == "G02"
    with closing(db.get_connection()) as connection:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("UPDATE facilities SET room_number='g01' WHERE id=?", (second["id"],))
    assert first["id"] != second["id"]


@pytest.mark.parametrize("extra", [
    {"building_name": "Library"}, {"floor_number": 0}, {"room_number": "101"},
    {**ADDRESS, "floor_number": 1.5}, {**ADDRESS, "building_name": "   "},
])
def test_invalid_catalog_input(client, admin, extra):
    assert client.post("/facilities", headers=admin, json={**ROOM, **extra}).status_code == 422


def test_catalog_ai_search_uses_real_capacity_and_identity(client, admin, student, monkeypatch):
    from ai.extractor import RoomRequirements
    from app.routers import ai
    room = client.post("/facilities", headers=admin, json={**ROOM, **ADDRESS}).json()["facility"]
    monkeypatch.setattr(ai, "extract_room_requirements", lambda *args, **kwargs: RoomRequirements(
        group_size=4, date="2099-06-10", start_time="10:00", end_time="11:00",
        equipment=[], missing_information=[], building_name="Campus Library", floor_number=0,
    ))
    response = client.post("/rooms/ai-search", headers=student, json={"query": "A room on the ground floor of Campus Library"})
    assert response.status_code == 200
    assert [r["id"] for r in response.json()["results"]] == [room["id"]]
    assert response.json()["results"][0]["capacity"] == ROOM["capacity"]
    assert "occupancy" not in response.json()["results"][0]


def test_seed_preserves_existing_bookings_notifications_and_reset_tokens(client, admin, student, facility_id, monkeypatch):
    from conftest import slot
    booked = client.post("/reservations", headers=student, json={
        "facility_id": facility_id, "purpose": "Existing booking", **slot("10:00", "11:00"),
    })
    assert booked.status_code == 201
    with closing(db.get_connection()) as connection, connection:
        user_id = connection.execute("SELECT id FROM users WHERE email='student@example.edu'").fetchone()[0]
        connection.execute("""INSERT INTO password_reset_tokens
            (user_id, token_hash, expires_at, created_at) VALUES (?, 'hashed-token', '2099-01-01', '2026-01-01')""", (user_id,))
        tables = ["users", "facilities", "reservations", "notifications", "password_reset_tokens"]
        before = {table: [tuple(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY id")] for table in tables}
    seed_demo()
    with closing(db.get_connection()) as connection:
        for table, rows in before.items():
            after = [tuple(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY id")]
            assert all(row in after for row in rows)
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []


def test_startup_never_seeds_even_with_old_environment_setting(monkeypatch):
    monkeypatch.setenv("CAMPUSRESERVE_SEED_DEMO", "1")
    initialize_database()
    with closing(db.get_connection()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM facilities").fetchone()[0] == 0


def test_demo_dataset_shape():
    from app.schemas.facility import FacilityRequest
    assert 25 <= len(DEMO_ROOMS) <= 35
    assert len({r["room_number"] for r in DEMO_ROOMS}) == len(DEMO_ROOMS)
    library = [r for r in DEMO_ROOMS if r["building_name"] == "Central Library"]
    assert {r["floor_number"] for r in library} == {1, 2, 3, 4, 5}
    assert all(sum(r["floor_number"] == floor for r in library) >= 2 for floor in range(1, 6))
    assert {r["is_active"] for r in DEMO_ROOMS} == {True, False}
    for room in DEMO_ROOMS:
        FacilityRequest.model_validate({**room, "name": room["room_number"]})


def test_demo_cli_requires_explicit_flag():
    from scripts.seed_demo import main
    with pytest.raises(SystemExit) as error:
        main([])
    assert error.value.code == 2
    with closing(db.get_connection()) as connection:
        assert connection.execute("SELECT COUNT(*) FROM facilities").fetchone()[0] == 0


def test_demo_cli_runs_twice_without_duplicates(capsys):
    from scripts.seed_demo import main
    main(["--demo"])
    assert "30 rooms added" in capsys.readouterr().out
    main(["--demo"])
    assert "0 rooms added" in capsys.readouterr().out
