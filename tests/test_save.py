"""Tests for save/load serialization (round-trip)."""

import json
import tempfile
from pathlib import Path

import pytest

from game.ecs.components import Experience, Inventory, SkillTree
from game.ecs.entities import Entity, EntityManager


class TestSaveLoadRoundTrip:
    """Test save/load round-trip serialization."""

    def test_inventory_save_load(self) -> None:
        """Test inventory save/load round-trip."""
        # Create inventory
        inventory = Inventory()
        inventory.gold = 500
        inventory.set_weapon(0, {"type": "sword", "name": "Sword"})
        inventory.set_weapon(1, {"type": "spear", "name": "Spear"})
        inventory.set_consumable(0, {"type": "potion", "healing": 50}, count=3)
        inventory.active_weapon_slot = 1

        # Serialize
        save_data = {
            "gold": inventory.gold,
            "weapon_slots": [slot if slot else None for slot in inventory.weapon_slots],
            "consumable_slots": [
                {"item": slot, "count": inventory.consumable_counts[i]}
                if slot else None
                for i, slot in enumerate(inventory.consumable_slots)
            ],
            "active_weapon_slot": inventory.active_weapon_slot,
        }

        # Save to temp file
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as f:
            json.dump(save_data, f, indent=2)
            temp_path = Path(f.name)

        try:
            # Load from file
            with open(temp_path, "r") as f:
                loaded_data = json.load(f)

            # Verify round-trip
            assert loaded_data["gold"] == 500
            assert loaded_data["active_weapon_slot"] == 1
            assert loaded_data["weapon_slots"][0] == {"type": "sword", "name": "Sword"}
            assert loaded_data["weapon_slots"][1] == {"type": "spear", "name": "Spear"}
            assert loaded_data["consumable_slots"][0]["item"] == {"type": "potion", "healing": 50}
            assert loaded_data["consumable_slots"][0]["count"] == 3

        finally:
            temp_path.unlink()

    def test_experience_save_load(self) -> None:
        """Test experience save/load round-trip."""
        exp = Experience(level=5, xp=250, next_xp=500)

        save_data = {
            "level": exp.level,
            "xp": exp.xp,
            "next_xp": exp.next_xp,
        }

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as f:
            json.dump(save_data, f, indent=2)
            temp_path = Path(f.name)

        try:
            with open(temp_path, "r") as f:
                loaded_data = json.load(f)

            assert loaded_data["level"] == 5
            assert loaded_data["xp"] == 250
            assert loaded_data["next_xp"] == 500

        finally:
            temp_path.unlink()

    def test_skill_tree_save_load(self) -> None:
        """Test skill tree save/load round-trip."""
        skill_tree = SkillTree()
        skill_tree.unlock_node("weapon_damage_1")
        skill_tree.unlock_node("weapon_speed_1")
        skill_tree.unlock_node("survival_hp_1")
        skill_tree.available_points = 2

        save_data = {
            "unlocked_perks": skill_tree.unlocked_nodes,
            "available_points": skill_tree.available_points,
        }

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as f:
            json.dump(save_data, f, indent=2)
            temp_path = Path(f.name)

        try:
            with open(temp_path, "r") as f:
                loaded_data = json.load(f)

            assert set(loaded_data["unlocked_perks"]) == {
                "weapon_damage_1",
                "weapon_speed_1",
                "survival_hp_1",
            }
            assert loaded_data["available_points"] == 2

        finally:
            temp_path.unlink()

    def test_full_run_save_load(self) -> None:
        """Test full run save/load round-trip."""
        # Create full save data
        save_data = {
            "level": 10,
            "xp": 450,
            "next_xp": 750,
            "gold": 1500,
            "unlocked_perks": [
                "weapon_damage_1",
                "weapon_speed_1",
                "survival_hp_1",
                "chivalry_dash_distance",
            ],
            "weapon_slots": [
                {"type": "sword", "name": "Sword"},
                {"type": "spear", "name": "Spear"},
                {"type": "crossbow", "name": "Crossbow"},
            ],
            "consumable_slots": [
                {"item": {"type": "potion", "healing": 50}, "count": 5},
                {"item": {"type": "potion", "healing": 100}, "count": 2},
            ],
        }

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as f:
            json.dump(save_data, f, indent=2)
            temp_path = Path(f.name)

        try:
            # Load and verify
            with open(temp_path, "r") as f:
                loaded_data = json.load(f)

            # Verify all fields
            assert loaded_data["level"] == 10
            assert loaded_data["xp"] == 450
            assert loaded_data["next_xp"] == 750
            assert loaded_data["gold"] == 1500
            assert len(loaded_data["unlocked_perks"]) == 4
            assert len(loaded_data["weapon_slots"]) == 3
            assert len(loaded_data["consumable_slots"]) == 2
            assert loaded_data["consumable_slots"][0]["count"] == 5
            assert loaded_data["consumable_slots"][1]["count"] == 2

            # Verify round-trip equality
            assert loaded_data == save_data

        finally:
            temp_path.unlink()

    def test_save_with_none_values(self) -> None:
        """Test save/load with None values."""
        save_data = {
            "weapon_slots": [
                {"type": "sword"},
                None,
                None,
            ],
            "consumable_slots": [
                {"item": {"type": "potion"}, "count": 3},
                None,
            ],
        }

        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".json") as f:
            json.dump(save_data, f, indent=2)
            temp_path = Path(f.name)

        try:
            with open(temp_path, "r") as f:
                loaded_data = json.load(f)

            assert loaded_data["weapon_slots"][0] == {"type": "sword"}
            assert loaded_data["weapon_slots"][1] is None
            assert loaded_data["weapon_slots"][2] is None
            assert loaded_data["consumable_slots"][0]["count"] == 3
            assert loaded_data["consumable_slots"][1] is None

        finally:
            temp_path.unlink()

    def test_save_encoding(self) -> None:
        """Test that save files use UTF-8 encoding."""
        save_data = {
            "perk_name": "Острый клинок",  # Russian text
            "description": "Увеличивает урон на 20%",
        }

        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", delete=False, suffix=".json"
        ) as f:
            json.dump(save_data, f, indent=2, ensure_ascii=False)
            temp_path = Path(f.name)

        try:
            with open(temp_path, "r", encoding="utf-8") as f:
                loaded_data = json.load(f)

            assert loaded_data["perk_name"] == "Острый клинок"
            assert loaded_data["description"] == "Увеличивает урон на 20%"

        finally:
            temp_path.unlink()

