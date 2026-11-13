"""Score AI requirement extraction against hand-written expected values (issue #22).

The headline metric is accuracy on stated fields: of the details a request
actually gives (group size, date, equipment and so on), how many the AI extracted
correctly. Fields a request leaves out are scored separately, as "did not
invent", because counting them in the headline would inflate it: most requests
leave most fields empty.
"""
import json
from datetime import date, time
from pathlib import Path

CASES_PATH = Path(__file__).with_name("evaluation_cases.json")
FIELDS = ("building_name", "floor_number", "room_number", "room_type", "group_size",
          "date", "start_time", "end_time", "equipment")
ARTICLES = {"the", "a", "an"}


def load_cases(path=CASES_PATH):
    data = json.loads(Path(path).read_text())
    return date.fromisoformat(data["reference_date"]), data["target"], data["cases"]


def _text(value):
    words = str(value).strip().casefold().replace("-", " ").split()
    while words and words[0] in ARTICLES:
        words = words[1:]
    return " ".join(words).rstrip("s")


def _clock(value):
    try:
        return time.fromisoformat(str(value).strip()).isoformat(timespec="minutes")
    except ValueError:
        return None


def field_matches(field, expected, actual):
    """True when the extracted value means the same as the expected one.

    A list for a text field lists every acceptable answer, for example
    ["library", "central library"] for "the library".
    """
    if field == "equipment":
        return {_text(item) for item in expected or []} == {_text(item) for item in actual or [] if str(item).strip()}
    if expected is None or actual is None or actual == "":
        return expected is None and actual in (None, "")
    if field in ("floor_number", "group_size"):
        return isinstance(actual, int) and not isinstance(actual, bool) and actual == expected
    if field == "date":
        return str(actual).strip() == expected
    if field in ("start_time", "end_time"):
        return _clock(actual) == expected
    accepted = expected if isinstance(expected, list) else [expected]
    return _text(actual) in {_text(option) for option in accepted}


def is_stated(field, expected):
    return bool(expected) if field == "equipment" else expected is not None


def score_case(case, actual):
    """Compare one case; actual is the extracted dict, or None when extraction failed."""
    fields = {}
    for field in FIELDS:
        expected = case["expected"][field]
        value = None if actual is None else actual.get(field)
        fields[field] = {"expected": expected, "actual": value, "stated": is_stated(field, expected),
                         "correct": actual is not None and field_matches(field, expected, value)}
    return {"id": case["id"], "query": case["query"], "fields": fields,
            "all_correct": all(item["correct"] for item in fields.values())}


def _rate(correct, total):
    return correct / total if total else None


def summarize(scored, target):
    stated = [item for case in scored for item in case["fields"].values() if item["stated"]]
    unstated = [item for case in scored for item in case["fields"].values() if not item["stated"]]
    per_field = {}
    for field in FIELDS:
        items = [case["fields"][field] for case in scored if case["fields"][field]["stated"]]
        per_field[field] = {"correct": sum(i["correct"] for i in items), "total": len(items),
                            "accuracy": _rate(sum(i["correct"] for i in items), len(items))}
    stated_accuracy = _rate(sum(i["correct"] for i in stated), len(stated))
    return {
        "cases": len(scored),
        "errors": sum(1 for case in scored if case.get("error")),
        "stated_field_accuracy": stated_accuracy,
        "stated_fields": len(stated),
        "did_not_invent_rate": _rate(sum(i["correct"] for i in unstated), len(unstated)),
        "unstated_fields": len(unstated),
        "all_fields_correct_rate": _rate(sum(case["all_correct"] for case in scored), len(scored)),
        "per_field": per_field,
        "target": target,
        "meets_target": stated_accuracy is not None and stated_accuracy >= target,
    }


def evaluate(cases, reference_date, target, extract):
    """Run extract(query, reference_date) for every case and score the answers."""
    scored = []
    for case in cases:
        try:
            actual = extract(case["query"], reference_date).model_dump()
            error = None
        except Exception as exc:  # one failed request is scored as wrong, not fatal
            actual, error = None, f"{type(exc).__name__}: {exc}"
        result = score_case(case, actual)
        result["error"] = error
        scored.append(result)
    return summarize(scored, target), scored
