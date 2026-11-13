"""Rank AI search results by how well each room fits the request.

Ranking runs only on rooms that already passed every hard check (active, large
enough, requested catalog fields and equipment, free for the time window), so it
never adds or invents rooms. The score is deterministic and explainable: the AI
model is not involved.
"""

MAX_SIZE_PENALTY = 50  # points lost by a room whose seats would be almost all empty


def _plural(count, word):
    return f"{count} {word}" if count == 1 else f"{count} {word}s"


def clock_label(hhmm):
    """'14:30' -> '2:30 PM', matching how the app shows times."""
    hour, minute = (int(part) for part in hhmm.split(":")[:2])
    return f"{(hour - 1) % 12 + 1}:{minute:02d} {'AM' if hour < 12 else 'PM'}"


def _join(items):
    items = list(items)
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def score_room(room, requirements):
    """Return (score 0-100, reasons, trade-offs) for one room that meets the request."""
    reasons, tradeoffs = [], []
    score = 100

    group_size = requirements.get("group_size")
    capacity = room["capacity"]
    if group_size:
        empty = capacity - group_size
        penalty = round(MAX_SIZE_PENALTY * empty / capacity) if capacity else 0
        score -= penalty
        if empty == 0:
            reasons.append(f"Seats exactly your group of {group_size}")
        else:
            reasons.append(f"Seats {capacity}, enough for your group of {group_size}")
        if empty > group_size:
            tradeoffs.append(f"Larger than you need: {_plural(empty, 'seat')} would be empty")
    else:
        reasons.append(f"Seats up to {capacity}")
        tradeoffs.append("Group size not given, so room size was not compared")

    if requirements.get("building_name"):
        reasons.append(f"In {room['building_name']}")
    if requirements.get("floor_number") is not None:
        floor = room["floor_number"]
        reasons.append("On the ground floor" if floor == 0 else f"On floor {floor}")
    if requirements.get("room_type"):
        room_type = room["room_type"].lower()
        reasons.append(f"Is {'an' if room_type[:1] in 'aeiou' else 'a'} {room_type}")
    if requirements.get("room_number"):
        reasons.append(f"Is room {room['room_number']}")

    equipment = [item for item in requirements.get("equipment") or [] if item.strip()]
    if equipment:
        reasons.append("Has " + _join(item.strip().lower() for item in equipment))

    if requirements.get("start_time") and requirements.get("end_time"):
        reasons.append(f"Free from {clock_label(requirements['start_time'])} to {clock_label(requirements['end_time'])}")

    return max(score, 0), reasons, tradeoffs


def rank_rooms(rooms, requirements):
    """Best fit first; ties go to the smaller room, then the room name."""
    ranked = []
    for room in rooms:
        score, reasons, tradeoffs = score_room(room, requirements)
        ranked.append({**room, "match_score": score, "match_reasons": reasons,
                       "match_tradeoffs": tradeoffs})
    ranked.sort(key=lambda room: (-room["match_score"], room["capacity"], room["name"]))
    return ranked
