"""Create opt-in development/demo accounts without changing existing users.

Run from backend with CAMPUSRESERVE_ENV=development (or demo), all three
password variables set, and the explicit --demo flag.
"""

import argparse
import os
import sys
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import hash_password  # noqa: E402
from app.db.connection import get_connection  # noqa: E402
from app.db.database import initialize_database  # noqa: E402


DEMO_USERS = (
    (
        "Demo Student 1",
        "student1@demo.com",
        "CAMPUSRESERVE_DEMO_STUDENT1_PASSWORD",
        "student",
    ),
    (
        "Demo Student 2",
        "student2@demo.com",
        "CAMPUSRESERVE_DEMO_STUDENT2_PASSWORD",
        "student",
    ),
    ("Demo Admin", "admin@demo.com", "CAMPUSRESERVE_DEMO_ADMIN_PASSWORD", "admin"),
)
ALLOWED_ENVIRONMENTS = {"development", "demo"}


def seed_demo_users(environment=None):
    environment = (
        environment
        if environment is not None
        else os.getenv("CAMPUSRESERVE_ENV", "")
    )
    if environment.strip().lower() not in ALLOWED_ENVIRONMENTS:
        raise RuntimeError(
            "Demo users can only be seeded when CAMPUSRESERVE_ENV is "
            "'development' or 'demo'."
        )

    users = []
    for name, email, password_variable, role in DEMO_USERS:
        password = os.getenv(password_variable)
        if password is None or not 8 <= len(password) <= 128:
            raise RuntimeError(
                f"{password_variable} must be set to a password between 8 and 128 characters."
            )
        users.append((name, email, hash_password(password), role))

    initialize_database()
    added = 0
    with closing(get_connection()) as connection, connection:
        connection.execute("BEGIN IMMEDIATE")
        for user in users:
            cursor = connection.execute(
                """
                INSERT INTO users (name, email, password_hash, role)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(email) DO NOTHING
                """,
                user,
            )
            added += cursor.rowcount
    return added


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Insert opt-in development/demo user accounts."
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        required=True,
        help="Explicitly select development/demo account seeding",
    )
    parser.parse_args(argv)
    added = seed_demo_users()
    print(f"Demo users: {added} accounts added; existing accounts preserved.")


if __name__ == "__main__":
    main()
