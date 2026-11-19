"""Browser tests for the administrator side of CampusReserve (US-02)."""

import re

from playwright.sync_api import expect

from conftest import sign_in, unique_purpose


def open_request(admin, reservation, purpose):
    """Find one request in the admin queue and open its details dialog."""
    admin.goto("/admin/approvals")
    admin.get_by_placeholder(re.compile(r"^Search by ID")).fill(purpose)
    admin.get_by_role("button", name=f"REQ-{reservation['id']}", exact=True).click()
    dialog = admin.get_by_role("dialog")
    expect(dialog).to_contain_text(f"REQ-{reservation['id']}")
    return dialog


def test_admin_approves_a_request_and_the_student_is_notified(new_page, api, student, admin_account):
    purpose = unique_purpose("approve")
    reservation = api.book(student["token"], 21, purpose)

    admin = new_page()
    sign_in(admin, admin_account["email"], admin_account["password"], as_admin=True)
    dialog = open_request(admin, reservation, purpose)
    dialog.get_by_role("button", name="Approve Reservation").click()
    expect(dialog.get_by_role("button", name="Approve Reservation")).to_have_count(0)
    expect(dialog).to_contain_text(re.compile(r"Approved", re.I))

    page = new_page()
    sign_in(page, student["email"], student["password"])
    page.goto("/notifications")
    expect(page.get_by_text(re.compile(r"has been approved")).first).to_be_visible()
    page.goto("/reservations")
    expect(page.locator(".reservation-card")).to_contain_text(re.compile(r"Approved|Confirmed", re.I))


def test_admin_rejects_a_request_with_a_reason_the_student_can_see(new_page, api, student, admin_account):
    purpose = unique_purpose("reject")
    reason = "Room is reserved for exams that day."
    reservation = api.book(student["token"], 22, purpose)

    admin = new_page()
    sign_in(admin, admin_account["email"], admin_account["password"], as_admin=True)
    dialog = open_request(admin, reservation, purpose)
    dialog.get_by_role("button", name="Reject", exact=True).click()
    dialog.get_by_label("Rejection reason").fill(reason)
    dialog.get_by_role("button", name="Reject Reservation").click()
    expect(dialog.get_by_role("button", name="Reject Reservation")).to_have_count(0)
    expect(dialog).to_contain_text(reason)

    page = new_page()
    sign_in(page, student["email"], student["password"])
    page.goto("/notifications")
    expect(page.get_by_text(reason).first).to_be_visible()


def test_rejecting_requires_a_reason(page, api, student, admin_account):
    purpose = unique_purpose("no reason")
    reservation = api.book(student["token"], 23, purpose)

    sign_in(page, admin_account["email"], admin_account["password"], as_admin=True)
    dialog = open_request(page, reservation, purpose)
    dialog.get_by_role("button", name="Reject", exact=True).click()
    reject = dialog.get_by_role("button", name="Reject Reservation")
    expect(reject).to_be_disabled()
    dialog.get_by_label("Rejection reason").fill("   ")
    expect(reject).to_be_disabled()
    dialog.get_by_label("Rejection reason").fill("Closed for cleaning")
    expect(reject).to_be_enabled()


def test_admin_dashboard_users_and_reports_load(page, student, admin_account):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    sign_in(page, admin_account["email"], admin_account["password"], as_admin=True)
    expect(page).to_have_url(re.compile(r"/admin"))

    page.goto("/admin/users")
    page.get_by_placeholder("Search by name or email…").fill(student["email"])
    expect(page.get_by_text(student["email"])).to_be_visible()
    page.goto("/admin/reports")
    expect(page.get_by_role("heading").first).to_be_visible()
    page.goto("/admin/facilities")
    expect(page.get_by_text("Central Library LIB-101").first).to_be_visible()
    assert errors == []
