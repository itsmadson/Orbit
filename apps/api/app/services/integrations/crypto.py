"""Tokens at rest.

Integration secrets are encrypted with a key derived from ``SECRET_KEY``, so a
database dump on its own does not hand anyone a GitHub token. Rotating
``SECRET_KEY`` invalidates stored tokens — reconnect the integration afterwards.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(f"orbit-integrations:{settings.SECRET_KEY}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def mask(value: str) -> str:
    """Enough to recognise a token in the UI, never enough to use it."""
    return f"…{value[-4:]}" if len(value) >= 8 else "…"
