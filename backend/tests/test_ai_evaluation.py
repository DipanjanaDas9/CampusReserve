"""AI extraction evaluation (issue #22): the dataset, the scoring rules and the command.

These tests use a fake extractor. The real accuracy comes from running
scripts/evaluate_ai.py against Gemini, which needs an API key.
"""
import json
from datetime import date, timedelta

import pytest

from ai import config
from ai.evaluation import FIELDS, evaluate, field_matches, load_cases
from ai.extractor import RoomRequirements
from scripts.evaluate_ai import main

REFERENCE, TARGET, CASES = load_cases()


def answer(expected, **changes):
    """What a perfect extractor would return for a case, with optional mistakes."""
    values = {field: expected[field] for field in FIELDS}
    if isinstance(values["building_name"], list):
        values["building_name"] = values["building_name"][0]
    values.update(changes, missing_information=[])
    return RoomRequirements(**values)


def perfect(query, reference_date):
    return answer(next(case["expected"] for case in CASES if case["query"] == query))


def test_dataset_is_well_formed():
    assert TARGET == 0.9
    assert len(CASES) >= 30
    assert len({case["id"] for case in CASES}) == len(CASES)
    for case in CASES:
        expected = case["expected"]
        assert set(expected) == set(FIELDS), case["id"]
        answer(expected)  # every expected answer is a valid extraction
        if expected["date"]:
            assert date.fromisoformat(expected["date"]) >= REFERENCE, case["id"]
        for field in ("start_time", "end_time"):
            if expected[field]:
                assert len(expected[field]) == 5 and expected[field][2] == ":", case["id"]
        if expected["start_time"] and expected["end_time"]:
            assert expected["start_time"] < expected["end_time"], case["id"]


def test_dataset_relative_dates_match_the_reference_date():
    assert REFERENCE.strftime("%A") == "Wednesday"
    tomorrow = (REFERENCE + timedelta(days=1)).isoformat()
    for case in CASES:
        if "tomorrow" in case["query"].lower():
            assert case["expected"]["date"] == tomorrow, case["id"]


def test_dataset_covers_every_field_and_some_details_left_out():
    for field in FIELDS:
        stated = [case for case in CASES if case["expected"][field]]
        assert len(stated) >= 3, field
    assert any(case["expected"]["start_time"] is None and case["expected"]["date"] for case in CASES)
    assert any(case["expected"]["floor_number"] == 0 for case in CASES)


@pytest.mark.parametrize("field, expected, actual", [
    ("building_name", ["library", "central library"], "the Library"),
    ("building_name", "Student Center", "student center"),
    ("room_type", "study room", "Study Rooms"),
    ("room_number", "ENG-312", "eng 312"),
    ("start_time", "09:00", "09:00:00"),
    ("equipment", ["monitor", "whiteboard"], ["Whiteboards", "Monitor"]),
    ("equipment", [], []),
    ("floor_number", 0, 0),
    ("group_size", None, None),
])
def test_equivalent_answers_count_as_correct(field, expected, actual):
    assert field_matches(field, expected, actual)


@pytest.mark.parametrize("field, expected, actual", [
    ("building_name", ["library", "central library"], "Engineering Building"),
    ("building_name", None, "Engineering Building"),
    ("room_type", None, "meeting room"),
    ("group_size", 4, None),
    ("floor_number", 0, None),
    ("floor_number", 1, True),
    ("date", "2026-03-05", "2026-03-06"),
    ("start_time", "14:00", "2 PM"),
    ("equipment", ["projector"], ["projector", "whiteboard"]),
    ("equipment", [], ["computers"]),
])
def test_different_or_invented_answers_count_as_wrong(field, expected, actual):
    assert not field_matches(field, expected, actual)


def test_a_perfect_extractor_scores_100_percent():
    summary, scored = evaluate(CASES, REFERENCE, TARGET, perfect)

    assert summary["stated_field_accuracy"] == 1
    assert summary["did_not_invent_rate"] == 1
    assert summary["all_fields_correct_rate"] == 1
    assert summary["meets_target"]
    assert summary["stated_fields"] + summary["unstated_fields"] == len(CASES) * len(FIELDS)


def test_stated_and_invented_mistakes_are_counted_separately():
    cases = [CASES[0]]  # group study room for 4, no building
    summary, scored = evaluate(cases, REFERENCE, TARGET,
                               lambda q, r: answer(cases[0]["expected"], group_size=5, building_name="Science Building"))

    assert scored[0]["fields"]["group_size"]["correct"] is False
    assert summary["per_field"]["group_size"] == {"correct": 0, "total": 1, "accuracy": 0}
    stated = summary["stated_fields"]
    assert summary["stated_field_accuracy"] == (stated - 1) / stated
    assert summary["did_not_invent_rate"] < 1
    assert summary["all_fields_correct_rate"] == 0


def test_a_failed_request_is_scored_wrong_and_the_run_continues():
    def flaky(query, reference_date):
        if query == CASES[0]["query"]:
            raise RuntimeError("quota exceeded")
        return perfect(query, reference_date)

    summary, scored = evaluate(CASES[:3], REFERENCE, TARGET, flaky)

    assert summary["errors"] == 1
    assert scored[0]["error"] == "RuntimeError: quota exceeded"
    assert not any(item["correct"] for item in scored[0]["fields"].values())
    assert all(case["all_correct"] for case in scored[1:])


def test_command_passes_meeting_the_target_and_saves_results(tmp_path, capsys):
    output = tmp_path / "results.json"

    assert main(["--delay", "0", "--output", str(output)], extract=perfect) == 0

    assert "MEETS the target" in capsys.readouterr().out
    saved = json.loads(output.read_text())
    assert saved["summary"]["stated_field_accuracy"] == 1
    assert len(saved["cases"]) == len(CASES)


def test_command_fails_below_the_target_and_shows_the_wrong_values(capsys):
    def no_dates(query, reference_date):
        return perfect(query, reference_date).model_copy(update={"date": None, "start_time": None})

    assert main(["--delay", "0"], extract=no_dates) == 1

    out = capsys.readouterr().out
    assert "BELOW the target" in out
    assert "date: expected '2026-03-05', got None" in out


def test_command_limit_runs_only_the_first_cases(capsys):
    seen = []

    def record(query, reference_date):
        seen.append(query)
        return perfect(query, reference_date)

    main(["--delay", "0", "--limit", "2"], extract=record)

    assert seen == [case["query"] for case in CASES[:2]]


def test_command_without_a_gemini_key_stops_before_any_request(monkeypatch, capsys):
    monkeypatch.setattr(config, "GEMINI_API_KEY", None)

    assert main(["--delay", "0"]) == 2
    assert "GEMINI_API_KEY is not set" in capsys.readouterr().err
