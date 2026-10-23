"""End-to-end UI flows: login, search, calendar booking, approvals, notifications, facilities.

Tests run in file order and share one backend database.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC

from conftest import API, CAMPUS_TIME_ZONE

TOMORROW = (datetime.now(ZoneInfo(CAMPUS_TIME_ZONE)) + timedelta(days=1)).date().isoformat()
COMPUTER_LAB = 3  # seeded "SAMPLE — Computer Lab", capacity 20


def slot(page, hour, date=TOMORROW):
    return page.find(f'[data-slot="{date}-{hour}"]')


def api_token(account):
    response = httpx.post(f"{API}/auth/login", json={"email": account["email"], "password": account["password"]})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_register_new_student_and_sign_in(page):
    page.sign_out()
    page.open("/register")
    page.type("#fullName", "Riley Newstudent")
    page.type("#email", "riley@university.edu")
    page.type("#password", "riley-pass-1")
    page.type("#confirm", "riley-pass-1")
    page.screenshot("01-register")
    page.find("button[type=submit]").click()
    page.wait_text("Account created successfully")
    page.wait.until(EC.url_contains("/login"))

    page.sign_in({"email": "riley@university.edu", "password": "riley-pass-1"})
    page.wait_text("Welcome back, Riley")
    page.screenshot("02-student-dashboard")


def test_wrong_password_shows_error(page, accounts):
    page.sign_in({**accounts["student"], "password": "not-the-password"})
    page.wait_text("Invalid email or password")
    assert "/login" in page.driver.current_url
    page.screenshot("03-login-error")


def test_student_cannot_use_admin_sign_in_or_pages(page, accounts):
    page.sign_in(accounts["student"], role="admin")
    page.wait_text("does not have administrator access")

    page.sign_in(accounts["student"])
    page.wait_text("Welcome back, Alex")
    page.open("/admin/approvals")
    page.wait_text("Welcome back, Alex")
    assert not page.driver.current_url.rstrip("/").endswith("/admin/approvals")


def test_search_spaces_filters(page, accounts):
    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    page.open("/search")
    page.wait_text("All spaces (3)")
    page.screenshot("04-search-spaces")

    page.type("input[type=search]", "computers")
    page.wait.until(lambda d: "Focus Room" not in page.body())
    assert "Computer Lab" in page.body()

    page.type("#f-date", "")
    page.driver.execute_script(
        "const i=document.querySelector('#f-date');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;"
        "set.call(i, arguments[0]);i.dispatchEvent(new Event('input',{bubbles:true}));",
        TOMORROW,
    )
    page.type("#f-cap", "10")
    page.click_text("button", "Find available spaces")
    page.wait_text("1 space available")
    assert "Computer Lab" in page.body()
    page.screenshot("05-search-results")


def test_facility_details_page(page, accounts):
    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    page.open(f"/spaces/{COMPUTER_LAB}")
    page.wait_text("Up to 20 people")
    assert "Computers" in page.body() and "Projector" in page.body()
    page.screenshot("06-facility-details")


def test_book_two_hours_from_calendar(page, accounts):
    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    page.open(f"/availability?space={COMPUTER_LAB}&date={TOMORROW}")
    slot(page, 10).click()
    slot(page, 11).click()
    page.wait_text("2 hours")
    page.screenshot("07-calendar-selection")

    page.click_text("button", "Continue to Reservation")
    page.wait_text("Reservation Request")
    page.type("#purpose", "Capstone team meeting")
    page.type("#attendees", "6")
    page.screenshot("08-booking-form")
    page.click_text("button", "Submit Request")
    page.wait_text("waiting for approval")

    page.open("/reservations")
    page.wait_text("Capstone team meeting")
    assert "pending" in page.body().lower()
    page.screenshot("09-my-reservations-pending")


def test_booked_slots_are_blocked_for_other_students(page, accounts):
    page.sign_in(accounts["other"])
    page.wait_text("Welcome back")
    page.open(f"/availability?space={COMPUTER_LAB}&date={TOMORROW}")
    booked = slot(page, 10)
    assert booked.text == "Booked" and not booked.is_enabled()

    slot(page, 9).click()
    slot(page, 12).click()
    page.wait_text("spans a booked slot")
    assert not page.driver.find_element(By.XPATH, "//button[normalize-space()='Continue to Reservation']").is_enabled()
    page.screenshot("10-calendar-conflict")


def test_admin_approves_request_and_student_is_notified(page, accounts):
    page.sign_in(accounts["admin"], role="admin")
    page.wait_text("Admin Dashboard")
    page.wait_text("Waiting for approval")
    page.screenshot("11-admin-dashboard")

    page.open("/admin/approvals")
    page.wait_text("Capstone team meeting")
    page.screenshot("12-admin-approvals")
    page.click_text("button", "Approve")
    page.wait_text("No pending reservations")

    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    page.open("/reservations")
    page.wait_text("Capstone team meeting")
    assert "approved" in page.body().lower()
    page.open("/notifications")
    page.wait_text("Reservation approved")
    page.screenshot("13-student-notifications")


def test_admin_declines_with_reason(page, accounts):
    httpx.post(
        f"{API}/reservations",
        headers=api_token(accounts["other"]),
        json={"room_id": COMPUTER_LAB, "date": TOMORROW, "start_time": "14:00", "end_time": "15:00", "purpose": "Club rehearsal", "attendees": 3},
    ).raise_for_status()

    page.sign_in(accounts["admin"], role="admin")
    page.wait_text("Admin Dashboard")
    page.open("/admin/approvals")
    page.wait_text("Club rehearsal")
    page.click_text("button", "Decline")
    page.type("input[id^=reason-]", "Lab reserved for exams")
    page.click_text("button", "Confirm decline")
    page.wait_text("No pending reservations")

    page.sign_in(accounts["other"])
    page.wait_text("Welcome back")
    page.open("/reservations")
    page.click_text("button", "cancelled (1)")
    page.wait_text("Lab reserved for exams")


def test_admin_adds_facility_visible_to_students(page, accounts):
    page.sign_in(accounts["admin"], role="admin")
    page.wait_text("Admin Dashboard")
    page.open("/admin/facilities")
    page.click_text("button", "Add facility")
    page.type("#fac-name", "Library Group Room 2")
    page.type("#fac-loc", "Central Library, Floor 2")
    page.type("#fac-cap", "8")
    page.type("#fac-eq", "Whiteboard, Monitor")
    page.click_text("button", "Save")
    page.wait.until(lambda d: "Library Group Room 2" in page.body() and "New facility" not in page.body())
    page.screenshot("14-manage-facilities")

    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    page.open("/search")
    page.wait_text("Library Group Room 2")


def test_student_cancels_reservation(page, accounts):
    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    page.open("/reservations")
    page.wait_text("Capstone team meeting")
    page.click_text("button", "Cancel")
    page.wait.until(EC.alert_is_present())
    page.driver.switch_to.alert.accept()
    page.wait_text("Upcoming (0)")  # tab labels are capitalized by CSS
    page.click_text("button", "cancelled (1)")
    page.wait_text("Capstone team meeting")


def test_ai_finder_reports_unavailable_service_gracefully(page, accounts):
    # No GEMINI_API_KEY in the test environment: the UI must show a clear error, not break.
    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    page.open("/search")
    page.click_text("button", "AI Smart Finder")
    page.type("#ai-query", "Room for 4 people tomorrow 3 to 4 PM with a whiteboard")
    page.click_text("button", "Find with AI")
    page.wait_text("could not process your request")
    page.screenshot("15-ai-finder-error")
