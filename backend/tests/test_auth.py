import pytest

from conftest import login_headers, register


def test_register_creates_student_account(client):
    response = register(client, "new@example.edu", name="  New Student  ")

    assert response.status_code == 201
    assert response.json()["user"] == {"id": 1, "name": "New Student", "email": "new@example.edu"}


def test_duplicate_email_is_rejected_case_insensitively(client):
    register(client, "dup@example.edu")

    assert register(client, "DUP@example.edu").status_code == 409


@pytest.mark.parametrize(
    "payload, status",
    [
        ({"name": "A", "email": "short@example.edu", "password": "short"}, 422),
        ({"name": "A", "email": "not-an-email", "password": "password-123"}, 400),
        ({"name": "   ", "email": "blank@example.edu", "password": "password-123"}, 400),
    ],
    ids=["short-password", "invalid-email", "blank-name"],
)
def test_invalid_registration_is_rejected(client, payload, status):
    assert client.post("/auth/register", json=payload).status_code == status


def test_login_returns_token_and_role(client):
    register(client, "sam@example.edu")

    response = client.post("/auth/login", json={"email": "Sam@Example.edu", "password": "password-123"})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer" and body["access_token"]
    assert body["user"]["role"] == "student"
    assert "password_hash" not in body["user"]


def test_wrong_password_and_unknown_email_give_the_same_401(client):
    register(client, "sam@example.edu")

    wrong_password = client.post("/auth/login", json={"email": "sam@example.edu", "password": "wrong-password"})
    unknown_email = client.post("/auth/login", json={"email": "nobody@example.edu", "password": "password-123"})

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


def test_me_returns_the_signed_in_user(client):
    register(client, "sam@example.edu", name="Sam")

    response = client.get("/auth/me", headers=login_headers(client, "sam@example.edu"))

    assert response.json() == {"id": 1, "name": "Sam", "email": "sam@example.edu", "role": "student"}


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer not-a-jwt"}], ids=["no-token", "bad-token"])
def test_me_requires_a_valid_token(client, headers):
    assert client.get("/auth/me", headers=headers).status_code == 401
