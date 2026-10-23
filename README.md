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

The frontend can be started from `frontend` after installing its declared
dependencies with `pnpm install`, then running `pnpm dev`.

## Backend tests

Install the development dependencies and run the focused backend tests from the
repository root:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```
