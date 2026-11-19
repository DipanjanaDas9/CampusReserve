"""CampusReserve stress test (Locust).

Simulated students register, sign in, browse rooms and book and cancel rooms
while the number of users rises in steps. Each step is checked against NFR-02
(95% of responses within 3 seconds) and an error rate below 1%. Every user also
tries to book one shared "race" slot, and at most one of those bookings may
succeed; more than one would mean double booking under load.

Run against a running backend (never production data):

    locust -f stress/locustfile.py --host http://127.0.0.1:8000 --headless

Settings (environment variables):
    STRESS_STEPS          users per step, default "25,50,100,200"
    STRESS_STEP_SECONDS   length of each step, default 60
    STRESS_SPAWN_RATE     users started per second, default 10
    STRESS_REPORT         where to write the JSON summary, default stress/stress_results.json

AI search is not included: Gemini's free tier allows about 15 requests a
minute, so loading it would only measure Google's rate limit.
"""

import json
import os
import random
import secrets
import threading
import time
import uuid
from datetime import date, datetime, time as clock, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from locust import HttpUser, LoadTestShape, between, events, task

CAMPUS = ZoneInfo("America/Chicago")
STEPS = [int(n) for n in os.getenv("STRESS_STEPS", "25,50,100,200").split(",")]
STEP_SECONDS = int(os.getenv("STRESS_STEP_SECONDS", "60"))
SPAWN_RATE = float(os.getenv("STRESS_SPAWN_RATE", "10"))
REPORT = Path(os.getenv("STRESS_REPORT", Path(__file__).with_name("stress_results.json")))
TARGET_P95_MS = 3000
MAX_ERROR_RATE = 0.01

# Every user tries to book this one hour; only one booking may succeed.
RACE_FACILITY = 13
# A fresh random date each run, so every run starts with the slot free.
_RUN_DAY = date(2099, 1, 1) + timedelta(days=random.randrange(0, 360))
RACE_START = datetime.combine(_RUN_DAY, clock(10), CAMPUS)

_lock = threading.Lock()
_samples = []  # (step index, response time ms, ok)
_race_wins = []
_facility_ids = []


_started = [time.monotonic()]


def _current_step():
    return min(int((time.monotonic() - _started[0]) // STEP_SECONDS), len(STEPS) - 1)


RACE_BURST = int(os.getenv("STRESS_RACE_BURST", "30"))
_burst = {}


def _race_burst(host):
    """Send RACE_BURST bookings for the same room and hour at the same moment."""
    import gevent
    from gevent.event import Event
    import requests

    session = requests.Session()
    tokens = []
    for _ in range(RACE_BURST):
        email, password = f"race-{uuid.uuid4().hex[:12]}@example.edu", secrets.token_urlsafe(12)
        session.post(f"{host}/auth/register", json={"name": "Race Student", "email": email, "password": password})
        tokens.append(session.post(f"{host}/auth/login", json={"email": email, "password": password}).json()["access_token"])
    start = RACE_START + timedelta(hours=3)
    payload = {"facility_id": RACE_FACILITY, "start_time": start.isoformat(),
               "end_time": (start + timedelta(hours=1)).isoformat(), "attendees": 2, "purpose": "Stress test burst"}
    go = Event()

    def book(token):
        go.wait()
        return requests.post(f"{host}/reservations", json=payload, headers={"Authorization": f"Bearer {token}"}).status_code

    jobs = [gevent.spawn(book, token) for token in tokens]
    gevent.sleep(0.2)
    go.set()
    gevent.joinall(jobs)
    codes = [job.value for job in jobs]
    _burst.update(requests=len(codes), succeeded=codes.count(201), conflicts=codes.count(409),
                  other=sorted({c for c in codes if c not in (201, 409)}))


@events.test_start.add_listener
def _on_start(environment, **_):
    _race_burst(environment.host)
    _started[0] = time.monotonic()


@events.request.add_listener
def _record(request_type, name, response_time, response_length, response=None, exception=None, **_):
    with _lock:
        _samples.append((_current_step(), response_time, exception is None))


def _percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, int(len(ordered) * fraction))], 1)


@events.test_stop.add_listener
def _on_stop(environment, **_):
    steps = []
    for index, users in enumerate(STEPS):
        times = [ms for step, ms, _ in _samples if step == index]
        errors = sum(1 for step, _, ok in _samples if step == index and not ok)
        if not times:
            continue
        p95 = _percentile(times, 0.95)
        error_rate = errors / len(times)
        steps.append({
            "users": users,
            "requests": len(times),
            "requests_per_second": round(len(times) / STEP_SECONDS, 1),
            "median_ms": _percentile(times, 0.50),
            "p95_ms": p95,
            "p99_ms": _percentile(times, 0.99),
            "max_ms": round(max(times), 1),
            "errors": errors,
            "error_rate": round(error_rate, 4),
            "meets_nfr02": p95 <= TARGET_P95_MS and error_rate < MAX_ERROR_RATE,
        })
    summary = {
        "target": f"95% of responses within {TARGET_P95_MS} ms and error rate below {MAX_ERROR_RATE:.0%} at each step",
        "step_seconds": STEP_SECONDS,
        "steps": steps,
        "race_slot_bookings_succeeded": len(_race_wins),
        "simultaneous_burst": _burst,
        "no_double_booking": len(_race_wins) <= 1 and _burst.get("succeeded", 0) <= 1,
        "highest_load_meeting_target": max((s["users"] for s in steps if s["meets_nfr02"]), default=None),
    }
    REPORT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("\nCampusReserve stress summary")
    for s in steps:
        verdict = "PASS" if s["meets_nfr02"] else "FAIL"
        print(f"  {s['users']:>4} users: {s['requests_per_second']:>6} req/s  median {s['median_ms']} ms  "
              f"p95 {s['p95_ms']} ms  errors {s['error_rate']:.2%}  {verdict}")
    print(f"  race slot bookings that succeeded: {len(_race_wins)} (must be at most 1)")
    print(f"  simultaneous burst: {_burst.get('succeeded')} of {_burst.get('requests')} succeeded, "
          f"{_burst.get('conflicts')} refused as conflicts, other codes {_burst.get('other')} (must be at most 1 success)")
    print(f"  summary written to {REPORT}")
    if not summary["no_double_booking"]:
        environment.process_exit_code = 1


class StepLoad(LoadTestShape):
    """Hold each user count in STRESS_STEPS for STRESS_STEP_SECONDS."""

    def tick(self):
        step = int(self.get_run_time() // STEP_SECONDS)
        if step >= len(STEPS):
            return None
        return STEPS[step], SPAWN_RATE


class Student(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        email = f"stress-{uuid.uuid4().hex[:12]}@example.edu"
        password = secrets.token_urlsafe(12)
        self.client.post("/auth/register", json={"name": "Stress Student", "email": email, "password": password},
                         name="/auth/register")
        response = self.client.post("/auth/login", json={"email": email, "password": password}, name="/auth/login")
        self.headers = {"Authorization": f"Bearer {response.json().get('access_token', '')}"} if response.ok else {}
        if not _facility_ids:
            listing = self.client.get("/facilities", name="/facilities")
            if listing.ok:
                with _lock:
                    _facility_ids[:] = [room["id"] for room in listing.json() if room.get("is_active")]
        self._try_race_slot()

    def _room(self):
        return random.choice(_facility_ids) if _facility_ids else 1

    def _window(self, day, hour, hours=1):
        start = datetime.combine(day, clock(hour), CAMPUS)
        return start.isoformat(), (start + timedelta(hours=hours)).isoformat()

    @task(4)
    def list_rooms(self):
        self.client.get("/facilities", name="/facilities")

    @task(2)
    def filter_rooms(self):
        params = random.choice([{"min_capacity": 8}, {"equipment": "Monitor"}, {"building_name": "Central Library"},
                                {"min_capacity": 4, "floor_number": 2}])
        self.client.get("/facilities", params=params, name="/facilities?filters")

    @task(3)
    def room_details(self):
        self.client.get(f"/facilities/{self._room()}", name="/facilities/{id}")

    @task(4)
    def check_availability(self):
        day = date.today() + timedelta(days=random.randint(1, 30))
        start, end = self._window(day, random.randint(9, 18))
        self.client.get(f"/facilities/{self._room()}/availability",
                        params={"start_time": start, "end_time": end, "attendees": 2},
                        name="/facilities/{id}/availability")

    @task(2)
    def my_reservations(self):
        self.client.get("/reservations/me", headers=self.headers, name="/reservations/me")

    @task(1)
    def notifications(self):
        self.client.get("/notifications", headers=self.headers, name="/notifications")

    @task(2)
    def book_and_cancel(self):
        # Random far-future hours rarely collide; a conflict (409) is a correct answer, not an error.
        day = date(2098, 1, 1) + timedelta(days=random.randrange(0, 365))
        start, end = self._window(day, random.randint(8, 20))
        payload = {"facility_id": self._room(), "start_time": start, "end_time": end, "attendees": 2,
                   "purpose": "Stress test booking"}
        with self.client.post("/reservations", json=payload, headers=self.headers, name="/reservations",
                              catch_response=True) as response:
            if response.status_code == 201:
                response.success()
                reservation_id = response.json()["reservation"]["id"]
            elif response.status_code == 409:
                response.success()
                return
            else:
                response.failure(f"booking returned {response.status_code}")
                return
        self.client.patch(f"/reservations/{reservation_id}/cancel", headers=self.headers,
                          name="/reservations/{id}/cancel")

    def _try_race_slot(self):
        payload = {"facility_id": RACE_FACILITY, "start_time": RACE_START.isoformat(),
                   "end_time": (RACE_START + timedelta(hours=1)).isoformat(), "attendees": 2,
                   "purpose": "Stress test race slot"}
        with self.client.post("/reservations", json=payload, headers=self.headers, name="/reservations (race slot)",
                              catch_response=True) as response:
            if response.status_code == 201:
                with _lock:
                    _race_wins.append(response.json()["reservation"]["id"])
                response.success()
            elif response.status_code == 409:
                response.success()
            else:
                response.failure(f"race booking returned {response.status_code}")
