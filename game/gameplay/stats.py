"""Game statistics tracking system."""

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class GameStats:
    """Statistics for a game run."""

    start_time: float = 0.0
    end_time: float = 0.0
    kills: int = 0
    damage_by_weapon: Dict[str, int] = field(default_factory=lambda: {"sword": 0, "spear": 0, "crossbow": 0})
    total_damage: int = 0
    levels_gained: int = 0
    rooms_cleared: int = 0

    def get_time_played(self) -> float:
        """Get total time played in seconds."""
        if self.end_time > 0:
            return self.end_time - self.start_time
        return 0.0

    def format_time(self) -> str:
        """Format time as MM:SS."""
        total_seconds = int(self.get_time_played())
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        return f"{minutes:02d}:{seconds:02d}"

    def add_damage(self, weapon_type: str, amount: int) -> None:
        """Add damage dealt with a weapon."""
        if weapon_type in self.damage_by_weapon:
            self.damage_by_weapon[weapon_type] += amount
        self.total_damage += amount

    def add_kill(self) -> None:
        """Add a kill."""
        self.kills += 1


# Global stats instance
game_stats = GameStats()

