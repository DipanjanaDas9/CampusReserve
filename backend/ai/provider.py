
from google import genai

from .config import GEMINI_API_KEY, GEMINI_MODEL


def get_gemini_client() -> genai.Client:
    """Create a Gemini client using backend configuration."""
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is missing. Configure it in the project-root .env file."
        )

    return genai.Client(api_key=GEMINI_API_KEY)


def get_ai_model() -> str:
    """Return the configured Gemini model name."""
    return GEMINI_MODEL
