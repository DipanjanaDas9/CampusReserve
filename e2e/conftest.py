"""Browser (Selenium) tests: start a throwaway backend + Vite dev server and drive Chrome.

Run with:  python -m pytest e2e      (add E2E_HEADED=1 to watch the browser)
Screenshots of each step are written to e2e/screenshots/.
"""

import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parents[1]
API = "http://127.0.0.1:8000"
WEB = "http://localhost:5173"
CAMPUS_TIME_ZONE = "America/Chicago"
SCREENSHOTS = Path(__file__).resolve().parent / "screenshots"


def wait_for_port(port, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.25)
    raise RuntimeError(f"Nothing is listening on port {port}")


def port_in_use(port):
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


@pytest.fixture(scope="session")
def servers():
    for port in (8000, 5173):
        if port_in_use(port):
            pytest.exit(f"Port {port} is already in use; stop the dev servers before running the browser tests.")
    workdir = Path(tempfile.mkdtemp(prefix="campusreserve-e2e-"))
    env = os.environ | {
        "CAMPUSRESERVE_DB_PATH": str(workdir / "e2e.db"),
        "CAMPUS_TIME_ZONE": CAMPUS_TIME_ZONE,
        "CAMPUSRESERVE_SECRET_KEY": "e2e-only-secret",
        "TZ": CAMPUS_TIME_ZONE,
    }
    api = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--port", "8000"],
        cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    web = subprocess.Popen(
        ["npm", "run", "dev", "--", "--port", "5173", "--strictPort"],
        cwd=ROOT / "frontend", env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_port(8000)
        wait_for_port(5173)
        yield {"db": workdir / "e2e.db"}
    finally:
        for process in (api, web):
            process.terminate()
            process.wait(timeout=10)
        shutil.rmtree(workdir, ignore_errors=True)


@pytest.fixture(scope="session")
def accounts(servers):
    """Two students and one administrator, created through the real API."""
    people = {
        "student": ("Alex Student", "alex@university.edu", "student-pass-1"),
        "other": ("Sam Student", "sam@university.edu", "student-pass-2"),
        "admin": ("Facilities Office", "facilities@university.edu", "admin-pass-1"),
    }
    for name, email, password in people.values():
        httpx.post(f"{API}/auth/register", json={"name": name, "email": email, "password": password}).raise_for_status()
    with sqlite3.connect(servers["db"]) as connection:
        connection.execute("UPDATE users SET role = 'admin' WHERE email = ?", (people["admin"][1],))
    return {key: {"name": n, "email": e, "password": p} for key, (n, e, p) in people.items()}


@pytest.fixture(scope="session")
def browser(servers):
    os.environ["TZ"] = CAMPUS_TIME_ZONE  # the browser's "today" must match the campus calendar
    options = webdriver.ChromeOptions()
    if not os.environ.get("E2E_HEADED"):
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1400,1000")
    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(0)
    SCREENSHOTS.mkdir(exist_ok=True)
    yield driver
    driver.quit()


class Page:
    """Small helpers so tests read as user steps."""

    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, 10)

    def open(self, path):
        self.driver.get(WEB + path)

    def sign_out(self):
        self.open("/login")
        self.driver.execute_script("sessionStorage.clear()")

    def sign_in(self, account, role="student"):
        self.sign_out()
        self.open("/login")
        if role == "admin":
            self.click_text("button", "Admin")
        self.type("#email", account["email"])
        self.type("#password", account["password"])
        self.find("button[type=submit]").click()

    def find(self, css):
        return self.wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, css)))

    def type(self, css, text):
        element = self.find(css)
        element.clear()
        element.send_keys(text)

    def click_text(self, tag, text):
        xpath = f"//{tag}[normalize-space()='{text}' or .//*[normalize-space()='{text}']]"
        self.wait.until(EC.element_to_be_clickable((By.XPATH, xpath))).click()

    def wait_text(self, text):
        self.wait.until(EC.text_to_be_present_in_element((By.TAG_NAME, "body"), text))

    def body(self):
        return self.driver.find_element(By.TAG_NAME, "body").text

    def screenshot(self, name):
        self.driver.save_screenshot(str(SCREENSHOTS / f"{name}.png"))


@pytest.fixture
def page(browser):
    return Page(browser)
