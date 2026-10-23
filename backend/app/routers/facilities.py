
import json
from contextlib import closing

from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import get_connection
from app.schemas.facility import FacilityRequest
from app.core.dependencies import require_admin


router = APIRouter(
    prefix="/facilities",
    tags=["Facilities"]
)


def facility_to_dict(facility):
    """Convert a SQLite facility row into JSON-compatible data."""
    return {
        "id": facility["id"],
        "name": facility["name"],
        "capacity": facility["capacity"],
        "equipment": json.loads(facility["equipment"]),
        "location": facility["location"],
        "opening_time": facility["opening_time"],
        "closing_time": facility["closing_time"],
        "restrictions": facility["restrictions"],
    }


@router.get("")
def get_facilities():
    with closing(get_connection()) as connection:
        facilities = connection.execute(
            "SELECT * FROM facilities ORDER BY id"
        ).fetchall()

    return [facility_to_dict(facility) for facility in facilities]


@router.get("/{facility_id}")
def get_facility(facility_id: int):
    with closing(get_connection()) as connection:
        facility = connection.execute(
            "SELECT * FROM facilities WHERE id = ?",
            (facility_id,),
        ).fetchone()

    if facility is None:
        raise HTTPException(
            status_code=404,
            detail="Facility not found"
        )

    return facility_to_dict(facility)


@router.post("", status_code=201)
def create_facility(
    facility: FacilityRequest,
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            """
            INSERT INTO facilities
            (name, capacity, equipment, location,
             opening_time, closing_time, restrictions)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                facility.name,
                facility.capacity,
                json.dumps(facility.equipment),
                facility.location,
                facility.opening_time,
                facility.closing_time,
                facility.restrictions,
            ),
        )
        connection.commit()
        facility_id = cursor.lastrowid

    return {
        "message": "Facility created successfully",
        "facility": {
            "id": facility_id,
            **facility.model_dump(),
        },
    }


@router.put("/{facility_id}")
def update_facility(
    facility_id: int,
    facility: FacilityRequest,
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        cursor = connection.execute(
            """
            UPDATE facilities
            SET name = ?,
                capacity = ?,
                equipment = ?,
                location = ?,
                opening_time = ?,
                closing_time = ?,
                restrictions = ?
            WHERE id = ?
            """,
            (
                facility.name,
                facility.capacity,
                json.dumps(facility.equipment),
                facility.location,
                facility.opening_time,
                facility.closing_time,
                facility.restrictions,
                facility_id,
            ),
        )
        connection.commit()

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Facility not found"
            )

    return {
        "message": "Facility updated successfully",
        "facility": {
            "id": facility_id,
            **facility.model_dump(),
        },
    }


@router.delete("/{facility_id}")
def delete_facility(
    facility_id: int,
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        try:
            cursor = connection.execute(
                "DELETE FROM facilities WHERE id = ?",
                (facility_id,),
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Facility not found"
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise

    return {
        "message": "Facility deleted successfully",
        "facility_id": facility_id,
    }
