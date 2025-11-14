"""Game settings and configuration."""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict

import pygame


@dataclass
class KeyBindings:
    """Keyboard bindings configuration."""

    move_up: int = pygame.K_w
    move_down: int = pygame.K_s
    move_left: int = pygame.K_a
    move_right: int = pygame.K_d
    attack: int = pygame.K_j
    secondary: int = pygame.K_k
    skill: int = pygame.K_l
    inventory: int = pygame.K_i
    pause: int = pygame.K_ESCAPE
    weapon_prev: int = pygame.K_q
    weapon_next: int = pygame.K_e
    dodge: int = pygame.K_LSHIFT

    # Arrow keys as alternatives
    move_up_alt: int = pygame.K_UP
    move_down_alt: int = pygame.K_DOWN
    move_left_alt: int = pygame.K_LEFT
    move_right_alt: int = pygame.K_RIGHT

    def is_movement_key(self, key: int) -> bool:
        """Check if key is a movement key."""
        return key in (
            self.move_up,
            self.move_down,
            self.move_left,
            self.move_right,
            self.move_up_alt,
            self.move_down_alt,
            self.move_left_alt,
            self.move_right_alt,
        )

    def get_movement_direction(self, key: int) -> tuple[int, int] | None:
        """Get movement direction from key."""
        if key in (self.move_up, self.move_up_alt):
            return (0, -1)
        if key in (self.move_down, self.move_down_alt):
            return (0, 1)
        if key in (self.move_left, self.move_left_alt):
            return (-1, 0)
        if key in (self.move_right, self.move_right_alt):
            return (1, 0)
        return None


@dataclass
class GameSettings:
    """Main game settings."""

    screen_width: int = 1280
    screen_height: int = 720
    fps: int = 60
    volume_master: float = 1.0
    volume_sfx: float = 1.0
    volume_music: float = 1.0
    pixel_scale: int = 2
    language: str = "en"  # "en" or "ru"
    keybindings: KeyBindings = field(default_factory=KeyBindings)

    @classmethod
    def load(cls, path: Path | str = "data/config/settings.json") -> "GameSettings":
        """Load settings from JSON file."""
        path = Path(path)
        if not path.exists():
            return cls()

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, IOError):
            return cls()

        keybindings_data = data.get("keybindings", {})
        keybindings = KeyBindings(
            move_up=keybindings_data.get("move_up", pygame.K_w),
            move_down=keybindings_data.get("move_down", pygame.K_s),
            move_left=keybindings_data.get("move_left", pygame.K_a),
            move_right=keybindings_data.get("move_right", pygame.K_d),
            attack=keybindings_data.get("attack", pygame.K_j),
            secondary=keybindings_data.get("secondary", pygame.K_k),
            skill=keybindings_data.get("skill", pygame.K_l),
            inventory=keybindings_data.get("inventory", pygame.K_i),
            pause=keybindings_data.get("pause", pygame.K_ESCAPE),
        )

        return cls(
            screen_width=data.get("screen_width", 1280),
            screen_height=data.get("screen_height", 720),
            fps=data.get("fps", 60),
            volume_master=data.get("volume_master", 1.0),
            volume_sfx=data.get("volume_sfx", 1.0),
            volume_music=data.get("volume_music", 1.0),
            pixel_scale=data.get("pixel_scale", 2),
            language=data.get("language", "en"),
            keybindings=keybindings,
        )

    def save(self, path: Path | str = "data/config/settings.json") -> None:
        """Save settings to JSON file."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        data: Dict[str, Any] = {
            "screen_width": self.screen_width,
            "screen_height": self.screen_height,
            "fps": self.fps,
            "volume_master": self.volume_master,
            "volume_sfx": self.volume_sfx,
            "volume_music": self.volume_music,
            "pixel_scale": self.pixel_scale,
            "language": self.language,
            "keybindings": {
                "move_up": self.keybindings.move_up,
                "move_down": self.keybindings.move_down,
                "move_left": self.keybindings.move_left,
                "move_right": self.keybindings.move_right,
                "attack": self.keybindings.attack,
                "secondary": self.keybindings.secondary,
                "skill": self.keybindings.skill,
                "inventory": self.keybindings.inventory,
                "pause": self.keybindings.pause,
            },
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

