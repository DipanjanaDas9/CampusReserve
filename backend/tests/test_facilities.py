import pytest

from conftest import promote_to_admin, register, login_headers

ROOM = {"name": "Engineering Room 312", "capacity": 10, "equipment": ["Projector", "Monitor"], "location": "Engineering Building",
        "opening_time": "09:00", "closing_time": "18:00", "restrictions": "No food"}


def test_admin_creates_updates_and_deletes_a_facility(client, admin):
    created = client.post("/facilities", headers=admin, json=ROOM)
    assert created.status_code == 201
    facility_id = created.json()["facility"]["id"]

    assert client.get(f"/facilities/{facility_id}").json() == {"id": facility_id, **ROOM}

    updated = client.put(f"/facilities/{facility_id}", headers=admin, json={**ROOM, "capacity": 12})
    assert updated.status_code == 200
    assert client.get(f"/facilities/{facility_id}").json()["capacity"] == 12

    assert client.delete(f"/facilities/{facility_id}", headers=admin).status_code == 200
    assert client.get(f"/facilities/{facility_id}").status_code == 404


def test_anyone_can_list_facilities(client, admin):
    client.post("/facilities", headers=admin, json=ROOM)

    assert [f["name"] for f in client.get("/facilities").json()] == ["Engineering Room 312"]


@pytest.mark.parametrize(
    "method, path",
    [("post", "/facilities"), ("put", "/facilities/1"), ("delete", "/facilities/1")],
)
def test_students_cannot_change_facilities(client, student, method, path):
    kwargs = {"json": ROOM} if method != "delete" else {}

    assert getattr(client, method)(path, headers=student, **kwargs).status_code == 403


@pytest.mark.parametrize(
    "method, path",
    [("post", "/facilities"), ("put", "/facilities/1"), ("delete", "/facilities/1")],
)
def test_facility_changes_require_login(client, method, path):
    kwargs = {"json": ROOM} if method != "delete" else {}

    assert getattr(client, method)(path, **kwargs).status_code == 401


@pytest.mark.parametrize("change", [{"capacity": 0}, {"name": ""}], ids=["zero-capacity", "empty-name"])
def test_invalid_facility_is_rejected(client, admin, change):
    assert client.post("/facilities", headers=admin, json={**ROOM, **change}).status_code == 422


def test_missing_facility_returns_404(client, admin):
    assert client.get("/facilities/999").status_code == 404
    assert client.put("/facilities/999", headers=admin, json=ROOM).status_code == 404
    assert client.delete("/facilities/999", headers=admin).status_code == 404


def test_make_admin_script_promotes_a_registered_user(client):
    from scripts.make_admin import make_admin

    register(client, "promote@example.edu")
    make_admin("Promote@Example.edu")

    me = client.get("/auth/me", headers=login_headers(client, "promote@example.edu")).json()
    assert me["role"] == "admin"
    with pytest.raises(SystemExit):
        make_admin("nobody@example.edu")


def test_promoted_user_can_manage_facilities(client):
    register(client, "late-admin@example.edu")
    promote_to_admin("late-admin@example.edu")

    response = client.post("/facilities", headers=login_headers(client, "late-admin@example.edu"), json=ROOM)

    assert response.status_code == 201
