import pytest

from conftest import slot


@pytest.fixture
def pending_id(client, student, facility_id):
    response = client.post("/reservations", headers=student, json={"facility_id": facility_id, "purpose": "Group study", **slot("10:00", "11:00")})
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


def test_rejection_reason_reaches_the_student_and_admin(client, admin, student, pending_id):
    response = client.patch(
        f"/reservations/{pending_id}/decision",
        headers=admin,
        json={"status": "denied", "reason": "  Closed for maintenance  "},
    )

    assert response.status_code == 200
    assert client.get("/reservations/me", headers=student).json()[0]["rejection_reason"] == "Closed for maintenance"
    assert client.get("/admin/reservations", headers=admin).json()[0]["rejection_reason"] == "Closed for maintenance"
    latest = client.get("/notifications", headers=student).json()[0]
    assert latest["title"] == "Reservation rejected"
    assert latest["body"].endswith("Reason: Closed for maintenance")


def test_rejection_without_a_reason_adds_no_reason_text(client, admin, student, pending_id):
    client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": "denied", "reason": "   "})

    assert client.get("/reservations/me", headers=student).json()[0]["rejection_reason"] is None
    assert "Reason:" not in client.get("/notifications", headers=student).json()[0]["body"]


def test_approval_does_not_store_a_reason(client, admin, student, pending_id):
    client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": "approved", "reason": "Ignored"})

    assert client.get("/reservations/me", headers=student).json()[0]["rejection_reason"] is None


def test_rejection_reason_has_a_length_limit(client, admin, pending_id):
    response = client.patch(f"/reservations/{pending_id}/decision", headers=admin, json={"status": "denied", "reason": "x" * 501})

    assert response.status_code == 422
