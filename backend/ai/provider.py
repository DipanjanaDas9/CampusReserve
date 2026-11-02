
from google import genai
from google.genai import types

from .config import GEMINI_API_KEY, GEMINI_MODEL


def get_gemini_client() -> genai.Client:
    """Create a Gemini client with longer timeout and retries."""

    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is missing. Configure it in backend/.env."
        )

    return genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(
            timeout=60000,
            retry_options=types.HttpRetryOptions(
                attempts=3,
                initial_delay=2.0,
                max_delay=10.0,
                http_status_codes=[408, 500, 502, 503, 504],            ),
        ),
    )


def get_ai_model() -> str:
    return GEMINI_MODEL
