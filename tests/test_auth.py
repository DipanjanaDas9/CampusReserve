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


SEARCH_PARAMS = {"date": "2099-06-10", "start_time": "10:00", "end_time": "11:00", "min_capacity": 1}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATABASE_PATH", tmp_path / "test.db")
    main.initialize_database()
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True, scope="session")
def remove_import_test_database():
    yield
    shutil.rmtree(TEST_DATABASE_DIRECTORY, ignore_errors=True)


def register(client, name="Test Student", email="student@example.edu", password="correct-horse-1"):
    return client.post("/auth/register", json={"name": name, "email": email, "password": password})


def login(client, email="student@example.edu", password="correct-horse-1"):
    return client.post("/auth/login", json={"email": email, "password": password})


def stored_hash(email):
    with main.get_connection() as connection:
        return connection.execute(
            "SELECT password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()["password_hash"]


def test_register_creates_account_with_normalized_email(client):
    response = register(client, name="  Test Student  ", email="  Student@Example.EDU ")

    assert response.status_code == 201
    assert response.json()["user"]["name"] == "Test Student"
    assert response.json()["user"]["email"] == "student@example.edu"


def test_duplicate_email_is_rejected_case_insensitively(client):
    register(client)

    response = register(client, email="STUDENT@example.edu")

    assert response.status_code == 409


@pytest.mark.parametrize(
    "overrides, status",
    [
        ({"email": "not-an-email"}, 400),
        ({"name": "   "}, 400),
        ({"password": "short"}, 422),
        ({"name": ""}, 422),
    ],
)
def test_invalid_registration_is_rejected(client, overrides, status):
    assert register(client, **overrides).status_code == status


def test_password_is_stored_as_salted_hash(client):
    register(client, email="a@example.edu", password="same-password-1")
    register(client, email="b@example.edu", password="same-password-1")

    hash_a = stored_hash("a@example.edu")
    hash_b = stored_hash("b@example.edu")

    assert "same-password-1" not in hash_a
    assert hash_a != hash_b
    assert main.verify_password("same-password-1", hash_a)


def test_login_returns_token_for_registered_user(client):
    user_id = register(client).json()["user"]["id"]

    response = login(client, email="STUDENT@example.edu")

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    payload = main.jwt.decode(body["access_token"], main.SECRET_KEY, algorithms=[main.ALGORITHM])
    assert payload["sub"] == str(user_id)
    assert "password_hash" not in body["user"]


def test_wrong_password_and_unknown_email_give_same_error(client):
    register(client)

    wrong_password = login(client, password="wrong-password")
    unknown_email = login(client, email="nobody@example.edu")

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_login_token_grants_access_to_protected_endpoint(client):
    register(client)
    token = login(client).json()["access_token"]

    response = client.get("/rooms/search", params=SEARCH_PARAMS, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200


@pytest.mark.parametrize(
    "token",
    [
        main.jwt.encode(
            {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            main.SECRET_KEY,
            algorithm=main.ALGORITHM,
        ),
        main.jwt.encode(
            {"sub": "1", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "not-the-server-secret",
            algorithm=main.ALGORITHM,
        ),
        "not-a-jwt",
    ],
    ids=["expired", "wrong-signature", "malformed"],
)
def test_invalid_tokens_are_rejected(client, token):
    response = client.get("/rooms/search", params=SEARCH_PARAMS, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401
