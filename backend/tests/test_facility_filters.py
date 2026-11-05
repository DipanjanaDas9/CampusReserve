import json
from contextlib import closing

import pytest

from app.db.connection import get_connection
from scripts.seed_demo import seed_demo


@pytest.fixture
def catalog():
    seed_demo()


def test_combined_building_floor_capacity_and_equipment(client, catalog):
    response = client.get('/facilities', params=[
        ('building_name', ' central library '), ('floor_number', '2'),
        ('min_capacity', '5'), ('max_capacity', '10'),
        ('equipment', 'monitors'), ('equipment', ' WHITEBOARD '),
    ])
    assert response.status_code == 200
    assert [room['room_number'] for room in response.json()] == ['LIB-202']


def test_floor_zero_and_capacity_boundaries(client, admin):
    from test_facilities import ROOM
    created = client.post('/facilities', headers=admin, json={**ROOM,
        'building_name': 'Ground Hall', 'floor_number': 0, 'room_number': 'G01'})
    assert created.status_code == 201
    result = client.get('/facilities', params={'floor_number': 0, 'min_capacity': 10, 'max_capacity': 10})
    assert [r['id'] for r in result.json()] == [created.json()['facility']['id']]
    assert client.get('/facilities', params={'floor_number': 1}).json() == []


def test_unfiltered_compatibility_and_active_filter(client, catalog):
    rooms = client.get('/facilities').json()
    assert len(rooms) == 30
    assert all(isinstance(r['equipment'], list) and isinstance(r['is_active'], bool) for r in rooms)
    assert len(client.get('/facilities', params={'is_active': False}).json()) == 2
    assert len(client.get('/facilities', params={'is_active': True}).json()) == 28
    assert client.get('/facilities', params={'equipment': 'Nonexistent equipment'}).json() == []


@pytest.mark.parametrize('params', [
    {'min_capacity': 0}, {'max_capacity': -1}, {'floor_number': 'not-a-floor'},
    {'min_capacity': 20, 'max_capacity': 5}, {'equipment': '   '},
    {'building_name': ' '}, {'is_active': 'unknown'},
])
def test_filter_validation(client, params):
    assert client.get('/facilities', params=params).status_code == 422


def test_building_filter_is_parameterized(client, catalog):
    assert client.get('/facilities', params={'building_name': "' OR 1=1 --"}).json() == []
    assert len(client.get('/facilities').json()) == 30


@pytest.mark.parametrize('raw', ['broken-json', '{"Monitor": true}', '["Monitor", 42]', 'null'])
def test_invalid_legacy_equipment_does_not_break_list_or_details(client, catalog, raw, caplog):
    with closing(get_connection()) as connection, connection:
        room_id = connection.execute('SELECT id FROM facilities ORDER BY id LIMIT 1').fetchone()[0]
        connection.execute('UPDATE facilities SET equipment=? WHERE id=?', (raw, room_id))
    listed = client.get('/facilities')
    assert listed.status_code == 200
    assert next(r for r in listed.json() if r['id'] == room_id)['equipment'] == []
    assert client.get(f'/facilities/{room_id}').json()['equipment'] == []
    assert 'Invalid equipment JSON' in caplog.text
    assert room_id not in [r['id'] for r in client.get('/facilities', params={'equipment': 'Monitor'}).json()]
    with closing(get_connection()) as connection:
        assert connection.execute('SELECT equipment FROM facilities WHERE id=?', (room_id,)).fetchone()[0] == raw


def test_sqlite_json_equipment_round_trip(client, admin):
    from test_facilities import ROOM
    payload = {**ROOM, 'equipment': ['Monitor', 'Écran', 'Whiteboard']}
    created = client.post('/facilities', headers=admin, json=payload)
    assert created.status_code == 201
    room_id = created.json()['facility']['id']
    assert client.get(f'/facilities/{room_id}').json()['equipment'] == payload['equipment']
    with closing(get_connection()) as connection:
        assert json.loads(connection.execute('SELECT equipment FROM facilities WHERE id=?', (room_id,)).fetchone()[0]) == payload['equipment']


def test_catalog_filters_do_not_bypass_booking_or_availability_rules(client, admin, student, catalog):
    from conftest import slot
    room = client.get('/facilities', params={'building_name': 'Central Library', 'floor_number': 1, 'max_capacity': 4}).json()[0]
    url = f"/facilities/{room['id']}/availability"
    times = slot('10:00', '11:00')
    assert client.get(url, params={**times, 'attendees': 4}).json()['available'] is True
    assert client.get(url, params={**times, 'attendees': 5}).json()['available'] is False
    booked = client.post('/reservations', headers=student, json={**times, 'facility_id': room['id'], 'purpose': 'Study'})
    assert booked.status_code == 201
    assert client.get(url, params=times).json()['available'] is False
    assert client.post('/reservations', headers=student, json={**times, 'facility_id': room['id'], 'purpose': 'Overlap'}).status_code == 409
    client.patch(f"/reservations/{booked.json()['reservation']['id']}/cancel", headers=student)
    assert client.get(url, params=times).json()['available'] is True
    assert client.get(url, params=slot('07:00', '08:00')).json()['available'] is False
    client.patch(f"/facilities/{room['id']}/status", headers=admin, json={'is_active': False})
    assert client.get(url, params=times).json()['available'] is False
