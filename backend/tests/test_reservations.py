import pytest

from conftest import slot


def book(client, headers, facility_id, start="10:00", end="12:00", **kwargs):
    return client.post("/reservations", headers=headers, json={"facility_id": facility_id, **slot(start, end, **kwargs)})


def test_booking_creates_a_pending_reservation(client, student, facility_id):
    response = book(client, student, facility_id)

    assert response.status_code == 201
    reservation = response.json()["reservation"]
    assert reservation["status"] == "pending"
    # 10:00 in Chicago (UTC-05:00 in June) is stored as 15:00 UTC.
    assert reservation["start_time"] == "2099-06-10T15:00:00+00:00"


@pytest.mark.parametrize(
    "start, end",
    [("11:00", "13:00"), ("09:00", "11:00"), ("10:30", "11:30"), ("09:00", "13:00")],
    ids=["overlaps-end", "overlaps-start", "inside", "surrounds"],
)
def test_overlapping_pending_booking_is_rejected(client, student, other_student, facility_id, start, end):
    book(client, student, facility_id)

    response = book(client, other_student, facility_id, start, end)

    assert response.status_code == 409


def test_overlapping_approved_booking_is_rejected(client, student, other_student, admin, facility_id):
    reservation_id = book(client, student, facility_id).json()["reservation"]["id"]
    client.patch(f"/reservations/{reservation_id}/decision", headers=admin, json={"status": "approved"})

    assert book(client, other_student, facility_id, "11:00", "12:00").status_code == 409


def test_back_to_back_bookings_are_allowed(client, student, other_student, facility_id):
    book(client, student, facility_id, "10:00", "12:00")

    assert book(client, other_student, facility_id, "12:00", "13:00").status_code == 201
    assert book(client, other_student, facility_id, "08:00", "10:00").status_code == 201


def test_cancelled_or_denied_bookings_free_the_slot(client, student, other_student, admin, facility_id):
    first = book(client, student, facility_id).json()["reservation"]["id"]
    client.patch(f"/reservations/{first}/cancel", headers=student)
    second = book(client, other_student, facility_id).json()["reservation"]["id"]
    client.patch(f"/reservations/{second}/decision", headers=admin, json={"status": "denied"})

    assert book(client, student, facility_id).status_code == 201


@pytest.mark.parametrize(
    "times, status",
    [
        ({"day": "2000-01-01"}, 400),
        ({"start": "12:00", "end": "11:00"}, 400),
        ({"offset": ""}, 400),
        ({"start": "07:00", "end": "09:00"}, 409),
        ({"start": "19:00", "end": "21:00"}, 409),
    ],
    ids=["past", "end-before-start", "no-timezone", "before-opening", "after-closing"],
)
def test_invalid_times_are_rejected(client, student, facility_id, times, status):
    assert book(client, student, facility_id, **times).status_code == status


def test_facility_without_opening_hours_cannot_be_booked(client, student, admin):
    created = client.post("/facilities", headers=admin, json={"name": "Quiet Pod", "capacity": 2})
    pod_id = created.json()["facility"]["id"]

    assert book(client, student, pod_id).status_code == 409


def test_unknown_facility_returns_404(client, student):
    assert book(client, student, 999).status_code == 404


def test_booking_requires_login(client, facility_id):
    assert client.post("/reservations", json={"facility_id": facility_id, **slot("10:00", "11:00")}).status_code == 401


def test_my_reservations_lists_only_my_bookings(client, student, other_student, facility_id):
    book(client, student, facility_id)

    mine = client.get("/reservations/me", headers=student).json()
    assert [(r["facility_name"], r["status"]) for r in mine] == [("Library Study Room 204", "pending")]
    assert client.get("/reservations/me", headers=other_student).json() == []


def test_student_cancels_own_reservation(client, student, facility_id):
    reservation_id = book(client, student, facility_id).json()["reservation"]["id"]

    response = client.patch(f"/reservations/{reservation_id}/cancel", headers=student)

    assert response.status_code == 200
    assert client.get("/reservations/me", headers=student).json()[0]["status"] == "cancelled"
    assert client.patch(f"/reservations/{reservation_id}/cancel", headers=student).status_code == 409


def test_student_cannot_cancel_someone_elses_reservation(client, student, other_student, facility_id):
    reservation_id = book(client, student, facility_id).json()["reservation"]["id"]

    assert client.patch(f"/reservations/{reservation_id}/cancel", headers=other_student).status_code == 403


def test_cancelling_a_missing_reservation_returns_404(client, student):
    assert client.patch("/reservations/999/cancel", headers=student).status_code == 404
