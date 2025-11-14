"""Save/load system."""

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict

from game.ecs.components import Health, Inventory, Transform, Stats
from game.ecs.entities import Entity, EntityManager


class SaveManager:
    """Manages game saves."""

    def __init__(self, save_dir: Path | str = "save") -> None:
        """Initialize save manager."""
        self.save_dir = Path(save_dir)
        self.save_dir.mkdir(parents=True, exist_ok=True)

    def save_game(self, entity_manager: EntityManager, level_data: Dict[str, Any], filename: str = "save.json") -> bool:
        """Save game state."""
        save_path = self.save_dir / filename

        # Collect entity data
        entities_data = []
        for entity in entity_manager.entities.values():
            entity_data: Dict[str, Any] = {"id": entity.id, "components": {}}

            pos = entity.get_component(Transform)
            if pos:
                entity_data["components"]["Position"] = {"x": pos.x, "y": pos.y}

            health = entity.get_component(Health)
            if health:
                entity_data["components"]["Health"] = {
                    "current": health.current,
                    "maximum": health.maximum,
                }

            stats = entity.get_component(Stats)
            if stats:
                entity_data["components"]["Stats"] = {
                    "attack": stats.attack,
                    "defense": stats.defense,
                    "speed": stats.speed,
                }
            
            # Experience is a separate component
            from game.ecs.components import Experience
            exp = entity.get_component(Experience)
            if exp:
                entity_data["components"]["Experience"] = {
                    "level": exp.level,
                    "xp": exp.xp,
                    "next_xp": exp.next_xp,
                }

            inventory = entity.get_component(Inventory)
            if inventory:
                entity_data["components"]["Inventory"] = {
                    "items": inventory.items,
                    "max_size": inventory.max_size,
                }

            entities_data.append(entity_data)

        save_data = {
            "entities": entities_data,
            "level": level_data,
        }

        try:
            with open(save_path, "w", encoding="utf-8") as f:
                json.dump(save_data, f, indent=2)
            return True
        except IOError as e:
            print(f"Failed to save game: {e}")
            return False

    def load_game(self, filename: str = "save.json") -> Dict[str, Any] | None:
        """Load game state."""
        save_path = self.save_dir / filename

        if not save_path.exists():
            return None

        try:
            with open(save_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Failed to load game: {e}")
            return None

