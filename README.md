# CampusReserve

## Local development

Room search uses the campus's IANA time-zone name. Ask the campus administrator
which value to use (for example, an IANA name such as `America/Chicago`); do
not assume the example is correct for your campus. In PowerShell, configure it
for the current terminal before starting the backend:

```powershell
$env:CAMPUS_TIME_ZONE = "<confirmed-campus-IANA-time-zone>"
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload
```

On first startup, the local SQLite database is created beside `backend/main.py`
and receives clearly marked `SAMPLE` rooms when no rooms exist. Sample room
availability is not verified campus availability. The search endpoint requires
the bearer token issued by the existing login endpoint. Search results do not
create bookings.

Settings can also be kept in a project-root `.env` file; copy `.env.example`
and fill in `CAMPUS_TIME_ZONE`, `CAMPUSRESERVE_SECRET_KEY` and `GEMINI_API_KEY`.

The frontend can be started from `frontend` after installing its declared
dependencies with `npm install`, then running `npm run dev`
(http://localhost:5173).

## Administrator accounts

Students register themselves. Administrators cannot self-register; create one
(or promote an existing account) from the repository root:

```powershell
python -m backend.manage create-admin --email admin@university.edu --name "Facilities Office"
```

Then sign in on the **Admin** tab of the login page to reach the Admin
Dashboard, Reservation Approvals and Manage Facilities pages.

## Reservation workflow

1. A student picks consecutive free hours on the availability calendar and
   submits a request. It is **pending** and already holds the slot.
2. An administrator **approves** it or **declines** it with an optional reason.
   The student gets a notification either way.
3. The student can **cancel** a pending or approved reservation before it
   starts, and **checks in** from 15 minutes before until 30 minutes after the
   start time. Approved reservations without a check-in count as no-shows.

Bookable hours are 08:00–19:00 campus time; the number of attendees cannot
exceed the room capacity. Databases created before Sprint 5 are upgraded
automatically on startup.

## Backend tests

Install the development dependencies and run the focused backend tests from the
repository root:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```

### Browser (end-to-end) tests

Selenium tests drive Chrome through the main student and admin flows and run an
axe-core WCAG 2.0 AA scan of every page. They start their own backend (with a
throwaway database) and Vite dev server, so stop any servers on ports 8000 and
5173 first. Chrome and the frontend's npm dependencies must be installed.

```powershell
python -m pytest e2e            # set E2E_HEADED=1 to watch the browser
```

Screenshots of each step are saved to `e2e/screenshots/`.

### AI extraction accuracy

`evaluation/ai_extraction_cases.json` holds 30 labelled room requests. Score
the Gemini extractor (needs `GEMINI_API_KEY`) or the earlier rule-based parser:

```powershell
python -m evaluation.evaluate_ai_extraction
python -m evaluation.evaluate_ai_extraction --baseline
```
