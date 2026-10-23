import pytest

from conftest import slot


@pytest.fixture
def pending_id(client, student, facility_id):
    response = client.post("/reservations", headers=student, json={"facility_id": facility_id, **slot("10:00", "11:00")})
    return response.json()["reservation"]["id"]


@pytest.mark.parametrize("decision", ["approved", "denied"])
def test_admin_decides_a_pending_reservation(client, admin, student, pending_id, decision):
    response = client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": decision})

    assert response.status_code == 200
    assert client.get("/reservations/me", headers=student).json()[0]["status"] == decision


def test_a_reservation_can_only_be_decided_once(client, admin, pending_id):
    client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": "approved"})

    response = client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": "denied"})

    assert response.status_code == 409


def test_cancelled_reservation_cannot_be_decided(client, admin, student, pending_id):
    client.patch(f"/reservations/{pending_id}/cancel", headers=student)

    assert client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": "approved"}).status_code == 409


def test_students_cannot_decide_reservations(client, student, pending_id):
    assert client.patch(f"/reservations/{pending_id}/decision", headers=student, json={"status": "approved"}).status_code == 403


def test_decision_requires_login(client, pending_id):
    assert client.patch(f"/reservations/{pending_id}/decision", json={"status": "approved"}).status_code == 401


@pytest.mark.parametrize("status", ["cancelled", "pending", "maybe"])
def test_only_approve_or_deny_are_valid_decisions(client, admin, pending_id, status):
    assert client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": status}).status_code == 422


def test_deciding_a_missing_reservation_returns_404(client, admin):
    assert client.patch("/reservations/999/decision", headers=admin, json={"status": "approved"}).status_code == 404
