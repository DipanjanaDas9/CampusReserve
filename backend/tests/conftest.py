"""Test setup: a signing key, an isolated SQLite file per test, and helper clients.

Run from the backend folder:  python -m pytest
"""

import os
import sys
import tempfile
from contextlib import closing
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("CAMPUSRESERVE_SECRET_KEY", "test-secret-key-that-is-at-least-32-characters")

# Point the database at a temporary file before main.py is imported:
# importing it runs initialize_database() against DATABASE_PATH.
from app.db import connection as db_connection  # noqa: E402

db_connection.DATABASE_PATH = Path(tempfile.mkdtemp(prefix="campusreserve-tests-")) / "import.db"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from app.db.database import initialize_database  # noqa: E402

FUTURE_DAY = "2099-06-10"  # a Wednesday; America/Chicago is UTC-05:00 in June


@pytest.fixture(autouse=True)
def fresh_database(tmp_path, monkeypatch):
    monkeypatch.setattr(db_connection, "DATABASE_PATH", tmp_path / "test.db")
    initialize_database()


@pytest.fixture
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def register(client, email, password="password-123", name="Test User"):
    return client.post("/auth/register", json={"name": name, "email": email, "password": password})


def login_headers(client, email, password="password-123"):
    token = client.post("/auth/login", json={"email": email, "password": password}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def promote_to_admin(email):
    with closing(db_connection.get_connection()) as connection:
        connection.execute("UPDATE users SET role = 'admin' WHERE email = ?", (email,))
        connection.commit()


@pytest.fixture
def student(client):
    register(client, "student@example.edu", name="Sam Student")
    return login_headers(client, "student@example.edu")


@pytest.fixture
def other_student(client):
    register(client, "other@example.edu", name="Olu Other")
    return login_headers(client, "other@example.edu")


@pytest.fixture
def admin(client):
    register(client, "admin@example.edu", name="Ada Admin")
    promote_to_admin("admin@example.edu")
    return login_headers(client, "admin@example.edu")


@pytest.fixture
def facility_id(client, admin):
    response = client.post(
        "/facilities",
        headers=admin,
        json={
            "name": "Library Study Room 204",
            "capacity": 6,
            "equipment": ["Projector"],
            "location": "Library Building",
            "opening_time": "08:00",
            "closing_time": "20:00",
        },
    )
    return response.json()["facility"]["id"]


def slot(start, end, day=FUTURE_DAY, offset="-05:00"):
    return {"start_time": f"{day}T{start}:00{offset}", "end_time": f"{day}T{end}:00{offset}"}
