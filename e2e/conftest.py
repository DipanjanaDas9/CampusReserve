"""Shared setup for the CampusReserve browser (end-to-end) tests.

These tests drive the real app in a browser, so the backend and frontend must
already be running. Point the tests at them with environment variables:

    E2E_BASE_URL     frontend address (default http://localhost:5173)
    E2E_API_URL      backend address  (default http://127.0.0.1:8000)
    E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
                     an administrator account; admin tests are skipped without it
    E2E_LIVE_AI=1    also run the AI Assistant test, which uses Gemini quota

Each run registers its own student accounts and cancels every booking it
makes, so the tests can be repeated against a development database.
"""

import os
import random
import re
import secrets
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest

CAMPUS = ZoneInfo("America/Chicago")
FRONTEND = os.getenv("E2E_BASE_URL", "http://localhost:5173").rstrip("/")
API = os.getenv("E2E_API_URL", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT_MS = 15_000


def _reachable(url):
    try:
        httpx.get(url, timeout=5)
        return True
    except httpx.HTTPError:
        return False


def pytest_collection_modifyitems(config, items):
    if _reachable(FRONTEND) and _reachable(f"{API}/facilities"):
        return
    skip = pytest.mark.skip(reason=f"CampusReserve is not running at {FRONTEND} and {API}")
    for item in items:
        item.add_marker(skip)


@pytest.fixture(scope="session")
def base_url():
    """pytest-playwright opens relative paths against this address."""
    return FRONTEND


def _prepare(page):
    """Block room photos from the internet so slow downloads cannot stall a test."""
    page.set_default_timeout(TIMEOUT_MS)
    page.route(re.compile(r"^https?://(?!localhost|127\.0\.0\.1)"), lambda route: route.abort())
    return page


@pytest.fixture(autouse=True)
def _prepare_default_page(page):
    _prepare(page)


@pytest.fixture
def new_page(browser, base_url):
    """Open an extra page with its own session, e.g. an admin next to a student."""
    pages = []

    def open_page():
        context = browser.new_context(base_url=base_url)
        pages.append(context)
        return _prepare(context.new_page())

    yield open_page
    for context in pages:
        context.close()


class Api:
    """Small backend client used to set up and clean up test data."""

    def __init__(self):
        self.client = httpx.Client(base_url=API, timeout=30)

    def register_student(self):
        email = f"e2e-{uuid.uuid4().hex[:10]}@example.edu"
        password = secrets.token_urlsafe(12)
        response = self.client.post("/auth/register", json={"name": "E2E Student", "email": email, "password": password})
        response.raise_for_status()
        return {"email": email, "password": password, "token": self.login(email, password)}

    def login(self, email, password):
        response = self.client.post("/auth/login", json={"email": email, "password": password})
        response.raise_for_status()
        return response.json()["access_token"]

    def book(self, token, facility_id, purpose, day=None, start_hour=10, hours=1):
        # A random far-future day keeps repeated runs from colliding. Times are campus time.
        day = day or date(2098, 1, 1) + timedelta(days=random.randrange(0, 365))
        start = datetime.combine(day, time(start_hour), CAMPUS)
        end = start + timedelta(hours=hours)
        response = self.client.post(
            "/reservations",
            json={"facility_id": facility_id, "start_time": start.isoformat(), "end_time": end.isoformat(),
                  "attendees": 2, "purpose": purpose},
            headers={"Authorization": f"Bearer {token}"},
        )
        response.raise_for_status()
        return response.json()["reservation"]

    def my_reservations(self, token):
        response = self.client.get("/reservations/me", headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        data = response.json()
        return data if isinstance(data, list) else data.get("reservations", [])

    def cancel_all(self, token):
        for reservation in self.my_reservations(token):
            if reservation["status"] in ("pending", "approved"):
                self.client.patch(f"/reservations/{reservation['id']}/cancel", headers={"Authorization": f"Bearer {token}"})


@pytest.fixture(scope="session")
def api():
    return Api()


@pytest.fixture
def student(api):
    """A brand-new student account; its bookings are cancelled afterwards."""
    account = api.register_student()
    yield account
    api.cancel_all(account["token"])


@pytest.fixture(scope="session")
def admin_account():
    email, password = os.getenv("E2E_ADMIN_EMAIL"), os.getenv("E2E_ADMIN_PASSWORD")
    if not email or not password:
        pytest.skip("Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run the administrator tests")
    return {"email": email, "password": password}


def sign_in(page, email, password, as_admin=False):
    """Sign in through the real login page."""
    page.goto("/login")
    if as_admin:
        page.get_by_role("button", name="Administrator sign in").click()
    page.fill("#email", email)
    page.fill("#password", password)
    page.locator("form button[type=submit]").click()
    page.wait_for_url(lambda url: "/login" not in url)


def unique_purpose(label):
    return f"E2E {label} {uuid.uuid4().hex[:6]}"
