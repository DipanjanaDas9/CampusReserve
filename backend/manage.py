"""Administrative commands.

Create or promote an administrator account (admins cannot self-register):

    python -m backend.manage create-admin --email admin@university.edu --name "Facilities Office"
"""

import argparse
import getpass
import sqlite3
from contextlib import closing

from backend.main import get_connection, hash_password


def create_admin(email: str, name: str) -> str:
    email = email.strip().lower()
    with closing(get_connection()) as connection:
        existing = connection.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            connection.execute("UPDATE users SET role = 'admin' WHERE id = ?", (existing["id"],))
            connection.commit()
            return f"Promoted {email} to administrator."
        password = getpass.getpass("Password (min 8 characters): ")
        if len(password) < 8:
            raise SystemExit("Password must be at least 8 characters.")
        if password != getpass.getpass("Repeat password: "):
            raise SystemExit("Passwords do not match.")
        try:
            connection.execute(
                "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
                (name.strip(), email, hash_password(password)),
            )
        except sqlite3.IntegrityError as exc:
            raise SystemExit(str(exc)) from exc
        connection.commit()
    return f"Created administrator {email}."


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="Create an administrator or promote an existing user.")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", default="Administrator")
    args = parser.parse_args()
    if args.command == "create-admin":
        print(create_admin(args.email, args.name))


if __name__ == "__main__":
    main()
