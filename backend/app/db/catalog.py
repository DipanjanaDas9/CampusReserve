"""Additive room catalog migration and opt-in development data."""
import json

CATALOG_COLUMNS = {
    "building_name": "TEXT",
    "floor_number": "INTEGER",
    "room_number": "TEXT",
    "room_type": "TEXT",
}


def migrate_catalog(connection):
    """Keep legacy IDs and unknown addresses; never infer catalog identities."""
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(facilities)")}
    for name, sql_type in CATALOG_COLUMNS.items():
        if name not in columns:
            connection.execute(f"ALTER TABLE facilities ADD COLUMN {name} {sql_type}")
    # NULL identities allow existing facilities to remain unchanged. Known room
    # identities are unique even when clients vary capitalization or whitespace.
    connection.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS facilities_catalog_identity
        ON facilities (
            lower(trim(building_name)), floor_number, lower(trim(room_number))
        )
        WHERE building_name IS NOT NULL
          AND floor_number IS NOT NULL AND room_number IS NOT NULL
    """)


# Entirely fictional demonstration data; not verified UTA room information.
def demo_room(building, floor, number, room_type, capacity, equipment,
              opening="08:00", closing="22:00", restrictions=None, active=True):
    return dict(building_name=building, floor_number=floor, room_number=number,
                room_type=room_type, capacity=capacity, equipment=equipment,
                opening_time=opening, closing_time=closing,
                restrictions=restrictions, is_active=active)


DEMO_ROOMS = [
    demo_room('Central Library', 1, 'LIB-101', 'Study room', 4, ['Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 1, 'LIB-102', 'Study room', 8, ['Monitor', 'Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 2, 'LIB-201', 'Study room', 4, ['Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 2, 'LIB-202', 'Study room', 8, ['Monitor', 'Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 3, 'LIB-301', 'Study room', 4, ['Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 3, 'LIB-302', 'Study room', 8, ['Monitor', 'Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 4, 'LIB-401', 'Study room', 4, ['Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 4, 'LIB-402', 'Study room', 8, ['Monitor', 'Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 5, 'LIB-501', 'Study room', 4, ['Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', True),
    demo_room('Central Library', 5, 'LIB-502', 'Study room', 8, ['Monitor', 'Whiteboard'], '08:00', '22:00', 'Quiet study; no food.', False),
    demo_room('Engineering Building', 1, 'ENG-110', 'Computer lab', 24, ['Computers', 'Projector'], '09:00', '20:00', 'No food or drinks.', True),
    demo_room('Engineering Building', 1, 'ENG-112', 'Laboratory', 16, ['Computers', 'Monitor'], '09:00', '18:00', 'Supervised instructional use only.', True),
    demo_room('Engineering Building', 2, 'ENG-201', 'Study room', 6, ['Whiteboard'], '08:00', '22:00', None, True),
    demo_room('Engineering Building', 2, 'ENG-202', 'Study room', 8, ['Whiteboard', 'Monitor'], '08:00', '22:00', None, True),
    demo_room('Engineering Building', 2, 'ENG-210', 'Conference room', 12, ['Video conferencing', 'Monitor'], '08:00', '20:00', None, True),
    demo_room('Engineering Building', 3, 'ENG-312', 'Conference room', 20, ['Projector', 'Video conferencing', 'Whiteboard'], '08:00', '20:00', None, True),
    demo_room('Engineering Building', 3, 'ENG-314', 'Laboratory', 18, ['Computers', 'Monitor'], '09:00', '18:00', 'Closed for demonstration maintenance.', False),
    demo_room('Engineering Building', 3, 'ENG-316', 'Study room', 4, ['Whiteboard'], '08:00', '22:00', None, True),
    demo_room('Student Center', 1, 'SC-101', 'Meeting room', 10, ['Monitor', 'Whiteboard'], '08:00', '22:00', None, True),
    demo_room('Student Center', 1, 'SC-102', 'Meeting room', 16, ['Video conferencing', 'Monitor'], '08:00', '22:00', None, True),
    demo_room('Student Center', 1, 'SC-110', 'Multipurpose room', 60, ['Projector'], '09:00', '22:00', 'Restore furniture after use.', True),
    demo_room('Student Center', 2, 'SC-201', 'Meeting room', 8, ['Whiteboard'], '08:00', '22:00', None, True),
    demo_room('Student Center', 2, 'SC-202', 'Meeting room', 12, ['Video conferencing', 'Monitor'], '08:00', '22:00', None, True),
    demo_room('Student Center', 2, 'SC-210', 'Multipurpose room', 100, ['Projector', 'Monitor'], '09:00', '21:00', 'Events require administrator approval.', True),
    demo_room('Science Building', 1, 'SCI-101', 'Study room', 4, ['Whiteboard'], '08:00', '22:00', None, True),
    demo_room('Science Building', 1, 'SCI-102', 'Study room', 6, ['Monitor'], '08:00', '22:00', None, True),
    demo_room('Science Building', 2, 'SCI-201', 'Collaboration room', 10, ['Whiteboard', 'Monitor'], '08:00', '21:00', None, True),
    demo_room('Science Building', 2, 'SCI-202', 'Collaboration room', 16, ['Projector', 'Whiteboard'], '08:00', '21:00', 'No laboratory experiments.', True),
    demo_room('Science Building', 3, 'SCI-301', 'Study room', 8, ['Whiteboard'], '08:00', '20:00', None, True),
    demo_room('Science Building', 3, 'SCI-302', 'Collaboration room', 12, ['Video conferencing', 'Monitor'], '08:00', '20:00', None, True),
]


def seed_demo_catalog(connection):
    """Caller owns transaction; insert missing addresses without changing rows."""
    added = 0
    for room in DEMO_ROOMS:
        cursor = connection.execute("""
            INSERT INTO facilities
                (name, building_name, floor_number, room_number, room_type,
                 capacity, equipment, location, opening_time, closing_time,
                 restrictions, is_active)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1 FROM facilities
                WHERE lower(trim(building_name)) = lower(?)
                  AND floor_number = ? AND lower(trim(room_number)) = lower(?)
            )
        """, (
            f"{room['building_name']} {room['room_number']}",
            room['building_name'], room['floor_number'], room['room_number'],
            room['room_type'], room['capacity'], json.dumps(room['equipment']),
            f"{room['building_name']} · Floor {room['floor_number']} · Room {room['room_number']}",
            room['opening_time'], room['closing_time'],
            "Fictional university demo facility; not verified UTA room information."
            + (f" {room['restrictions']}" if room['restrictions'] else ""),
            int(room['is_active']), room['building_name'], room['floor_number'], room['room_number'],
        ))
        added += cursor.rowcount
    return added
