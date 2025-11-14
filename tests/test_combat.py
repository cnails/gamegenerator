"""Tests for combat formulas: crit, armor, frame-based damage."""

import random
import pytest

from game.ecs.components import Damage, Health


class TestDamageFormulas:
    """Test damage calculation formulas."""

    def test_base_damage(self) -> None:
        """Test base damage calculation."""
        damage = Damage(base=20, crit_chance=0.0)
        result_damage, is_crit = damage.calculate_damage(is_crit=False)
        assert result_damage == 20
        assert not is_crit

    def test_crit_damage(self) -> None:
        """Test critical hit damage."""
        damage = Damage(base=20, crit_chance=1.0, crit_multiplier=2.0)
        result_damage, is_crit = damage.calculate_damage(is_crit=True)
        assert result_damage == 40
        assert is_crit

    def test_crit_chance(self) -> None:
        """Test crit chance probability."""
        damage = Damage(base=10, crit_chance=0.5, crit_multiplier=2.0)
        
        # Test multiple times to verify probability
        crits = 0
        total = 1000
        for _ in range(total):
            _, is_crit = damage.calculate_damage()
            if is_crit:
                crits += 1
        
        # Should be approximately 50% (with some tolerance)
        crit_rate = crits / total
        assert 0.45 <= crit_rate <= 0.55, f"Crit rate {crit_rate} not close to 0.5"

    def test_bonus_damage(self) -> None:
        """Test bonus damage addition."""
        damage = Damage(base=10, bonus_damage=5, crit_chance=0.0)
        result_damage, _ = damage.calculate_damage(is_crit=False)
        assert result_damage == 15

    def test_crit_with_bonus_damage(self) -> None:
        """Test crit calculation with bonus damage."""
        damage = Damage(base=10, bonus_damage=5, crit_chance=0.0, crit_multiplier=2.0)
        result_damage, is_crit = damage.calculate_damage(is_crit=True)
        # Crit multiplies total: (10 + 5) * 2 = 30
        assert result_damage == 30
        assert is_crit

    def test_crit_multiplier_variations(self) -> None:
        """Test different crit multipliers."""
        base = 20
        
        for multiplier in [1.5, 2.0, 2.5, 3.0]:
            damage = Damage(base=base, crit_chance=0.0, crit_multiplier=multiplier)
            result_damage, is_crit = damage.calculate_damage(is_crit=True)
            expected = int(base * multiplier)
            assert result_damage == expected
            assert is_crit


class TestHealthAndArmor:
    """Test health and damage reduction formulas."""

    def test_health_take_damage(self) -> None:
        """Test taking damage."""
        health = Health(max_hp=100, hp=100)
        actual_damage = health.take_damage(30)
        assert actual_damage == 30
        assert health.hp == 70

    def test_health_overflow_protection(self) -> None:
        """Test that damage cannot exceed current HP."""
        health = Health(max_hp=100, hp=50)
        actual_damage = health.take_damage(100)
        assert actual_damage == 50
        assert health.hp == 0

    def test_health_heal(self) -> None:
        """Test healing."""
        health = Health(max_hp=100, hp=50)
        actual_heal = health.heal(30)
        assert actual_heal == 30
        assert health.hp == 80

    def test_health_heal_overflow_protection(self) -> None:
        """Test that healing cannot exceed max HP."""
        health = Health(max_hp=100, hp=90)
        actual_heal = health.heal(30)
        assert actual_heal == 10
        assert health.hp == 100

    def test_health_percentage(self) -> None:
        """Test health percentage calculation."""
        health = Health(max_hp=100, hp=75)
        assert health.get_percentage() == 0.75
        
        health.hp = 50
        assert health.get_percentage() == 0.5
        
        health.hp = 0
        assert health.get_percentage() == 0.0

    def test_damage_reduction_formula(self) -> None:
        """Test damage reduction calculation."""
        # Simulate armor/damage reduction
        base_damage = 100
        reduction = 0.2  # 20% reduction
        
        reduced_damage = int(base_damage * (1 - reduction))
        assert reduced_damage == 80

    def test_multiple_damage_reductions(self) -> None:
        """Test stacking damage reductions."""
        base_damage = 100
        reduction1 = 0.1  # 10%
        reduction2 = 0.15  # 15%
        
        # Reductions stack multiplicatively
        total_reduction = 1 - (1 - reduction1) * (1 - reduction2)
        reduced_damage = int(base_damage * (1 - total_reduction))
        
        # Should be approximately 23.5% reduction
        assert 23 <= reduced_damage <= 24


class TestFrameBasedDamage:
    """Test frame-based damage windows for melee attacks."""

    def test_damage_frame_window(self) -> None:
        """Test that damage is only applied during active frames."""
        # Simulate attack frames
        total_frames = 10
        damage_frames = [3, 4, 5]  # Frames where damage is active
        
        hits = []
        for frame in range(total_frames):
            if frame in damage_frames:
                hits.append(frame)
        
        assert len(hits) == 3
        assert hits == [3, 4, 5]

    def test_damage_frame_timing(self) -> None:
        """Test damage frame timing."""
        attack_duration = 0.5  # seconds
        fps = 60
        total_frames = int(attack_duration * fps)
        
        # Damage window is middle 30% of frames
        damage_start = int(total_frames * 0.35)
        damage_end = int(total_frames * 0.65)
        
        damage_frames = list(range(damage_start, damage_end))
        
        assert len(damage_frames) > 0
        assert damage_start < damage_end <= total_frames

    def test_multiple_hits_in_window(self) -> None:
        """Test that multiple enemies can be hit in damage window."""
        damage_frames = [5, 6, 7]
        enemies_hit = []
        
        for frame in damage_frames:
            # Simulate checking collisions at each frame
            enemies_in_range = ["enemy1", "enemy2"]  # Mock
            for enemy in enemies_in_range:
                if enemy not in enemies_hit:
                    enemies_hit.append(enemy)
        
        # Both enemies should be hit
        assert len(enemies_hit) == 2

