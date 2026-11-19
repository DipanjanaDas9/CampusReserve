"""Browser tests for the student side of CampusReserve (US-01)."""

import os
import re
import secrets
import uuid

import pytest
from playwright.sync_api import expect

from conftest import sign_in, unique_purpose


def test_wrong_password_shows_an_error_and_stays_on_login(page, student):
    page.goto("/login")
    page.fill("#email", student["email"])
    page.fill("#password", "not-the-password")
    page.locator("form button[type=submit]").click()

    expect(page.get_by_role("status")).to_contain_text("Invalid email or password")
    expect(page).to_have_url(re.compile(r"/login"))


def test_a_new_student_can_register_and_sign_in(page):
    email = f"e2e-{uuid.uuid4().hex[:10]}@example.edu"
    password = secrets.token_urlsafe(12)

    page.goto("/register")
    page.fill("#fullName", "New E2E Student")
    page.fill("#email", email)
    page.fill("#password", password)
    page.fill("#confirm", password)
    page.get_by_role("button", name="Register").click()
    page.wait_for_url(re.compile(r"/login"))

    sign_in(page, email, password)
    expect(page.get_by_role("heading", name=re.compile(r"Welcome back"))).to_be_visible()


def test_pages_need_a_login(page):
    page.goto("/reservations")
    expect(page).to_have_url(re.compile(r"/login"))


def test_students_cannot_open_admin_pages(page, student):
    sign_in(page, student["email"], student["password"])
    page.goto("/admin/approvals")
    expect(page).not_to_have_url(re.compile(r"/admin"))
    expect(page.get_by_role("heading", name=re.compile(r"Welcome back"))).to_be_visible()


def test_dashboard_lists_the_active_rooms(page, student):
    sign_in(page, student["email"], student["password"])
    expect(page.get_by_role("heading", name="Smart Suggestions for You")).to_be_visible()
    expect(page.get_by_role("heading", name=re.compile(r"^(Central Library|Engineering|Student Center|Science)")).first).to_be_visible()


def test_search_spaces_filters_by_building(page, student):
    sign_in(page, student["email"], student["password"])
    page.goto("/search")
    results = page.get_by_role("heading", name=re.compile(r"\d+ Spaces? Found", re.I))
    expect(results).to_be_visible()
    all_rooms = int(results.inner_text().split()[0])

    page.get_by_role("combobox", name="Building").select_option(label="Student Center")
    page.get_by_role("button", name="Search", exact=True).click()

    expect(results).not_to_have_text(re.compile(rf"^{all_rooms} "))
    assert 0 < int(results.inner_text().split()[0]) < all_rooms
    names = page.locator(".spaces-room-card h3").all_inner_texts()
    assert names and all(name.startswith("Student Center") for name in names)


def test_facility_details_shows_rules_and_equipment(page, student):
    sign_in(page, student["email"], student["password"])
    page.goto("/search")
    page.get_by_role("heading", name=re.compile(r"\d+ Spaces? Found", re.I)).wait_for()
    room = page.locator(".spaces-room-card h3").first.inner_text()
    page.get_by_role("link", name=f"View {room}").click()

    expect(page).to_have_url(re.compile(r"/spaces/\d+$"))
    expect(page.get_by_role("heading", level=1)).to_have_text(room)
    page.get_by_role("tab", name="Rules").click()
    expect(page.get_by_text("No double booking")).to_be_visible()
    page.get_by_role("tab", name="Equipment").click()
    expect(page.locator("#panel-equipment")).to_be_visible()
    expect(page.get_by_role("button", name="Reserve")).to_be_visible()


def test_student_books_a_room_from_the_calendar_and_cancels_it(page, student):
    purpose = unique_purpose("calendar booking")
    sign_in(page, student["email"], student["password"])

    # Pick the first free hour next week on the availability calendar.
    page.goto("/availability")
    page.get_by_role("button", name="Next week").click()
    free_slot = page.locator("button[aria-pressed]:not([disabled])").first
    free_slot.click()
    expect(free_slot).to_have_attribute("aria-pressed", "true")
    page.get_by_role("button", name="Continue to Reservation").click()

    page.wait_for_url(re.compile(r"/spaces/\d+/book\?"))
    page.fill("#purpose", purpose)
    page.fill("#attendees", "2")
    page.get_by_role("button", name="Submit Request").click()
    expect(page.get_by_text("Your reservation request was submitted")).to_be_visible()

    # The student is brand new, so this is their only reservation.
    page.goto("/reservations")
    booking = page.locator(".reservation-card")
    expect(booking).to_have_count(1)
    expect(booking).to_contain_text(re.compile(r"Pending", re.I))
    expect(page.get_by_role("button", name=re.compile(r"Pending \(1\)"))).to_be_visible()

    page.once("dialog", lambda dialog: dialog.accept())
    booking.get_by_role("button", name=re.compile(r"^Cancel reservation for ")).click()
    expect(page.get_by_role("button", name=re.compile(r"Cancelled \(1\)"))).to_be_visible()
    page.get_by_role("button", name=re.compile(r"Cancelled \(1\)")).click()
    expect(booking).to_contain_text(re.compile(r"Cancelled", re.I))


def test_booking_an_already_reserved_time_is_refused(page, api, student):
    facility_id = 5
    reservation = api.book(student["token"], facility_id, unique_purpose("slot check"))
    day = reservation["start_time"][:10]

    sign_in(page, student["email"], student["password"])
    page.goto(f"/spaces/{facility_id}/book?date={day}&start=10:00&end=11:00")
    page.fill("#purpose", unique_purpose("double booking"))
    page.fill("#attendees", "2")
    page.get_by_role("button", name="Submit Request").click()

    expect(page.get_by_text("Facility already reserved for this time")).to_be_visible()


def test_invalid_password_reset_link_is_refused(page):
    page.goto("/reset-password?token=" + "x" * 40)
    expect(page.get_by_text(re.compile(r"expired or has already", re.I))).to_be_visible()


def test_forgot_password_always_gives_the_same_answer(page):
    page.goto("/forgot-password")
    page.fill("#recovery-email", f"nobody-{uuid.uuid4().hex[:6]}@example.edu")
    page.get_by_role("button", name="Send Reset Link").click()
    expect(page.get_by_text(re.compile(r"If an account exists", re.I))).to_be_visible()


@pytest.mark.skipif(os.getenv("E2E_LIVE_AI") != "1", reason="Set E2E_LIVE_AI=1 to call Gemini")
def test_ai_assistant_returns_ranked_rooms(page, student):
    sign_in(page, student["email"], student["password"])
    page.goto("/ai-finder")
    page.fill("#ai-query", "Meeting room for 10 people with a monitor next Tuesday 2 to 4 PM")
    page.get_by_role("button", name="Find Spaces").click()
    expect(page.get_by_text(re.compile(r"Fit score: \d+/100")).first).to_be_visible(timeout=60_000)
