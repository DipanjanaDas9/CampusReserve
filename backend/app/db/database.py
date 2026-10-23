from contextlib import closing
from .connection import get_connection

def initialize_database():
    with closing(get_connection()) as connection:

        # Create users table
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

        # Create facilities table
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

        # Check whether the users table has a role column
        columns = connection.execute(
            "PRAGMA table_info(users)"
        ).fetchall()

        column_names = [column["name"] for column in columns]

        # Add role column if it doesn't exist
        if "role" not in column_names:
            connection.execute(
                """
                ALTER TABLE users
                ADD COLUMN role TEXT NOT NULL DEFAULT 'student'
                CHECK (role IN ('student', 'admin'))
                """
            )

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
        reservation_columns = connection.execute(
        "PRAGMA table_info(reservations)"
        ).fetchall()

        column_names = [column["name"] for column in reservation_columns]

        if "checked_in_at" not in column_names:
            connection.execute(
            """
            ALTER TABLE reservations
            ADD COLUMN checked_in_at TEXT
            """
            )
        

        connection.commit()