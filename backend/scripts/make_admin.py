"""Give an existing account the administrator role.

Administrators cannot sign up through the app. Register the account normally,
then run from the backend folder:

    python scripts/make_admin.py admin@university.edu
"""

import sys
from contextlib import closing
from pathlib import Path

# Make the backend's `app` package importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.connection import get_connection  # noqa: E402
from app.db.database import initialize_database  # noqa: E402


def make_admin(email: str) -> str:
    initialize_database()  # adds the role column to older databases
    email = email.strip().lower()
    with closing(get_connection()) as connection:
        cursor = connection.execute("UPDATE users SET role = 'admin' WHERE email = ?", (email,))
        connection.commit()
    if cursor.rowcount == 0:
        raise SystemExit(f"No account found for {email}. Register it in the app first.")
    return f"{email} is now an administrator. Sign in again to use the admin pages."


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/make_admin.py <email>")
    print(make_admin(sys.argv[1]))
