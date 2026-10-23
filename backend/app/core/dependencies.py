
from contextlib import closing

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.db.connection import get_connection
from app.core.security import decode_access_token


security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = decode_access_token(credentials.credentials)

    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    with closing(get_connection()) as connection:
        user = connection.execute(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return dict(user)


def require_admin(
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator access required",
        )

    return current_user
