# CampusReserve

## Running locally

Backend (FastAPI, SQLite). The server will not start without a signing key of at least 32 characters:

```bash
cd backend
pip install -r requirements.txt
export CAMPUSRESERVE_SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
uvicorn main:app --reload        # http://127.0.0.1:8000, API docs at /docs
```

Frontend (React + Vite):

```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

### Optional settings

Set these in the environment or in `backend/.env`. The app runs without them, but the feature stays off:

| Feature | Settings | Without them |
| --- | --- | --- |
| Password reset email | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, optional `SMTP_PORT` (default 587) and `FRONTEND_URL` | No email is sent. The page still shows its usual message, and the failure appears only in the backend log. |
| AI room search | `GEMINI_API_KEY`, optional `GEMINI_MODEL` | The AI Assistant page reports that AI is not configured. |

## Administrator accounts

Administrators cannot sign up through the app. Register the account on the Register
page, then give it the admin role from the `backend` folder:

```bash
python scripts/make_admin.py admin@university.edu
```

Sign in on the **Admin** tab of the login page. Accounts without the admin role are
refused there, and the `/admin` pages redirect them to the student dashboard.

## Backend tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

Each test uses its own temporary SQLite database, so your local `campusreserve.db` is never touched.

## Campus room catalog and development data

Facilities now expose optional `building_name`, integer `floor_number`,
`room_number`, and `room_type` fields. Floor `0` is the ground floor; negative
integers can represent basement floors. Capacity is **maximum occupants**, never
live occupancy. Admins can set these fields in Manage Facilities; room results
and details display them, and Gemini can extract explicit catalog requirements.
AI search resolves building shorthand such as “the library” when it uniquely
identifies a catalog building. Ambiguous mentions return building choices rather
than guessing; an explicit catalog name takes priority. Room types match ignoring
case and trailing plural `s`. The existing capacity, equipment, operating-hours, and booking rules still
apply.

The startup migration adds nullable columns and a unique index for known
building/floor/room combinations, ignoring capitalization and surrounding spaces.
Legacy facilities keep their IDs and all existing values; their unknown catalog
fields remain null. Assign building, floor, and room together when cataloging a
legacy room. Room type can be set independently. Older API payloads remain valid,
and updates that omit catalog fields preserve stored catalog values.

For **development/demo only**, run the explicit seed command from `backend`:

```bash
python scripts/seed_demo.py --demo
```

To create the optional demo student and administrator accounts, set
`CAMPUSRESERVE_ENV` to `development` or `demo` and set
`CAMPUSRESERVE_DEMO_STUDENT1_PASSWORD`, `CAMPUSRESERVE_DEMO_STUDENT2_PASSWORD`,
and `CAMPUSRESERVE_DEMO_ADMIN_PASSWORD` in the environment. Each password must
be 8–128 characters. Then run from `backend`:

```bash
python scripts/seed_demo_users.py --demo
```

The script hashes passwords with the application's existing password hasher,
assigns the admin role only to `admin@demo.com`, and leaves existing accounts
and passwords unchanged. It requires both the explicit flag and a development
or demo environment; do not run it against production. Keep the passwords in
your local environment or an untracked local `.env` file, never in source
control. Existing demo users are not modified when the command is rerun.

This uses the existing SQLite configuration and inserts **30 fictional university
rooms, not verified UTA room information**:

| Building | Rooms | Catalog |
| --- | ---: | --- |
| Central Library | 10 | Two study rooms on each of floors 1–5 (`LIB-101`–`LIB-502`) |
| Engineering Building | 8 | Laboratories, study rooms, conference rooms |
| Student Center | 6 | Meeting rooms and multipurpose rooms |
| Science Building | 6 | Study rooms and collaboration rooms |

Each room includes maximum capacity, equipment, operating hours, optional
restrictions, and active status. Two rooms are inactive to demonstrate that state.
Seeded facilities are identified as fictional demo data in restrictions.

**Server startup never seeds data**, including when the old
`CAMPUSRESERVE_SEED_DEMO` setting is present. Do not run the demo command against
production. Repeated runs skip existing catalog addresses and preserve all
existing IDs, fields, reservations, users, and notifications. Earlier demo records
are preserved too; they are not renamed or removed, so a database that already
contains rooms can have more than 30 total facilities. The command prints the
number actually added. Explicitly rerunning it will reinsert deleted demo
addresses but never reset edits to existing rooms.

No table is dropped or rebuilt. Normal startup migrates the configured local
SQLite database in place; take a SQLite backup before applying migrations to
important data. Tests migrate and seed temporary databases only.

### Facility API filters

`GET /facilities` still returns all rooms as a JSON array when no filters are
provided. Optional query parameters can be combined (AND):

- `building_name`: exact building name, ignoring case and surrounding spaces.
- `floor_number`: integer floor, including `0` (ground) or negative basement floors.
- `min_capacity`, `max_capacity`: inclusive positive bounds on maximum occupants.
- `equipment`: repeat the parameter to require every item; matching ignores case,
  surrounding/repeated spaces, and trailing plural `s`, as in existing room search.
- `is_active`: `true` or `false`; omit to include both for existing admin clients.

Example: `/facilities?building_name=Central%20Library&floor_number=2&min_capacity=5&equipment=Monitor&equipment=Whiteboard`.
Invalid filter values return 422; no matches returns `[]`. This catalog endpoint
filters room attributes, not live occupancy or booking availability. Continue to
use `GET /facilities/{id}/availability` for a time window; reservation creation
still rechecks capacity, active status, operating hours, and booking conflicts.

Equipment is stored as JSON text in SQLite and returned as a list of strings.
Malformed legacy equipment values are logged and exposed as `[]` rather than
crashing listings, details, or AI search; reads never rewrite the stored data.

### AI catalog search

Gemini extracts building, integer floor (third floor = 3; ground = 0), group
size, equipment, room type, and date/time requirements. Relative dates use the
campus date in America/Chicago. Capacity is maximum occupants, not live occupancy.

For example, “Find a study room for 6 people on the third floor of the library
tomorrow with a projector” leaves start and end times unspecified. The response
lists missing details and returns no availability results until times are supplied
in the prompt or Edit controls. Explicit date/time fields override AI extraction.
Building and floor are shown in the interpreted requirements summary.

Results are actual SQLite facilities, filtered by catalog requirements, active
status, maximum capacity, and every requested equipment item. Each candidate must
pass the same time-window and booking-conflict checks as manual availability.
Manual Search Spaces remains independent of Gemini and works without an API key.
AI tests mock the Gemini response; a live Gemini request requires configured
credentials and quota.

### Ranking of AI results

Every room in the results already meets the whole request, so ranking only
decides the order. Each result has a `match_score` from 0 to 100,
`match_reasons` listing each requirement it meets, and `match_tradeoffs` noting
anything to consider. A room loses up to 50 points in proportion to the share of
its seats your group would leave empty, so the smallest room that fits comes
first. Ties go to the smaller room, then the name. Without a group size, every
room scores 100. The score is calculated in `backend/ai/ranking.py`, not by
Gemini, so it cannot add rooms or change availability. The AI page sorts by
**Best match** by default and shows the score and reasons on each room.

### Measuring AI extraction accuracy

`backend/ai/evaluation_cases.json` holds 30 sample requests with the details
Gemini should extract. Relative dates such as "tomorrow" use the fixed reference
date in that file. To measure accuracy against the 90% target, set
`GEMINI_API_KEY` and run from `backend`:

```bash
python scripts/evaluate_ai.py --output ai-evaluation.json
```

Each case sends one Gemini request, so a run uses about 30 requests of your
quota. Use `--limit 5` for a quick trial and `--delay` to space requests out.
The command prints which fields each request got wrong and three numbers:

| Measure | What it counts |
| --- | --- |
| **Stated-field accuracy** (compared with the target) | Details the request gave, such as group size or date, that were extracted correctly |
| Did not invent | Details the request left out that correctly stayed empty |
| Every field correct | Requests where all nine fields were right |

It exits with 0 when stated-field accuracy reaches 90%, 1 when it does not, and
2 when no Gemini key is set. Results vary between runs and models, so record the
model and date with any result you report.
