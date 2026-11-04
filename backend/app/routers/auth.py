
from contextlib import closing
import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import get_connection
from app.schemas.user import RegisterRequest, LoginRequest
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
)
from app.core.dependencies import get_current_user

import hashlib
import logging
import os
import secrets
import smtplib
import ssl

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pydantic import BaseModel, Field


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", status_code=201)
def register_user(user: RegisterRequest):
    name = user.name.strip()
    email = user.email.strip().lower()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty.",
        )

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid email address.",
        )

    password_hash = hash_password(user.password)

    try:
        with closing(get_connection()) as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (name, email, password_hash)
                VALUES (?, ?, ?)
                """,
                (name, email, password_hash),
            )
            connection.commit()
            user_id = cursor.lastrowid

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    return {
        "message": "Account created successfully.",
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
        },
    }


@router.post("/login")
def login(request: LoginRequest):
    email = request.email.strip().lower()

    with closing(get_connection()) as connection:
        user = connection.execute(
            """
            SELECT id, name, email, role, password_hash, session_version
            FROM users
            WHERE email = ?
            """,
            (email,),
        ).fetchone()

    if user is None or not verify_password(
        request.password, user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    token = create_access_token(
            user["id"],
            user["session_version"],
)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
        },
    }


@router.get("/me")
def get_my_profile(
    current_user: dict = Depends(get_current_user)
):
    return current_user



class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


FORGOT_PASSWORD_RESPONSE = {
    "message": (
        "If an account exists with that email, "
        "a password reset link will be sent."
    )
}


def send_password_reset_email(email: str, token: str):
    """Send a password reset link without exposing the token in API responses."""
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM_EMAIL")
    frontend_url = os.getenv(
        "FRONTEND_URL", "http://localhost:5173"
    ).rstrip("/")

    if not all([host, username, password, sender]):
        raise RuntimeError("SMTP email delivery is not configured.")

    from urllib.parse import quote

    reset_link = (
        f"{frontend_url}/reset-password?token={quote(token)}"
    )

    message = EmailMessage()
    message["Subject"] = "CampusReserve Password Reset"
    message["From"] = sender
    message["To"] = email

    message.set_content(
        "You requested a password reset for CampusReserve.\n\n"
        f"Reset your password here:\n{reset_link}\n\n"
        "This link expires in 15 minutes.\n"
        "If you did not request this, ignore this email."
    )

    context = ssl.create_default_context()

    if port == 465:
        with smtplib.SMTP_SSL(
            host, port, context=context, timeout=15
        ) as smtp:
            smtp.login(username, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.starttls(context=context)
            smtp.login(username, password)
            smtp.send_message(message)


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest):
    email = request.email.strip().lower()
    now = datetime.now(timezone.utc)

    with closing(get_connection()) as connection:
        user = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (email,),
        ).fetchone()

        # Do not reveal whether the email is registered.
        if user is None:
            return FORGOT_PASSWORD_RESPONSE

        # Limit repeated reset requests for the same account.
        recent = connection.execute(
            """
            SELECT created_at
            FROM password_reset_tokens
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (user["id"],),
        ).fetchone()

        if recent:
            last_request = datetime.fromisoformat(
                recent["created_at"]
            )
            if now - last_request < timedelta(seconds=60):
                return FORGOT_PASSWORD_RESPONSE

        # Generate a cryptographically secure random token.
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(
            token.encode("utf-8")
        ).hexdigest()

        # Invalidate previous unused links.
        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = ?
            WHERE user_id = ? AND used_at IS NULL
            """,
            (now.isoformat(), user["id"]),
        )

        connection.execute(
            """
            INSERT INTO password_reset_tokens
            (user_id, token_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                user["id"],
                token_hash,
                (now + timedelta(minutes=15)).isoformat(),
                now.isoformat(),
            ),
        )

        connection.commit()

    try:
        send_password_reset_email(email, token)
    except Exception:
        logging.exception(
            "CampusReserve password reset email delivery failed"
        )

    return FORGOT_PASSWORD_RESPONSE


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/reset-password")
def reset_password(request: ResetPasswordRequest):
    now = datetime.now(timezone.utc)

    # Hash the token to look it up securely.
    token_hash = hashlib.sha256(
        request.token.encode("utf-8")
    ).hexdigest()

    with closing(get_connection()) as connection:
        # Lock the database transaction so the same
        # reset token cannot be used simultaneously.
        connection.execute("BEGIN IMMEDIATE")

        reset_record = connection.execute(
            """
            SELECT id, user_id, expires_at, used_at
            FROM password_reset_tokens
            WHERE token_hash = ?
            """,
            (token_hash,),
        ).fetchone()

        if reset_record is None:
            connection.rollback()
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired password reset link.",
            )

        if reset_record["used_at"] is not None:
            connection.rollback()
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired password reset link.",
            )

        expires_at = datetime.fromisoformat(
            reset_record["expires_at"]
        )

        if expires_at <= now:
            connection.rollback()
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired password reset link.",
            )

        # Use CampusReserve's existing password hashing.
        new_password_hash = hash_password(
            request.new_password
        )

        # Change the password and invalidate previous JWTs.
        updated = connection.execute(
            """
            UPDATE users
            SET password_hash = ?,
                session_version = session_version + 1
            WHERE id = ?
            """,
            (
                new_password_hash,
                reset_record["user_id"],
            ),
        )

        if updated.rowcount != 1:
            connection.rollback()
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired password reset link.",
            )

        # Consume this reset token.
        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = ?
            WHERE id = ?
            """,
            (
                now.isoformat(),
                reset_record["id"],
            ),
        )

        # Invalidate any other outstanding reset links.
        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = ?
            WHERE user_id = ?
              AND used_at IS NULL
            """,
            (
                now.isoformat(),
                reset_record["user_id"],
            ),
        )

        connection.commit()

    return {
        "message": (
            "Password reset successfully. "
            "Please sign in with your new password."
        )
    }


class ValidateResetTokenRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)


@router.post("/validate-reset-token")
def validate_reset_token(request: ValidateResetTokenRequest):
    token_hash = hashlib.sha256(
        request.token.encode("utf-8")
    ).hexdigest()

    with closing(get_connection()) as connection:
        record = connection.execute(
            """
            SELECT expires_at, used_at
            FROM password_reset_tokens
            WHERE token_hash = ?
            """,
            (token_hash,),
        ).fetchone()

    if record is None or record["used_at"] is not None:
        return {"valid": False}

    expires_at = datetime.fromisoformat(
        record["expires_at"]
    )

    if expires_at <= datetime.now(timezone.utc):
        return {"valid": False}

    return {"valid": True}
