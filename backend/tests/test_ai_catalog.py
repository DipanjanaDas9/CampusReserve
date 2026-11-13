from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from ai.extractor import RoomRequirements
from app.routers import ai
from test_facilities import ROOM


@pytest.fixture
def ai_room(client, admin):
    payload = {**ROOM, 'name': 'Central Library LIB-301', 'building_name': 'Central Library',
        'floor_number': 3, 'room_number': 'LIB-301', 'room_type': 'Study room',
        'capacity': 8, 'equipment': ['Projector', 'Whiteboard'], 'opening_time': '08:00', 'closing_time': '22:00'}
    return client.post('/facilities', headers=admin, json=payload).json()['facility']


def mock_requirements(monkeypatch, **changes):
    values = dict(group_size=6, date='2099-06-10', start_time='14:00', end_time='16:00',
        building_name='the library', floor_number=3, room_type='Study rooms',
        equipment=['projectors'], missing_information=[])
    values.update(changes)
    monkeypatch.setattr(ai, 'extract_room_requirements', lambda *args, **kwargs: RoomRequirements(**values))


def test_catalog_ai_matches_database_and_manual_search_still_works(client, student, ai_room, monkeypatch):
    mock_requirements(monkeypatch)
    result = client.post('/rooms/ai-search', headers=student, json={'query': 'Study room for 6 on the third floor of the library with a projector, June 10 2099 2 to 4 PM'})
    assert result.status_code == 200
    assert result.json()['interpreted_requirements']['building_name'] == 'Central Library'
    assert [r['id'] for r in result.json()['results']] == [ai_room['id']]
    manual = client.get('/facilities', params={'building_name': 'Central Library', 'floor_number': 3, 'min_capacity': 6, 'equipment': 'Projector'})
    assert [r['id'] for r in manual.json()] == [ai_room['id']]


def test_example_requests_missing_times_and_uses_campus_reference_date(client, student, ai_room, monkeypatch):
    captured = {}
    def extract(query, reference_date):
        captured['reference'] = reference_date
        return RoomRequirements(group_size=6, date=(reference_date + timedelta(days=1)).isoformat(),
            start_time=None, end_time=None, building_name='library', floor_number=3,
            room_type='Study room', equipment=['Projector'], missing_information=['start time', 'end time'])
    monkeypatch.setattr(ai, 'extract_room_requirements', extract)
    response = client.post('/rooms/ai-search', headers=student, json={'query': 'Find a study room for 6 people on the third floor of the library tomorrow with a projector.'})
    interpreted = response.json()['interpreted_requirements']
    assert captured['reference'] == datetime.now(ZoneInfo('America/Chicago')).date()
    assert interpreted['date'] == (captured['reference'] + timedelta(days=1)).isoformat()
    assert {'start time', 'end time'}.issubset(interpreted['missing_information'])
    assert response.json()['results'] == []


@pytest.mark.parametrize('changes', [
    {'floor_number': 2}, {'group_size': 9}, {'equipment': ['Computers']},
    {'start_time': '07:00', 'end_time': '08:00'}, {'building_name': 'Unknown Building'},
])
def test_ai_excludes_nonmatching_database_rooms(client, student, ai_room, monkeypatch, changes):
    mock_requirements(monkeypatch, **changes)
    response = client.post('/rooms/ai-search', headers=student, json={'query': 'Find a room'})
    assert response.status_code == 200
    assert response.json()['results'] == []


def test_ai_checks_pending_bookings_and_inactive_status(client, student, admin, ai_room, monkeypatch):
    mock_requirements(monkeypatch)
    booking = client.post('/reservations', headers=student, json={'facility_id': ai_room['id'],
        'start_time': '2099-06-10T14:00:00-05:00', 'end_time': '2099-06-10T16:00:00-05:00', 'purpose': 'Study'})
    assert booking.status_code == 201
    assert client.post('/rooms/ai-search', headers=student, json={'query': 'Find a room'}).json()['results'] == []
    client.patch(f"/reservations/{booking.json()['reservation']['id']}/cancel", headers=student)
    assert len(client.post('/rooms/ai-search', headers=student, json={'query': 'Find a room'}).json()['results']) == 1
    client.patch(f"/facilities/{ai_room['id']}/status", headers=admin, json={'is_active': False})
    assert client.post('/rooms/ai-search', headers=student, json={'query': 'Find a room'}).json()['results'] == []


def test_ambiguous_library_asks_for_building_instead_of_guessing(client, student, admin, ai_room, monkeypatch):
    client.post('/facilities', headers=admin, json={**ROOM, 'building_name': 'West Library', 'floor_number': 3, 'room_number': 'WEST-301'})
    mock_requirements(monkeypatch)
    data = client.post('/rooms/ai-search', headers=student, json={'query': 'Room in the library'}).json()
    assert data['results'] == []
    assert data['interpreted_requirements']['building_options'] == ['Central Library', 'West Library']


def test_explicit_time_overrides_are_used(client, student, ai_room, monkeypatch):
    mock_requirements(monkeypatch, start_time=None, end_time=None)
    data = client.post('/rooms/ai-search', headers=student, json={'query': 'Study room', 'date': '2099-06-10', 'start_time': '14:00', 'end_time': '16:00'}).json()
    assert [r['id'] for r in data['results']] == [ai_room['id']]
