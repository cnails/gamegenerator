"""Tile types and definitions."""

from dataclasses import dataclass
from enum import IntEnum

import pygame


class TileType(IntEnum):
    """Tile type enumeration."""

    FLOOR = 0
    WALL = 1
    DOOR = 2
    STAIRS_DOWN = 3
    STAIRS_UP = 4


@dataclass
class Tile:
    """Represents a single tile."""

    tile_type: TileType
    walkable: bool = True
    blocks_sight: bool = False

    def __post_init__(self) -> None:
        """Set properties based on tile type."""
        if self.tile_type == TileType.WALL:
            self.walkable = False
            self.blocks_sight = True
        elif self.tile_type == TileType.DOOR:
            self.walkable = True
            self.blocks_sight = False
        elif self.tile_type in (TileType.STAIRS_DOWN, TileType.STAIRS_UP):
            self.walkable = True
            self.blocks_sight = False


def get_tile_color(tile_type: TileType) -> tuple[int, int, int]:
    """Get color for tile type."""
    colors = {
        TileType.FLOOR: (50, 50, 50),
        TileType.WALL: (100, 100, 100),
        TileType.DOOR: (139, 69, 19),
        TileType.STAIRS_DOWN: (150, 75, 0),
        TileType.STAIRS_UP: (0, 150, 75),
    }
    return colors.get(tile_type, (0, 0, 0))

