"""Explicit development/demo catalog seeder; uses the application's SQLite path.

Run from backend: python scripts/seed_demo.py --demo
"""
import argparse
import sys
from contextlib import closing
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.connection import get_connection  # noqa: E402
from app.db.database import initialize_database  # noqa: E402
from app.db.catalog import seed_demo_catalog  # noqa: E402


def seed_demo():
    initialize_database()
    with closing(get_connection()) as connection, connection:
        return seed_demo_catalog(connection)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Insert fictional university development/demo rooms, not verified UTA data.")
    parser.add_argument("--demo", action="store_true", required=True,
                        help="Explicitly select development/demo data population")
    parser.parse_args(argv)
    added = seed_demo()
    print(f"Demo catalog: {added} rooms added; existing records preserved.")


if __name__ == "__main__":
    main()
