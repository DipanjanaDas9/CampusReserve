
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
            SELECT id, name, email, role, password_hash
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

    token = create_access_token(user["id"])

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
