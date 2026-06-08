from __future__ import annotations

import base64
import hashlib
import hmac
import secrets


PBKDF2_ITERATIONS = 600_000


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return "$".join(
        [
            "pbkdf2_sha256",
            str(PBKDF2_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(digest).decode("ascii"),
        ]
    )


def verify_password(password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False

    try:
        algorithm, iterations, salt_b64, digest_b64 = hashed_password.split("$", 3)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
    expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
    candidate = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        int(iterations),
    )
    return hmac.compare_digest(candidate, expected)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
