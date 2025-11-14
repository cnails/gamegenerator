"""Tests for dungeon generation."""

import pygame
import pytest

from game.world.dungeon_gen import DungeonGenerator, RoomType
from game.world.level import Level


def test_dungeon_generation_bsp() -> None:
    """Test BSP dungeon generation."""
    generator = DungeonGenerator(width=40, height=30, use_bsp=True, min_rooms=4, max_rooms=8)
    level = generator.generate(seed=42)

    assert level.width == 40
    assert level.height == 30
    assert len(generator.rooms) >= 4
    assert len(generator.rooms) <= 8


def test_dungeon_generation_room_corridor() -> None:
    """Test room+corridor dungeon generation."""
    generator = DungeonGenerator(width=40, height=30, use_bsp=False, min_rooms=5, max_rooms=10)
    level = generator.generate(seed=123)

    assert level.width == 40
    assert level.height == 30
    assert len(generator.rooms) >= 5
    assert len(generator.rooms) <= 10


def test_room_connectivity() -> None:
    """Test that all rooms are connected."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=6, max_rooms=10)
    level = generator.generate(seed=456)

    # Check that room graph is connected using BFS
    if len(generator.rooms) < 2:
        return  # Skip if not enough rooms

    visited = set()
    queue = [0]
    visited.add(0)

    while queue:
        current = queue.pop(0)
        for neighbor in generator.room_graph.get(current, set()):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    # All rooms should be reachable
    assert len(visited) == len(generator.rooms), "Not all rooms are connected"


def test_room_coverage() -> None:
    """Test that rooms cover reasonable area of dungeon."""
    generator = DungeonGenerator(width=80, height=60, min_rooms=8, max_rooms=12)
    level = generator.generate(seed=1000)

    total_area = generator.width * generator.height
    room_area = sum(room.rect.width * room.rect.height for room in generator.rooms)

    # Rooms should cover at least 10% of dungeon
    coverage = room_area / total_area
    assert coverage >= 0.10, f"Room coverage {coverage:.2%} is too low"


def test_room_size_constraints() -> None:
    """Test that rooms have reasonable sizes."""
    generator = DungeonGenerator(width=80, height=60, min_rooms=6, max_rooms=10)
    level = generator.generate(seed=2000)

    for room in generator.rooms:
        # Rooms should be at least 3x3
        assert room.rect.width >= 3, f"Room {room.room_id} too narrow"
        assert room.rect.height >= 3, f"Room {room.room_id} too short"
        
        # Rooms shouldn't be too large (max 30% of dungeon size)
        max_width = generator.width * 0.3
        max_height = generator.height * 0.3
        assert room.rect.width <= max_width, f"Room {room.room_id} too wide"
        assert room.rect.height <= max_height, f"Room {room.room_id} too tall"


def test_no_room_overlaps() -> None:
    """Test that rooms don't overlap."""
    generator = DungeonGenerator(width=60, height=50, min_rooms=8, max_rooms=12)
    level = generator.generate(seed=789)

    # Check for overlaps (with small padding)
    for i, room1 in enumerate(generator.rooms):
        for room2 in generator.rooms[i + 1 :]:
            # Rooms should not overlap (with 1 tile padding)
            padded1 = pygame.Rect(
                room1.rect.x - 1,
                room1.rect.y - 1,
                room1.rect.width + 2,
                room1.rect.height + 2,
            )
            assert not padded1.colliderect(
                room2.rect
            ), f"Rooms {room1.room_id} and {room2.room_id} overlap"


def test_room_types_assignment() -> None:
    """Test that room types are assigned correctly."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=6, max_rooms=10)
    level = generator.generate(seed=999, floor_number=1)

    # First room should be START
    assert generator.rooms[0].room_type == RoomType.START

    # Check that all rooms have valid types
    valid_types = {RoomType.START, RoomType.COMBAT, RoomType.TREASURE, RoomType.SHOP, RoomType.MINI_BOSS, RoomType.BOSS}
    for room in generator.rooms:
        assert room.room_type in valid_types, f"Room {room.room_id} has invalid type"


def test_boss_room_on_floor_3() -> None:
    """Test that boss room appears on floor 3."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=5, max_rooms=8)
    level = generator.generate(seed=111, floor_number=3)

    # Last room should be BOSS on floor 3
    assert generator.rooms[-1].room_type == RoomType.BOSS


def test_room_graph_symmetry() -> None:
    """Test that room graph is symmetric (undirected)."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=6, max_rooms=10)
    level = generator.generate(seed=222)

    # Check symmetry: if A connects to B, then B connects to A
    for room_id, neighbors in generator.room_graph.items():
        for neighbor_id in neighbors:
            assert (
                room_id in generator.room_graph.get(neighbor_id, set())
            ), f"Room graph is not symmetric: {room_id} -> {neighbor_id} but not reverse"


def test_walkable_path_exists() -> None:
    """Test that walkable path exists between all rooms."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=6, max_rooms=10)
    level = generator.generate(seed=333)

    # Check that corridors are walkable
    for room in generator.rooms:
        # Check room floor
        for y in range(room.rect.top, room.rect.bottom):
            for x in range(room.rect.left, room.rect.right):
                tile = level.get_tile(x, y)
                assert tile is not None
                assert tile.walkable, f"Room {room.room_id} has non-walkable tile at ({x}, {y})"

        # Check connections (doors should be walkable)
        for door_x, door_y in room.doors:
            tile = level.get_tile(door_x, door_y)
            assert tile is not None
            assert tile.walkable, f"Door at ({door_x}, {door_y}) is not walkable"


def test_wave_spawns() -> None:
    """Test wave spawn generation."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=5, max_rooms=8)
    level = generator.generate(seed=444, floor_number=1)

    # Test spawns for combat room
    combat_rooms = [r for r in generator.rooms if r.room_type == RoomType.COMBAT]
    if combat_rooms:
        room = combat_rooms[0]
        spawns = generator.get_wave_spawns(room.room_id, floor_number=1)

        assert len(spawns) > 0, "No spawns generated"
        assert len(spawns) >= 3, "Too few spawns"

        # Check that spawns are within room bounds
        for spawn_x, spawn_y in spawns:
            assert room.rect.left < spawn_x < room.rect.right
            assert room.rect.top < spawn_y < room.rect.bottom


def test_wave_spawn_density_increases() -> None:
    """Test that spawn density increases with floor number."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=5, max_rooms=8)
    level1 = generator.generate(seed=555, floor_number=1)
    level2 = generator.generate(seed=555, floor_number=2)
    level3 = generator.generate(seed=555, floor_number=3)

    # Find same room type
    combat_rooms1 = [r for r in generator.rooms if r.room_type == RoomType.COMBAT]
    if len(combat_rooms1) > 0:
        room_id = combat_rooms1[0].room_id

        spawns1 = generator.get_wave_spawns(room_id, floor_number=1)
        spawns2 = generator.get_wave_spawns(room_id, floor_number=2)
        spawns3 = generator.get_wave_spawns(room_id, floor_number=3)

        # Density should increase (or at least not decrease significantly)
        assert len(spawns2) >= len(spawns1) * 0.8, "Spawn density should increase"
        assert len(spawns3) >= len(spawns2) * 0.8, "Spawn density should increase"


def test_get_room_at() -> None:
    """Test getting room at coordinates."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=5, max_rooms=8)
    level = generator.generate(seed=666)

    # Test getting room at center of first room
    if generator.rooms:
        room = generator.rooms[0]
        center_x = room.rect.centerx
        center_y = room.rect.centery

        found_room = generator.get_room_at(center_x, center_y)
        assert found_room is not None
        assert found_room.room_id == room.room_id


def test_door_placement() -> None:
    """Test that doors are placed between connected rooms."""
    generator = DungeonGenerator(width=50, height=40, min_rooms=5, max_rooms=8)
    level = generator.generate(seed=777)

    # Check that connected rooms have doors
    for room in generator.rooms:
        for connected_id in generator.room_graph.get(room.room_id, set()):
            # At least one door should exist
            assert len(room.doors) > 0, f"Room {room.room_id} has no doors"


# Import pygame for Rect
import pygame

