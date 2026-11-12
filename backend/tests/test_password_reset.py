"""Forgot and reset password. Emails are captured, never sent."""
from datetime import datetime, timedelta, timezone

import pytest

from app.routers import auth
from conftest import freeze_clock, login_headers, register

GENERIC = "If an account exists with that email, a password reset link will be sent."
NOW = datetime(2026, 11, 11, 18, 0, tzinfo=timezone.utc)


@pytest.fixture
def outbox(monkeypatch):
    """Capture reset emails as (address, token) instead of sending them."""
    sent = []
    monkeypatch.setattr(auth, "send_password_reset_email", lambda email, token: sent.append((email, token)))
    return sent


@pytest.fixture
def account(client):
    register(client, "reset@example.edu", password="old-password-1", name="Rita Reset")
    return "reset@example.edu"


def forgot(client, email):
    response = client.post("/auth/forgot-password", json={"email": email})
    assert response.status_code == 200
    assert response.json()["message"] == GENERIC
    return response


def reset(client, token, password="new-password-1"):
    return client.post("/auth/reset-password", json={"token": token, "new_password": password})


def valid(client, token):
    return client.post("/auth/validate-reset-token", json={"token": token}).json()["valid"]


def login(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password}).status_code


def test_unknown_email_gets_the_same_answer_and_no_email(client, outbox):
    forgot(client, "nobody@example.edu")

    assert outbox == []


def test_full_reset_changes_the_password_and_signs_out_old_sessions(client, outbox, account):
    old_session = login_headers(client, account, "old-password-1")

    response = forgot(client, "  Reset@Example.EDU ")

    [(email, token)] = outbox
    assert email == account
    assert token not in response.text
    assert valid(client, token) is True
    assert reset(client, token).status_code == 200
    assert login(client, account, "new-password-1") == 200
    assert login(client, account, "old-password-1") == 401
    assert client.get("/auth/me", headers=old_session).status_code == 401


def test_a_reset_link_works_only_once(client, outbox, account):
    forgot(client, account)
    token = outbox[0][1]

    assert reset(client, token).status_code == 200
    assert valid(client, token) is False
    assert reset(client, token, "another-password").status_code == 400
    assert login(client, account, "new-password-1") == 200


def test_a_reset_link_expires_after_15_minutes(client, outbox, account, monkeypatch):
    freeze_clock(monkeypatch, auth, NOW)
    forgot(client, account)
    token = outbox[0][1]

    freeze_clock(monkeypatch, auth, NOW + timedelta(minutes=15))

    assert valid(client, token) is False
    assert reset(client, token).status_code == 400
    assert login(client, account, "old-password-1") == 200


def test_repeat_requests_within_a_minute_send_no_second_email(client, outbox, account, monkeypatch):
    freeze_clock(monkeypatch, auth, NOW)
    forgot(client, account)
    freeze_clock(monkeypatch, auth, NOW + timedelta(seconds=59))
    forgot(client, account)

    assert len(outbox) == 1


def test_a_new_link_cancels_the_previous_one(client, outbox, account, monkeypatch):
    freeze_clock(monkeypatch, auth, NOW)
    forgot(client, account)
    freeze_clock(monkeypatch, auth, NOW + timedelta(minutes=2))
    forgot(client, account)

    (_, first), (_, second) = outbox
    assert valid(client, first) is False
    assert reset(client, first).status_code == 400
    assert reset(client, second).status_code == 200


@pytest.mark.parametrize("token, password, status", [
    ("x" * 40, "new-password-1", 400),   # unknown link
    ("short", "new-password-1", 422),    # malformed link
])
def test_bad_links_are_refused(client, token, password, status):
    assert reset(client, token, password).status_code == status


def test_a_too_short_new_password_is_refused_and_the_link_still_works(client, outbox, account):
    forgot(client, account)
    token = outbox[0][1]

    assert reset(client, token, "short").status_code == 422
    assert valid(client, token) is True


def test_without_email_settings_the_request_still_answers_normally(client, account, monkeypatch):
    for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"):
        monkeypatch.delenv(name, raising=False)

    forgot(client, account)


class FakeSMTP:
    sent = []

    def __init__(self, host, port, **kwargs):
        self.calls = [("connect", host, port)]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        FakeSMTP.sent.append(self.calls)

    def starttls(self, context=None):
        self.calls.append(("starttls",))

    def login(self, user, password):
        self.calls.append(("login", user))

    def send_message(self, message):
        self.calls.append(("send", message))


@pytest.mark.parametrize("port, expected_class", [("587", "SMTP"), ("465", "SMTP_SSL")])
def test_the_email_contains_a_working_link_and_uses_the_right_connection(monkeypatch, port, expected_class):
    FakeSMTP.sent = []
    used = []
    monkeypatch.setattr(auth.smtplib, "SMTP", lambda *a, **k: used.append("SMTP") or FakeSMTP(*a, **k))
    monkeypatch.setattr(auth.smtplib, "SMTP_SSL", lambda *a, **k: used.append("SMTP_SSL") or FakeSMTP(*a, **k))
    monkeypatch.setenv("SMTP_HOST", "smtp.example.edu")
    monkeypatch.setenv("SMTP_PORT", port)
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "noreply@example.edu")
    monkeypatch.setenv("FRONTEND_URL", "https://reserve.example.edu/")

    auth.send_password_reset_email("reset@example.edu", "token+with/symbols")

    [calls] = FakeSMTP.sent
    assert used == [expected_class]
    assert calls[0] == ("connect", "smtp.example.edu", int(port))
    assert (("starttls",) in calls) == (port == "587")
    assert ("login", "mailer") in calls
    message = calls[-1][1]
    assert message["To"] == "reset@example.edu"
    assert "https://reserve.example.edu/reset-password?token=token%2Bwith/symbols" in message.get_content()
    assert "expires in 15 minutes" in message.get_content()


def test_sending_without_email_settings_raises_so_it_is_logged(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)

    with pytest.raises(RuntimeError, match="not configured"):
        auth.send_password_reset_email("reset@example.edu", "token")
