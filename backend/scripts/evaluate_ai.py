"""Measure how accurately Gemini extracts booking details (issue #22).

Run from backend with GEMINI_API_KEY set here or in backend/.env:
    python scripts/evaluate_ai.py --output ai-evaluation.json

Sends each request in ai/evaluation_cases.json to Gemini once, compares the
answer with the expected values and prints the accuracy. Exits 0 when accuracy on
stated fields meets the target (90%), 1 when it does not, and 2 when Gemini is
not configured. Each case is one Gemini request, so a run uses about 30 requests
of your quota.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai.evaluation import CASES_PATH, FIELDS, evaluate, load_cases  # noqa: E402


def percent(value):
    return "n/a" if value is None else f"{value:.1%}"


def report(summary, scored):
    lines = []
    for case in scored:
        wrong = [field for field in FIELDS if not case["fields"][field]["correct"]]
        status = "ERROR " + case["error"] if case["error"] else ("ok" if not wrong else "wrong: " + ", ".join(wrong))
        lines.append(f"  {case['id']:<24} {status}")
        if not case["error"]:
            for field in wrong:
                item = case["fields"][field]
                lines.append(f"      {field}: expected {item['expected']!r}, got {item['actual']!r}")
    lines += [
        "",
        "Per field (stated in the request):",
        *(f"  {field:<14} {data['correct']}/{data['total']}  {percent(data['accuracy'])}"
          for field, data in summary["per_field"].items() if data["total"]),
        "",
        f"Cases: {summary['cases']} ({summary['errors']} failed requests)",
        f"Stated-field accuracy: {percent(summary['stated_field_accuracy'])} "
        f"of {summary['stated_fields']} fields (target {percent(summary['target'])})",
        f"Did not invent unstated details: {percent(summary['did_not_invent_rate'])} "
        f"of {summary['unstated_fields']} fields",
        f"Requests with every field correct: {percent(summary['all_fields_correct_rate'])}",
        "Result: " + ("MEETS the target" if summary["meets_target"] else "BELOW the target"),
    ]
    return "\n".join(lines)


def main(argv=None, extract=None):
    parser = argparse.ArgumentParser(description="Measure Gemini requirement-extraction accuracy.")
    parser.add_argument("--cases", type=Path, default=CASES_PATH, help="Evaluation cases JSON file")
    parser.add_argument("--limit", type=int, help="Only run the first N cases")
    parser.add_argument("--delay", type=float, default=1.0, help="Seconds to wait between requests (default 1)")
    parser.add_argument("--output", type=Path, help="Also save the full results as JSON here")
    args = parser.parse_args(argv)

    if extract is None:
        from ai.config import GEMINI_API_KEY, GEMINI_MODEL
        from ai.extractor import extract_room_requirements as extract

        if not GEMINI_API_KEY:
            print("GEMINI_API_KEY is not set. Add it to backend/.env to run the evaluation.", file=sys.stderr)
            return 2
        print(f"Model: {GEMINI_MODEL}")

    reference_date, target, cases = load_cases(args.cases)
    cases = cases[: args.limit] if args.limit else cases

    def paced(query, reference):
        if paced.calls and args.delay:
            time.sleep(args.delay)
        paced.calls += 1
        return extract(query, reference)
    paced.calls = 0

    print(f"Running {len(cases)} cases with reference date {reference_date}...")
    summary, scored = evaluate(cases, reference_date, target, paced)
    print(report(summary, scored))

    if args.output:
        args.output.write_text(json.dumps({"summary": summary, "cases": scored}, indent=2) + "\n")
        print(f"Saved full results to {args.output}")
    return 0 if summary["meets_target"] else 1


if __name__ == "__main__":
    sys.exit(main())
