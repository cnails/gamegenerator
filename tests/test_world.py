"""Tests for world generation."""

from game.world.dungeon_gen import DungeonGenerator
from game.world.level import Level
from game.world.tiles import TileType


def test_level_creation() -> None:
    """Test level creation."""
    level = Level(50, 50)
    assert level.width == 50
    assert level.height == 50

    tile = level.get_tile(10, 10)
    assert tile is not None
    assert tile.tile_type == TileType.WALL


def test_level_walkable() -> None:
    """Test walkable check."""
    level = Level(50, 50)
    assert not level.is_walkable(10, 10)  # Wall

    from game.world.tiles import Tile

    level.set_tile(10, 10, Tile(TileType.FLOOR))
    assert level.is_walkable(10, 10)


def test_dungeon_generation() -> None:
    """Test dungeon generation."""
    generator = DungeonGenerator(width=40, height=30, min_rooms=3, max_rooms=5)
    level = generator.generate(seed=42)

    assert level.width == 40
    assert level.height == 30
    assert len(level.rooms) >= 3
    assert len(level.rooms) <= 5

    # Check that rooms have floors
    for room in level.rooms:
        tile = level.get_tile(room.centerx, room.centery)
        assert tile is not None
        assert tile.walkable

