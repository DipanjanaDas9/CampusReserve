
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from backend.ai.extractor import (
    RoomRequirements,
    extract_room_requirements,
)


def test_empty_request_is_rejected():
    with pytest.raises(ValueError):
        extract_room_requirements("")


def test_whitespace_request_is_rejected():
    with pytest.raises(ValueError):
        extract_room_requirements("   ")


def test_room_requirements_schema():
    requirements = RoomRequirements(
        group_size=6,
        date="2026-11-01",
        start_time="10:00",
        end_time="11:00",
        equipment=["projector"],
        missing_information=[],
    )

    assert requirements.group_size == 6
    assert requirements.date == "2026-11-01"
    assert requirements.start_time == "10:00"
    assert requirements.end_time == "11:00"
    assert requirements.equipment == ["projector"]


def test_unknown_requirements_can_be_empty():
    requirements = RoomRequirements(
        group_size=None,
        date=None,
        start_time=None,
        end_time=None,
        equipment=[],
        missing_information=["date", "start time"],
    )

    assert requirements.group_size is None
    assert requirements.date is None
    assert requirements.equipment == []


def test_reference_date_is_optional():
    assert date(2026, 11, 1).isoformat() == "2026-11-01"


@patch("backend.ai.extractor.get_gemini_client")
def test_extract_requirements_using_mocked_ai(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    expected = RoomRequirements(
        group_size=6,
        date="2026-11-01",
        start_time="10:00",
        end_time="11:00",
        equipment=["projector", "whiteboard"],
        missing_information=[],
    )

    mock_response = MagicMock()
    mock_response.text = expected.model_dump_json()
    mock_client.models.generate_content.return_value = mock_response

    result = extract_room_requirements(
        "Find a room for 6 people on November 1, 2026, "
        "from 10 AM to 11 AM with a projector and whiteboard",
        reference_date=date(2026, 10, 21),
    )

    assert result == expected
    mock_client.models.generate_content.assert_called_once()
    mock_get_client.assert_called_once()


@patch("backend.ai.extractor.get_gemini_client")
def test_extractor_handles_empty_ai_response(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client

    mock_response = MagicMock()
    mock_response.text = None
    mock_client.models.generate_content.return_value = mock_response

    with pytest.raises(RuntimeError, match="did not return structured"):
        extract_room_requirements("Find a room")

    mock_get_client.assert_called_once()
