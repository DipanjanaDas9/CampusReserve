"""Measure how accurately room requirements are extracted from natural-language requests.

    python -m evaluation.evaluate_ai_extraction            # Gemini (needs GEMINI_API_KEY in .env)
    python -m evaluation.evaluate_ai_extraction --baseline # Sprint 4 rule-based parser, no API key

A field counts as correct only if it matches the label exactly; returning a value the
request does not state (instead of null) is wrong. Results are printed and saved as JSON.
"""

import argparse
import json
import time
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIELDS = ["group_size", "date", "start_time", "end_time", "equipment"]


def normalize_equipment(items):
    return sorted({item.strip().lower().rstrip("s") for item in items or [] if item.strip()})


def normalize_time(value):
    if not value:
        return None
    hours, minutes = value.split(":")[:2]
    return f"{int(hours):02d}:{int(minutes):02d}"


def gemini_extract(query, reference_date):
    from backend.ai.extractor import extract_room_requirements

    return extract_room_requirements(query, reference_date=reference_date).model_dump()


def baseline_extract(query, reference_date):
    from backend.ai_service import parse_room_search

    intent = parse_room_search(query)
    # The rule-based parser never extracted dates or times.
    return {"group_size": intent.capacity, "date": None, "start_time": None, "end_time": None, "equipment": intent.equipment}


def score(expected, actual):
    return {
        "group_size": expected["group_size"] == actual.get("group_size"),
        "date": expected["date"] == actual.get("date"),
        "start_time": expected["start_time"] == normalize_time(actual.get("start_time")),
        "end_time": expected["end_time"] == normalize_time(actual.get("end_time")),
        "equipment": normalize_equipment(expected["equipment"]) == normalize_equipment(actual.get("equipment")),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--baseline", action="store_true", help="evaluate the rule-based parser instead of Gemini")
    parser.add_argument("--cases", default=HERE / "ai_extraction_cases.json", type=Path)
    args = parser.parse_args()

    data = json.loads(args.cases.read_text())
    reference_date = date.fromisoformat(data["reference_date"])
    if not args.baseline:
        from backend.ai.config import GEMINI_API_KEY

        if not GEMINI_API_KEY:
            raise SystemExit("GEMINI_API_KEY is not set (project-root .env). Use --baseline to run without it.")
    extract = baseline_extract if args.baseline else gemini_extract
    label = "rule-based baseline" if args.baseline else "Gemini"

    rows, latencies, errors = [], [], 0
    for case in data["cases"]:
        started = time.perf_counter()
        try:
            actual = extract(case["query"], reference_date)
        except Exception as exc:  # count failures as all-fields-wrong, but keep going
            actual, errors = {"error": str(exc)}, errors + 1
        latencies.append((time.perf_counter() - started) * 1000)
        rows.append({"query": case["query"], "expected": {f: case[f] for f in FIELDS}, "actual": actual, "correct": score(case, actual)})

    total = len(rows)
    per_field = {f: sum(r["correct"][f] for r in rows) / total for f in FIELDS}
    field_level = sum(sum(r["correct"].values()) for r in rows) / (total * len(FIELDS))
    exact = sum(all(r["correct"].values()) for r in rows) / total
    latencies.sort()

    print(f"{label}: {total} requests, {errors} errors")
    for f in FIELDS:
        print(f"  {f:<11} {per_field[f]:6.1%}")
    print(f"  field-level {field_level:6.1%}   (target ≥ 90%)")
    print(f"  all fields  {exact:6.1%}")
    print(f"  latency     median {latencies[total // 2]:.0f} ms, max {latencies[-1]:.0f} ms")
    for r in rows:
        wrong = [f for f, ok in r["correct"].items() if not ok]
        if wrong:
            print(f"  ✗ {r['query']!r}: {', '.join(wrong)}")

    out = HERE / f"results_{'baseline' if args.baseline else 'gemini'}.json"
    out.write_text(json.dumps({"label": label, "per_field": per_field, "field_level": field_level, "all_fields": exact, "errors": errors, "rows": rows}, indent=2))
    print(f"Saved {out.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
