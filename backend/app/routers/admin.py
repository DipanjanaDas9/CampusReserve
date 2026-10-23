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
                SELECT id, status
                FROM reservations
                WHERE id = ?
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

            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "message": f"Reservation {decision.status} successfully",
        "reservation_id": reservation_id,
        "status": decision.status
    }
