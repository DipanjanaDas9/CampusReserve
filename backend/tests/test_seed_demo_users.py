import os

import pytest

from app.db import connection as db_connection
from scripts.seed_demo_users import DEMO_USERS, main, seed_demo_users


def configure_demo_passwords(monkeypatch):
    monkeypatch.setenv("CAMPUSRESERVE_ENV", "development")
    for _, _, variable, _ in DEMO_USERS:
        monkeypatch.setenv(variable, f"test-{variable.lower()}-password")


def test_demo_user_seeder_requires_development_or_demo_environment(monkeypatch):
    monkeypatch.delenv("CAMPUSRESERVE_ENV", raising=False)

    with pytest.raises(RuntimeError, match="CAMPUSRESERVE_ENV"):
        seed_demo_users()



def test_demo_user_seeder_requires_all_passwords_before_database_changes(
    monkeypatch,
):
    monkeypatch.setenv("CAMPUSRESERVE_ENV", "demo")

    for _, _, variable, _ in DEMO_USERS:
        monkeypatch.delenv(variable, raising=False)

    with db_connection.get_connection() as connection:
        before = connection.execute(
            "SELECT COUNT(*) AS total FROM users"
        ).fetchone()["total"]

    with pytest.raises(
        RuntimeError,
        match="CAMPUSRESERVE_DEMO_STUDENT1_PASSWORD",
    ):
        seed_demo_users()

    with db_connection.get_connection() as connection:
        after = connection.execute(
            "SELECT COUNT(*) AS total FROM users"
        ).fetchone()["total"]

    assert before == after


def test_demo_user_seeder_creates_accounts_that_can_log_in(client, monkeypatch):
    configure_demo_passwords(monkeypatch)

    assert seed_demo_users() == 3

    for _, email, password_variable, role in DEMO_USERS:
        response = client.post(
            "/auth/login",
            json={"email": email, "password": os.environ[password_variable]},
        )
        assert response.status_code == 200
        assert response.json()["user"]["role"] == role


def test_demo_user_seeder_rerun_preserves_existing_accounts_and_passwords(
    client, monkeypatch
):
    configure_demo_passwords(monkeypatch)
    first_password = os.environ[DEMO_USERS[0][2]]

    assert seed_demo_users() == 3
    monkeypatch.setenv(DEMO_USERS[0][2], "different-password-for-rerun")

    assert seed_demo_users() == 0
    assert client.post(
        "/auth/login",
        json={"email": DEMO_USERS[0][1], "password": first_password},
    ).status_code == 200
    assert client.post(
        "/auth/login",
        json={
            "email": DEMO_USERS[0][1],
            "password": "different-password-for-rerun",
        },
    ).status_code == 401


def test_demo_user_cli_requires_explicit_flag(monkeypatch):
    configure_demo_passwords(monkeypatch)

    with pytest.raises(SystemExit) as error:
        main([])

    assert error.value.code == 2
