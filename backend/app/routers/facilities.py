import json
from psycopg.errors import UniqueViolation
import logging
from typing import Annotated
from contextlib import closing
from pydantic import BaseModel, ValidationError
from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.connection import get_connection
from app.schemas.facility import FacilityRequest, FacilityResponse, FacilityMutationResponse
from app.core.dependencies import require_admin


router = APIRouter(
    prefix="/facilities",
    tags=["Facilities"]
)
class FacilityStatusUpdate(BaseModel):
    is_active: bool



def decode_equipment(value, facility_id):
    """Invalid legacy JSON must not break all facility and AI search responses."""
    try:
        equipment = json.loads(value)
    except (TypeError, ValueError):
        equipment = None
    if not isinstance(equipment, list) or not all(isinstance(item, str) for item in equipment):
        logging.getLogger(__name__).warning("Invalid equipment JSON for facility %s", facility_id)
        return []
    return equipment


def normalize_equipment(value):
    return " ".join(value.strip().casefold().split()).rstrip("s")


def facility_to_dict(facility):
    """Convert a SQLite facility row into JSON-compatible data."""
    return {
        "id": facility["id"],
        "name": facility["name"],
        "capacity": facility["capacity"],
        "building_name": facility["building_name"],
        "floor_number": facility["floor_number"],
        "room_number": facility["room_number"],
        "room_type": facility["room_type"],
        "equipment": decode_equipment(facility["equipment"], facility["id"]),
        "location": facility["location"],
        "opening_time": facility["opening_time"],
        "closing_time": facility["closing_time"],
        "restrictions": facility["restrictions"],
        "is_active": bool(facility["is_active"]),
    }



@router.get("", response_model=list[FacilityResponse])
def get_facilities(
    building_name: Annotated[str | None, Query(max_length=100, description="Exact building name, ignoring case and surrounding spaces")] = None,
    floor_number: Annotated[int | None, Query(description="Floor number; 0 is ground floor")] = None,
    min_capacity: Annotated[int | None, Query(ge=1, description="Minimum maximum-occupant capacity")] = None,
    max_capacity: Annotated[int | None, Query(ge=1)] = None,
    equipment: Annotated[list[str] | None, Query(description="Repeat for multiple required items; every item must match")] = None,
    is_active: Annotated[bool | None, Query()] = None,
):
    if min_capacity is not None and max_capacity is not None and min_capacity > max_capacity:
        raise HTTPException(status_code=422, detail="Minimum capacity must not exceed maximum capacity")
    conditions, parameters = [], []
    if building_name is not None:
        if not building_name.strip():
            raise HTTPException(status_code=422, detail="Building name must not be blank")
        conditions.append("lower(trim(building_name)) = lower(%s)")
        parameters.append(building_name.strip())
    if floor_number is not None:
        conditions.append("floor_number = %s")
        parameters.append(floor_number)
    if min_capacity is not None:
        conditions.append("capacity >= %s")
        parameters.append(min_capacity)
    if max_capacity is not None:
        conditions.append("capacity <= %s")
        parameters.append(max_capacity)
    if is_active is not None:
        conditions.append("is_active = %s")
        parameters.append(int(is_active))
    required = {normalize_equipment(item) for item in equipment or []}
    if "" in required:
        raise HTTPException(status_code=422, detail="Equipment items must not be blank")
    query = "SELECT * FROM facilities"
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY id"
    with closing(get_connection()) as connection:
        facilities = connection.execute(query, parameters).fetchall()
    rooms = [facility_to_dict(facility) for facility in facilities]
    return [room for room in rooms if required.issubset({normalize_equipment(item) for item in room["equipment"]})]


@router.get("/{facility_id}", response_model=FacilityResponse)
def get_facility(facility_id: int):
    with closing(get_connection()) as connection:
        facility = connection.execute(
            "SELECT * FROM facilities WHERE id = %s",
            (facility_id,),
        ).fetchone()

    if facility is None:
        raise HTTPException(
            status_code=404,
            detail="Facility not found"
        )

    return facility_to_dict(facility)


def catalog_conflict(exc):
    if exc.diag.constraint_name == "facilities_catalog_identity":
        raise HTTPException(
            status_code=409,
            detail="A facility already exists with this building, floor, and room number",
        ) from exc
    raise exc


def facility_values(facility):
    return (
        facility.name, facility.capacity, json.dumps(facility.equipment),
        facility.location, facility.opening_time, facility.closing_time,
        facility.restrictions, facility.building_name, facility.floor_number,
        facility.room_number, facility.room_type,
    )


@router.post("", status_code=201, response_model=FacilityMutationResponse)
def create_facility(
    facility: FacilityRequest,
    admin: dict = Depends(require_admin),
):
    try:
        with closing(get_connection()) as connection, connection:
            cursor = connection.execute(
                """
                INSERT INTO facilities
                    (name, capacity, equipment, location, opening_time,
                    closing_time, restrictions, building_name, floor_number,
                    room_number, room_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                facility_values(facility),
            )

            facility_id = cursor.fetchone()["id"]

            result = connection.execute(
                "SELECT * FROM facilities WHERE id = %s",
                (facility_id,),
            ).fetchone()
    except UniqueViolation as exc:
        catalog_conflict(exc)
    return {"message": "Facility created successfully", "facility": facility_to_dict(result)}


@router.put("/{facility_id}", response_model=FacilityMutationResponse)
def update_facility(
    facility_id: int,
    facility: FacilityRequest,
    admin: dict = Depends(require_admin),
):
    try:
        with closing(get_connection()) as connection, connection:
            existing = connection.execute(
                "SELECT * FROM facilities WHERE id = %s FOR UPDATE", (facility_id,)
            ).fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Facility not found")
            # Older clients omit catalog fields: preserve their stored values.
            values = facility_to_dict(existing)
            values.update(facility.model_dump(exclude_unset=True))
            try:
                merged = FacilityRequest.model_validate(values)
            except ValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            connection.execute(
                """
                UPDATE facilities SET name = %s, capacity = %s, equipment = %s,
                    location = %s, opening_time = %s, closing_time = %s,
                    restrictions = %s, building_name = %s, floor_number = %s,
                    room_number = %s, room_type = %s WHERE id = %s
                """, (*facility_values(merged), facility_id),
            )
            result = connection.execute(
                "SELECT * FROM facilities WHERE id = %s", (facility_id,)
            ).fetchone()
    except UniqueViolation as exc:
            catalog_conflict(exc)
    return {"message": "Facility updated successfully", "facility": facility_to_dict(result)}


@router.patch("/{facility_id}/status")
def update_facility_status(
    facility_id: int,
    status: FacilityStatusUpdate,
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        try:

            cursor = connection.execute(
                """
                UPDATE facilities
                SET is_active = %s
                WHERE id = %s
                FOR UPDATE
                """,
                (
                    1 if status.is_active else 0,
                    facility_id,
                ),
            )

            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Facility not found"
                )

            facility = connection.execute(
                "SELECT * FROM facilities WHERE id = %s",
                (facility_id,),
            ).fetchone()

            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "message": (
            "Facility activated successfully"
            if status.is_active
            else "Facility deactivated successfully"
        ),
        "facility": facility_to_dict(facility),
    }



@router.delete("/{facility_id}")
def delete_facility(
    facility_id: int,
    admin: dict = Depends(require_admin)
):
    with closing(get_connection()) as connection:
        try:

            facility = connection.execute(
                """
                SELECT id, name
                FROM facilities
                WHERE id = %s
                FOR UPDATE
                """,
                (facility_id,)
            ).fetchone()

            if facility is None:
                raise HTTPException(
                    status_code=404,
                    detail="Facility not found"
                )

            reservation_count = connection.execute(
                """
                SELECT COUNT(*) AS total
                FROM reservations
                WHERE facility_id = %s
                """,
                (facility_id,),
            ).fetchone()["total"]

            if reservation_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "This facility has reservation history and "
                        "cannot be deleted. Deactivate it instead."
                    )
                )

            connection.execute(
                """
                DELETE FROM facilities
                WHERE id = %s
                """,
                (facility_id,)
            )

            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "message": "Facility deleted successfully",
        "facility_id": facility_id
    }
