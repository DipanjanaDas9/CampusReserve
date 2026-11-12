"""Check-in, the admin no-show list and the admin Users list.

The booking is 10:00-12:00 Central on 2099-06-10, which is 15:00-17:00 UTC.
"""
from datetime import datetime, timezone

import pytest

from app.routers import admin as admin_router
from app.routers import reservations as reservations_router
from conftest import freeze_clock, slot


def at(hour, minute=0):
    return datetime(2099, 6, 10, hour, minute, tzinfo=timezone.utc)


@pytest.fixture
def booking(client, student, facility_id):
    response = client.post("/reservations", headers=student,
                           json={"facility_id": facility_id, "purpose": "Group study", **slot("10:00", "12:00")})
    assert response.status_code == 201
    return response.json()["reservation"]["id"]


@pytest.fixture
def approved(client, admin, booking):
    response = client.patch(f"/reservations/{booking}/decision", headers=admin, json={"status": "approved"})
    assert response.status_code == 200
    return booking


def check_in(client, headers, reservation_id, when, monkeypatch):
    freeze_clock(monkeypatch, reservations_router, when)
    return client.patch(f"/reservations/{reservation_id}/check-in", headers=headers)


def no_shows(client, headers, when, monkeypatch):
    freeze_clock(monkeypatch, admin_router, when)
    return client.get("/admin/no-shows", headers=headers)


@pytest.mark.parametrize("when", [at(14, 45), at(15, 30), at(16, 59)],
                         ids=["15-min-early", "during", "last-minute"])
def test_check_in_is_allowed_from_15_minutes_before_until_the_end(client, student, approved, monkeypatch, when):
    response = check_in(client, student, approved, when, monkeypatch)

    assert response.status_code == 200
    assert response.json()["checked_in_at"] == when.isoformat()


@pytest.mark.parametrize("when", [at(14, 44), at(17, 0)], ids=["too-early", "after-the-end"])
def test_check_in_is_refused_outside_that_window(client, student, approved, monkeypatch, when):
    response = check_in(client, student, approved, when, monkeypatch)

    assert response.status_code == 409
    assert response.json()["detail"] == "Check-in is not available at this time"


def test_checking_in_twice_is_refused(client, student, approved, monkeypatch):
    assert check_in(client, student, approved, at(15), monkeypatch).status_code == 200

    response = check_in(client, student, approved, at(15, 5), monkeypatch)

    assert response.status_code == 409
    assert response.json()["detail"] == "Already checked in"


def test_a_pending_booking_cannot_be_checked_in(client, student, booking, monkeypatch):
    assert check_in(client, student, booking, at(15), monkeypatch).status_code == 409


def test_only_the_person_who_booked_can_check_in(client, other_student, approved, monkeypatch):
    assert check_in(client, other_student, approved, at(15), monkeypatch).status_code == 403


def test_check_in_needs_a_real_booking_and_a_login(client, student, monkeypatch):
    assert check_in(client, student, 999, at(15), monkeypatch).status_code == 404
    assert client.patch("/reservations/1/check-in").status_code == 401


def test_an_approved_booking_with_no_check_in_becomes_a_no_show_after_it_ends(client, admin, approved, monkeypatch):
    assert no_shows(client, admin, at(16, 59), monkeypatch).json()["total_no_shows"] == 0

    data = no_shows(client, admin, at(17), monkeypatch).json()

    assert data["total_no_shows"] == 1
    [entry] = data["no_shows"]
    assert entry["id"] == approved
    assert entry["requester_email"] == "student@example.edu"
    assert entry["facility_name"] == "Library Study Room 204"
    assert entry["attendance_status"] == "no_show"


def test_checked_in_and_pending_bookings_are_not_no_shows(client, admin, student, other_student, approved,
                                                          facility_id, monkeypatch):
    pending = client.post("/reservations", headers=other_student,
                          json={"facility_id": facility_id, "purpose": "Later", **slot("13:00", "14:00")})
    assert pending.status_code == 201
    assert check_in(client, student, approved, at(15), monkeypatch).status_code == 200

    assert no_shows(client, admin, at(23), monkeypatch).json()["total_no_shows"] == 0


def test_students_cannot_see_the_no_show_list(client, student, approved, monkeypatch):
    assert no_shows(client, student, at(23), monkeypatch).status_code == 403


def test_admin_users_list_shows_every_account_without_passwords(client, admin, student, other_student):
    response = client.get("/admin/users", headers=admin)

    assert response.status_code == 200
    users = {user["email"]: user for user in response.json()}
    assert set(users) == {"admin@example.edu", "student@example.edu", "other@example.edu"}
    assert users["admin@example.edu"]["role"] == "admin"
    assert users["student@example.edu"]["role"] == "student"
    assert all(set(user) == {"id", "name", "email", "role", "created_at"} for user in users.values())


def test_students_and_visitors_cannot_see_the_users_list(client, student):
    assert client.get("/admin/users", headers=student).status_code == 403
    assert client.get("/admin/users").status_code == 401
