"""Automated WCAG 2.0 A/AA scan (axe-core) of every page, run after the UI flows have created data."""

from pathlib import Path

import pytest

from conftest import ROOT

AXE = (ROOT / "frontend" / "node_modules" / "axe-core" / "axe.min.js").read_text()

STUDENT_PAGES = ["/", "/search", "/spaces/3", "/availability?space=3", "/reservations", "/check-in", "/notifications"]
ADMIN_PAGES = ["/admin", "/admin/approvals", "/admin/facilities"]


def violations(page, path):
    page.open(path)
    page.wait.until(lambda d: d.execute_script("return document.querySelectorAll('[role=status] .animate-spin').length === 0"))
    page.driver.execute_script(AXE)
    result = page.driver.execute_async_script(
        "const done = arguments[0];"
        "axe.run(document, {runOnly: ['wcag2a', 'wcag2aa']}).then(r => done(r.violations.map("
        "v => `${v.id} (${v.impact}): ` + v.nodes.map(n => `${n.target} ${(n.any[0]||{}).data ? JSON.stringify([n.any[0].data.fgColor, n.any[0].data.bgColor, n.any[0].data.contrastRatio]) : ''}`).join(' | '))));"
    )
    return result


@pytest.mark.parametrize("path", ["/login", "/register"])
def test_public_pages_have_no_wcag_violations(page, path):
    page.sign_out()
    assert violations(page, path) == []


@pytest.mark.parametrize("path", STUDENT_PAGES)
def test_student_pages_have_no_wcag_violations(page, accounts, path):
    page.sign_in(accounts["student"])
    page.wait_text("Welcome back")
    assert violations(page, path) == []


@pytest.mark.parametrize("path", ADMIN_PAGES)
def test_admin_pages_have_no_wcag_violations(page, accounts, path):
    page.sign_in(accounts["admin"], role="admin")
    page.wait_text("Admin Dashboard")
    assert violations(page, path) == []
