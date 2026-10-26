from contextlib import closing
from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import require_admin
from app.db.connection import get_connection
from app.schemas.reservation import ReservationDecision


router = APIRouter(
    tags=["Administration"]
)


@router.patch("/reservations/{reservation_id}/decision")
def decide_reservation(
    reservation_id: int,
    decision: ReservationDecision,
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        try:
            connection.execute("BEGIN IMMEDIATE")

            reservation = connection.execute(
                """
                SELECT
                    r.id,
                    r.user_id,
                    r.status,
                    f.name AS facility_name,
                    r.start_time,
                    r.end_time
                FROM reservations r
                JOIN facilities f ON r.facility_id = f.id
                WHERE r.id = ?
                """,
                (reservation_id,)
            ).fetchone()

            if reservation is None:
                raise HTTPException(
                    status_code=404,
                    detail="Reservation not found"
                )

            if reservation["status"] != "pending":
                raise HTTPException(
                    status_code=409,
                    detail="Only pending reservations can be reviewed"
                )

            connection.execute(
                """
                UPDATE reservations
                SET status = ?
                WHERE id = ?
                """,
                (decision.status, reservation_id)
            )
            
            if decision.status == "approved":
                kind = "confirmed"
                title = "Reservation confirmed"
                body = (
                    f"Your reservation for {reservation['facility_name']} "
                    f"has been approved."
                )
            else:
                kind = "cancelled"
                title = "Reservation rejected"
                body = (
                    f"Your reservation request for {reservation['facility_name']} "
                    f"has been rejected."
                )

            connection.execute(
                """
                INSERT INTO notifications
                    (user_id, reservation_id, kind, title, body)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    reservation["user_id"],
                    reservation_id,
                    kind,
                    title,
                    body,
                )
            )


            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "message": f"Reservation {decision.status} successfully",
        "reservation_id": reservation_id,
        "status": decision.status
    }


@router.get("/admin/reservations")
def get_all_reservations(
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        reservations = connection.execute(
            """
            SELECT
                r.id,
                r.user_id,
                u.name AS requester_name,
                u.email AS requester_email,
                r.facility_id,
                f.name AS facility_name,
                r.start_time,
                r.end_time,
                r.status,
                r.attendees,
                r.purpose,
                r.notes,
                r.created_at
            FROM reservations r
            JOIN users u ON r.user_id = u.id
            JOIN facilities f ON r.facility_id = f.id
            ORDER BY r.created_at DESC, r.id DESC
            """
        ).fetchall()

    return [dict(reservation) for reservation in reservations]
