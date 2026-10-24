
from contextlib import closing
from .connection import get_connection


def initialize_database():
    with closing(get_connection()) as connection:

        # 1. Create users table
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # 2. Create facilities table
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS facilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                capacity INTEGER NOT NULL CHECK (capacity > 0),
                equipment TEXT NOT NULL DEFAULT '[]',
                location TEXT,
                opening_time TEXT,
                closing_time TEXT,
                restrictions TEXT
            )
            """
        )

        # 3. Create reservations table
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                facility_id INTEGER NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending',
                        'approved',
                        'denied',
                        'cancelled'
                    )),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (facility_id) REFERENCES facilities(id),

                CHECK (start_time < end_time)
            )
            """
        )

        # 4. Check users table columns
        user_columns = connection.execute(
            "PRAGMA table_info(users)"
        ).fetchall()

        user_column_names = [
            column["name"] for column in user_columns
        ]

        if "role" not in user_column_names:
            connection.execute(
                """
                ALTER TABLE users
                ADD COLUMN role TEXT NOT NULL DEFAULT 'student'
                CHECK (role IN ('student', 'admin'))
                """
            )

        # 5. Check reservations table columns
        reservation_columns = connection.execute(
            "PRAGMA table_info(reservations)"
        ).fetchall()

        reservation_column_names = [
            column["name"] for column in reservation_columns
        ]

        # Add check-in tracking if missing
        if "checked_in_at" not in reservation_column_names:
            connection.execute(
                """
                ALTER TABLE reservations
                ADD COLUMN checked_in_at TEXT
                """
            )

        # Add attendee count if missing
        if "attendees" not in reservation_column_names:
            connection.execute(
                """
                ALTER TABLE reservations
                ADD COLUMN attendees INTEGER NOT NULL DEFAULT 1
                CHECK (attendees >= 1)
                """
            )
        if "purpose" not in reservation_column_names:
            connection.execute(
                """
                ALTER TABLE reservations
                ADD COLUMN purpose TEXT NOT NULL DEFAULT ''
                """
            )

        if "notes" not in reservation_column_names:
            connection.execute(
                """
                ALTER TABLE reservations
                ADD COLUMN notes TEXT
                """
            )

        # 6. Save changes
        connection.commit()
