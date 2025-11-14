"""Asset management system with placeholder generation."""

from pathlib import Path
from typing import Dict, List, Tuple

import pygame


class AssetManager:
    """Manages game assets (images, sounds, fonts, tilesets)."""

    def __init__(self, base_path: Path | str = "data") -> None:
        """Initialize asset manager."""
        self.base_path = Path(base_path)
        self.images: Dict[str, pygame.Surface] = {}
        self.tilesets: Dict[str, Dict[str, pygame.Surface]] = {}
        self.sounds: Dict[str, pygame.mixer.Sound] = {}
        self.fonts: Dict[str, pygame.font.Font] = {}
        self.default_font: pygame.font.Font | None = None

    def _create_placeholder_sprite(
        self, width: int = 32, height: int = 32, color: Tuple[int, int, int] = (255, 0, 255)
    ) -> pygame.Surface:
        """Create a placeholder sprite."""
        surf = pygame.Surface((width, height), pygame.SRCALPHA)
        surf.fill(color)
        # Add border
        pygame.draw.rect(surf, (255, 255, 255), (0, 0, width, height), 2)
        return surf

    def _create_default_font(self, size: int) -> pygame.font.Font:
        """Create default font."""
        if self.default_font is None:
            # Try to use system default font
            try:
                self.default_font = pygame.font.Font(None, size)
            except:
                # Fallback to basic font
                self.default_font = pygame.font.SysFont("arial", size)
        return self.default_font

    def load_image(self, name: str, path: str | None = None, placeholder: bool = True) -> pygame.Surface:
        """Load image asset. Creates placeholder if not found.

        Args:
            name: Asset name
            path: Optional custom path
            placeholder: Create placeholder if file not found
        """
        if name in self.images:
            return self.images[name]

        if path is None:
            path = self.base_path / "sprites" / f"{name}.png"
        else:
            path = self.base_path / path

        try:
            if path.exists():
                image = pygame.image.load(str(path)).convert_alpha()
                self.images[name] = image
                return image
        except pygame.error as e:
            print(f"Failed to load image {path}: {e}")

        # Create placeholder
        if placeholder:
            placeholder_surf = self._create_placeholder_sprite()
            self.images[name] = placeholder_surf
            return placeholder_surf

        raise FileNotFoundError(f"Image not found: {path}")

    def load_tileset(
        self, name: str, tile_width: int, tile_height: int, path: str | None = None
    ) -> Dict[str, pygame.Surface]:
        """Load tileset and split into individual tiles.

        Args:
            name: Tileset name
            tile_width: Width of each tile
            tile_height: Height of each tile
            path: Optional custom path
        """
        if name in self.tilesets:
            return self.tilesets[name]

        if path is None:
            path = self.base_path / "sprites" / f"{name}.png"
        else:
            path = self.base_path / path

        tiles: Dict[str, pygame.Surface] = {}

        try:
            if path.exists():
                tileset_image = pygame.image.load(str(path)).convert_alpha()
                tileset_width = tileset_image.get_width()
                tileset_height = tileset_image.get_height()

                tile_x = 0
                tile_y = 0
                tile_id = 0

                while tile_y < tileset_height:
                    while tile_x < tileset_width:
                        tile_rect = pygame.Rect(tile_x, tile_y, tile_width, tile_height)
                        tile_surface = tileset_image.subsurface(tile_rect)
                        tiles[f"{name}_{tile_id}"] = tile_surface
                        tile_id += 1
                        tile_x += tile_width
                    tile_x = 0
                    tile_y += tile_height

                self.tilesets[name] = tiles
                return tiles
        except pygame.error as e:
            print(f"Failed to load tileset {path}: {e}")

        # Create placeholder tileset
        placeholder_tile = self._create_placeholder_sprite(tile_width, tile_height)
        tiles[f"{name}_0"] = placeholder_tile
        self.tilesets[name] = tiles
        return tiles

    def get_tile(self, tileset_name: str, tile_id: int) -> pygame.Surface | None:
        """Get a specific tile from tileset."""
        tileset = self.tilesets.get(tileset_name)
        if tileset:
            return tileset.get(f"{tileset_name}_{tile_id}")
        return None

    def load_sound(self, name: str, path: str | None = None) -> pygame.mixer.Sound:
        """Load sound asset."""
        if name in self.sounds:
            return self.sounds[name]

        if path is None:
            path = self.base_path / "sfx" / f"{name}.wav"
        else:
            path = self.base_path / path

        try:
            if path.exists():
                sound = pygame.mixer.Sound(str(path))
                self.sounds[name] = sound
                return sound
        except pygame.error as e:
            print(f"Failed to load sound {path}: {e}")

        # Return silent sound as placeholder
        try:
            silent = pygame.sndarray.array([0] * 1000)
            return pygame.mixer.Sound(silent)
        except:
            # Fallback: create empty sound
            return pygame.mixer.Sound(pygame.sndarray.array([0]))

    def load_font(
        self, name: str, size: int, path: str | None = None, use_default: bool = True
    ) -> pygame.font.Font:
        """Load font asset. Uses default font if not found.

        Args:
            name: Font name
            size: Font size
            path: Optional custom path
            use_default: Use default font if file not found
        """
        key = f"{name}_{size}"
        if key in self.fonts:
            return self.fonts[key]

        if path is None:
            font_path = self.base_path / "fonts" / f"{name}.ttf"
        else:
            font_path = self.base_path / path

        try:
            if font_path.exists():
                font = pygame.font.Font(str(font_path), size)
                self.fonts[key] = font
                return font
        except pygame.error as e:
            print(f"Failed to load font {font_path}: {e}")

        # Use default font
        if use_default:
            font = self._create_default_font(size)
            self.fonts[key] = font
            return font

        raise FileNotFoundError(f"Font not found: {font_path}")

    def get_image(self, name: str) -> pygame.Surface | None:
        """Get loaded image."""
        return self.images.get(name)

    def get_sound(self, name: str) -> pygame.mixer.Sound | None:
        """Get loaded sound."""
        return self.sounds.get(name)

    def get_font(self, name: str, size: int) -> pygame.font.Font | None:
        """Get loaded font."""
        return self.fonts.get(f"{name}_{size}")

    def create_placeholder(
        self, name: str, width: int = 32, height: int = 32, color: Tuple[int, int, int] = (255, 0, 255)
    ) -> pygame.Surface:
        """Create and register a placeholder sprite."""
        placeholder = self._create_placeholder_sprite(width, height, color)
        self.images[name] = placeholder
        return placeholder

    def clear(self) -> None:
        """Clear all loaded assets."""
        self.images.clear()
        self.tilesets.clear()
        self.sounds.clear()
        self.fonts.clear()
        self.default_font = None


# Global asset manager instance
assets = AssetManager()
