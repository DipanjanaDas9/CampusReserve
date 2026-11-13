import os
from zoneinfo import ZoneInfo
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
CAMPUS_TIMEZONE = ZoneInfo("America/Chicago")
ALGORITHM = "HS256"

SECRET_KEY = os.getenv("CAMPUSRESERVE_SECRET_KEY")

if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "CAMPUSRESERVE_SECRET_KEY must be set "
        "to a secret of at least 32 characters."
    )