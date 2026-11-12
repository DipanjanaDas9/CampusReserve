
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_ROOT / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# gemini-3.8-flash was overloaded (503/504) on 11 Nov 2026; 3.5 Flash-Lite answered in about a second.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
