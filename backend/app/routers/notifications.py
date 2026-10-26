from contextlib import closing

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.db.connection import get_connection


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"]
)


@router.get("")
def get_my_notifications(
    current_user: dict = Depends(get_current_user)
):
    with closing(get_connection()) as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                reservation_id,
                kind,
                title,
                body,
                is_read,
                created_at
            FROM notifications
            WHERE user_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (current_user["id"],)
        ).fetchall()

    return [
        {
            **dict(row),
            "read": bool(row["is_read"])
        }
        for row in rows
    ]


@router.patch("/read-all")
def mark_all_notifications_read(
    current_user: dict = Depends(get_current_user)
):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            """
            UPDATE notifications
            SET is_read = 1
            WHERE user_id = ?
              AND is_read = 0
            """,
            (current_user["id"],)
        )

        connection.commit()
        updated = cursor.rowcount

    return {
        "message": "All notifications marked as read",
        "updated": updated
    }


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: dict = Depends(get_current_user)
):
    with closing(get_connection()) as connection:
        notification = connection.execute(
            """
            SELECT id
            FROM notifications
            WHERE id = ? AND user_id = ?
            """,
            (notification_id, current_user["id"])
        ).fetchone()

        if notification is None:
            raise HTTPException(
                status_code=404,
                detail="Notification not found"
            )

        connection.execute(
            """
            UPDATE notifications
            SET is_read = 1
            WHERE id = ? AND user_id = ?
            """,
            (notification_id, current_user["id"])
        )

        connection.commit()

    return {
        "message": "Notification marked as read",
        "notification_id": notification_id
    }
