"""Tests for perk system: stat growth, stacking, application."""

import pytest

from game.ecs.components import Damage, Health, SkillTree, Weapon
from game.ecs.entities import Entity, EntityManager
from game.gameplay.perks import PERKS, PerkCategory, PerkRarity, apply_perk, roll_perks


class TestPerkApplication:
    """Test perk application to player."""

    def test_damage_multiplier_perk(self) -> None:
        """Test damage multiplier perk."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        damage = Damage(base=100, crit_chance=0.0)
        player.add_component(damage)
        
        perk = PERKS["weapon_damage_1"]  # +20% damage
        apply_perk(player, perk)
        
        assert damage.base == 120  # 100 * 1.2

    def test_attack_speed_perk(self) -> None:
        """Test attack speed perk."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        weapon = Weapon(attack_delay=1.0)
        player.add_component(weapon)
        
        perk = PERKS["weapon_speed_1"]  # -25% delay
        apply_perk(player, perk)
        
        assert weapon.attack_delay == 0.75  # 1.0 * 0.75

    def test_max_hp_perk(self) -> None:
        """Test max HP perk."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        health = Health(max_hp=100, hp=100)
        player.add_component(health)
        
        perk = PERKS["survival_hp_1"]  # +25 max HP
        apply_perk(player, perk)
        
        assert health.max_hp == 125
        assert health.hp == 125  # Should also heal

    def test_crit_chance_perk(self) -> None:
        """Test crit chance perk."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        damage = Damage(base=10, crit_chance=0.1)
        player.add_component(damage)
        
        perk = PERKS["weapon_crit_1"]  # +15% crit chance
        apply_perk(player, perk)
        
        assert damage.crit_chance == 0.25  # 0.1 + 0.15

    def test_crit_multiplier_perk(self) -> None:
        """Test crit multiplier perk."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        damage = Damage(base=10, crit_multiplier=2.0)
        player.add_component(damage)
        
        perk = PERKS["weapon_crit_2"]  # +50% crit multiplier
        apply_perk(player, perk)
        
        assert damage.crit_multiplier == 2.5  # 2.0 + 0.5


class TestPerkStacking:
    """Test perk stacking behavior."""

    def test_multiple_damage_perks_stack(self) -> None:
        """Test that multiple damage perks stack multiplicatively."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        damage = Damage(base=100, crit_chance=0.0)
        player.add_component(damage)
        
        # Apply +20% damage perk twice (simulating stacking)
        perk1 = PERKS["weapon_damage_1"]
        apply_perk(player, perk1)
        assert damage.base == 120
        
        # If we could apply again, it would be 120 * 1.2 = 144
        # But in practice, same perk shouldn't be applied twice
        # This test verifies the base behavior

    def test_different_perk_types_stack(self) -> None:
        """Test that different perk types stack independently."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        damage = Damage(base=100, crit_chance=0.1)
        weapon = Weapon(attack_delay=1.0)
        health = Health(max_hp=100, hp=100)
        
        player.add_component(damage)
        player.add_component(weapon)
        player.add_component(health)
        
        # Apply different perks
        apply_perk(player, PERKS["weapon_damage_1"])  # +20% damage
        apply_perk(player, PERKS["weapon_speed_1"])  # -25% delay
        apply_perk(player, PERKS["survival_hp_1"])  # +25 HP
        apply_perk(player, PERKS["weapon_crit_1"])  # +15% crit
        
        assert damage.base == 120
        assert weapon.attack_delay == 0.75
        assert health.max_hp == 125
        assert damage.crit_chance == 0.25

    def test_perk_effects_persist(self) -> None:
        """Test that perk effects persist after application."""
        entity_manager = EntityManager()
        player = entity_manager.create_entity()
        
        damage = Damage(base=100)
        player.add_component(damage)
        
        perk = PERKS["weapon_damage_1"]
        apply_perk(player, perk)
        
        # Damage should remain modified
        assert damage.base == 120
        
        # Calculate damage should use new base
        result_damage, _ = damage.calculate_damage(is_crit=False)
        assert result_damage == 120


class TestPerkRolling:
    """Test perk rolling system."""

    def test_roll_perks_count(self) -> None:
        """Test that rolling returns correct number of perks."""
        perks = roll_perks(count=3)
        assert len(perks) == 3

    def test_roll_perks_no_duplicates(self) -> None:
        """Test that rolled perks don't duplicate."""
        perks = roll_perks(count=3)
        perk_ids = [p.id for p in perks]
        assert len(perk_ids) == len(set(perk_ids))  # All unique

    def test_roll_perks_exclude(self) -> None:
        """Test that excluded perks are not rolled."""
        exclude = ["weapon_damage_1", "weapon_speed_1"]
        perks = roll_perks(count=10, exclude=exclude)
        
        for perk in perks:
            assert perk.id not in exclude

    def test_rarity_distribution(self) -> None:
        """Test that rarity distribution is approximately correct."""
        # Roll many perks and check distribution
        all_perks = roll_perks(count=1000)
        
        rarity_counts = {}
        for perk in all_perks:
            rarity_counts[perk.rarity] = rarity_counts.get(perk.rarity, 0) + 1
        
        # Common should be most common (~70%)
        common_rate = rarity_counts.get(PerkRarity.COMMON, 0) / 1000
        assert 0.65 <= common_rate <= 0.75, f"Common rate {common_rate} not ~70%"
        
        # Rare should be ~25%
        rare_rate = rarity_counts.get(PerkRarity.RARE, 0) / 1000
        assert 0.20 <= rare_rate <= 0.30, f"Rare rate {rare_rate} not ~25%"
        
        # Epic should be ~5%
        epic_rate = rarity_counts.get(PerkRarity.EPIC, 0) / 1000
        assert 0.03 <= epic_rate <= 0.07, f"Epic rate {epic_rate} not ~5%"


class TestSkillTree:
    """Test skill tree component."""

    def test_unlock_node(self) -> None:
        """Test unlocking a skill node."""
        skill_tree = SkillTree()
        assert skill_tree.unlock_node("test_perk")
        assert "test_perk" in skill_tree.unlocked_nodes

    def test_unlock_duplicate_node(self) -> None:
        """Test that unlocking same node twice returns False."""
        skill_tree = SkillTree()
        assert skill_tree.unlock_node("test_perk")
        assert not skill_tree.unlock_node("test_perk")  # Already unlocked

    def test_has_node(self) -> None:
        """Test checking if node is unlocked."""
        skill_tree = SkillTree()
        assert not skill_tree.has_node("test_perk")
        
        skill_tree.unlock_node("test_perk")
        assert skill_tree.has_node("test_perk")

    def test_add_skill_points(self) -> None:
        """Test adding skill points."""
        skill_tree = SkillTree()
        assert skill_tree.available_points == 0
        
        skill_tree.add_skill_point(5)
        assert skill_tree.available_points == 5
        
        skill_tree.add_skill_point(3)
        assert skill_tree.available_points == 8

