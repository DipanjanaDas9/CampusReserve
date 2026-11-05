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
