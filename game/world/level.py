"""Level/dungeon level management."""

from typing import Optional

import pygame

from game.world.tiles import Tile, TileType, get_tile_color


class Level:
    """Represents a dungeon level."""

    def __init__(self, width: int, height: int) -> None:
        """Initialize level."""
        self.width = width
        self.height = height
        self.tiles: list[list[Tile]] = [
            [Tile(TileType.WALL) for _ in range(width)] for _ in range(height)
        ]
        self.rooms: list[pygame.Rect] = []
        self.room_data: Optional[list] = None  # Full room data with types
        self.current_room_id: Optional[int] = None

    def get_tile(self, x: int, y: int) -> Optional[Tile]:
        """Get tile at position."""
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.tiles[y][x]
        return None

    def set_tile(self, x: int, y: int, tile: Tile) -> None:
        """Set tile at position."""
        if 0 <= x < self.width and 0 <= y < self.height:
            self.tiles[y][x] = tile

    def is_walkable(self, x: int, y: int) -> bool:
        """Check if position is walkable."""
        tile = self.get_tile(x, y)
        return tile.walkable if tile else False

    def blocks_sight(self, x: int, y: int) -> bool:
        """Check if position blocks sight."""
        tile = self.get_tile(x, y)
        return tile.blocks_sight if tile else True

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0, tile_size: int = 32) -> None:
        """Render level."""
        start_x = max(0, camera_x // tile_size)
        start_y = max(0, camera_y // tile_size)
        end_x = min(self.width, (camera_x + screen.get_width()) // tile_size + 1)
        end_y = min(self.height, (camera_y + screen.get_height()) // tile_size + 1)

        for y in range(start_y, end_y):
            for x in range(start_x, end_x):
                tile = self.get_tile(x, y)
                if tile:
                    color = get_tile_color(tile.tile_type)
                    rect = pygame.Rect(
                        x * tile_size - camera_x,
                        y * tile_size - camera_y,
                        tile_size,
                        tile_size,
                    )
                    pygame.draw.rect(screen, color, rect)
                    pygame.draw.rect(screen, (0, 0, 0), rect, 1)

