
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
                restrictions TEXT,
                is_active INTEGER NOT NULL DEFAULT 1
                CHECK (is_active IN (0, 1))            )
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
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                reservation_id INTEGER,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0
                    CHECK (is_read IN (0, 1)),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (reservation_id)
                    REFERENCES reservations(id)
                    ON DELETE SET NULL
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

        # Allow existing JWT sessions to be invalidated
        # after a password reset.
        if "session_version" not in user_column_names:
            connection.execute(
                """
                ALTER TABLE users
                ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0
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


        # Add active/inactive tracking to existing facilities
        facility_columns = connection.execute(
            "PRAGMA table_info(facilities)"
        ).fetchall()

        facility_column_names = [
            column["name"] for column in facility_columns
        ]

        if "is_active" not in facility_column_names:
            connection.execute(
                """
                ALTER TABLE facilities
                ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1
                CHECK (is_active IN (0, 1))
                """
            )

        # Password recovery: temporary, single-use reset tokens.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                used_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )


        # 6. Save changes
        connection.commit()
