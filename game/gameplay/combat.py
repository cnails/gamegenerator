"""Combat mechanics with precise hitboxes and weapon-specific attacks."""

import math
from typing import List, Optional, Tuple

import pygame

from game.core.events import EVENT_DAMAGE_TAKEN, EVENT_ENEMY_KILLED, event_bus, GameEvent
from game.ecs.components import Damage, Enemy, Faction, FactionType, Health, Projectile, Transform, Weapon, WeaponType
from game.ecs.entities import Entity, EntityManager
from game.ecs.systems import CombatSystem
from game.gameplay.effects import EffectsSystem
from game.gameplay.hitboxes import HitboxManager
from game.gameplay.weapons.definitions import get_weapon_stats, Rarity


class WeaponAttackSystem:
    """Handles weapon-specific attack patterns with precise hitboxes."""

    def __init__(
        self, entity_manager: EntityManager, projectile_system, effects_system: EffectsSystem
    ) -> None:
        """Initialize weapon attack system."""
        self.entity_manager = entity_manager
        self.combat_system = CombatSystem(entity_manager)
        self.projectile_system = projectile_system
        self.effects_system = effects_system
        self.hitbox_manager = HitboxManager()
        self.attack_frames: dict[int, int] = {}  # entity_id -> current_frame

    def perform_attack(
        self, attacker_id: int, current_time: float, mouse_pos: Optional[Tuple[int, int]] = None
    ) -> List[int]:
        """Perform attack based on weapon type with frame-based hitboxes.

        Args:
            attacker_id: Attacker entity ID
            current_time: Current game time
            mouse_pos: Optional mouse position for direction

        Returns:
            List of hit entity IDs
        """
        attacker = self.entity_manager.get_entity(attacker_id)
        if not attacker:
            return []

        weapon = attacker.get_component(Weapon)
        transform = attacker.get_component(Transform)
        damage_comp = attacker.get_component(Damage)

        if not weapon or not transform or not damage_comp:
            return []

        if not weapon.can_attack(current_time):
            return []

        weapon.last_attack_time = current_time

        # Get weapon stats (with rarity if available)
        rarity = Rarity.COMMON  # Default, can be stored in weapon component
        weapon_stats = get_weapon_stats(weapon.weapon_type, rarity)

        # Get attack direction
        attack_dir = self._get_attack_direction(transform, mouse_pos)

        # Start attack animation frame counter
        self.attack_frames[attacker_id] = 0

        if weapon.weapon_type == WeaponType.SWORD:
            return self._sword_attack(attacker_id, transform, attack_dir, damage_comp, weapon_stats)
        elif weapon.weapon_type == WeaponType.SPEAR:
            return self._spear_attack(attacker_id, transform, attack_dir, damage_comp, weapon_stats)
        elif weapon.weapon_type == WeaponType.CROSSBOW:
            return self._crossbow_attack(attacker_id, transform, attack_dir, damage_comp, weapon_stats, current_time)

        return []

    def update_attack_frames(self, dt: float) -> None:
        """Update attack frame counters and check hits."""
        self.hitbox_manager.update()

        # Update attack frames
        for attacker_id in list(self.attack_frames.keys()):
            self.attack_frames[attacker_id] += 1

            attacker = self.entity_manager.get_entity(attacker_id)
            if not attacker:
                del self.attack_frames[attacker_id]
                continue

            weapon = attacker.get_component(Weapon)
            damage_comp = attacker.get_component(Damage)

            if not weapon or not damage_comp:
                del self.attack_frames[attacker_id]
                continue

            # Check for hits with active hitboxes
            hit_entities = self.hitbox_manager.check_hits(attacker_id, self.entity_manager)

            for entity_id in hit_entities:
                damage, is_crit = damage_comp.calculate_damage()
                actual_damage = self.combat_system.apply_damage(entity_id, damage, attacker_id, is_crit)

                if actual_damage > 0:
                    # Add effects
                    target = self.entity_manager.get_entity(entity_id)
                    if target:
                        target_transform = target.get_component(Transform)
                        if target_transform:
                            self.effects_system.add_damage_number(
                                target_transform.x, target_transform.y, actual_damage, is_crit
                            )

                            if is_crit:
                                self.effects_system.add_crit_particles(target_transform.x, target_transform.y)
                                self.effects_system.shake_camera(3.0, 0.1)  # Strong shake for crit
                            else:
                                self.effects_system.add_hit_particles(target_transform.x, target_transform.y)
                                self.effects_system.shake_camera(1.5, 0.05)  # Light shake

    def _get_attack_direction(
        self, transform: Transform, mouse_pos: Optional[Tuple[int, int]]
    ) -> Tuple[float, float]:
        """Get attack direction from movement or mouse."""
        if mouse_pos:
            # Use mouse direction
            dx = mouse_pos[0] - transform.x
            dy = mouse_pos[1] - transform.y
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                return (dx / length, dy / length)

        # Use movement direction or default
        if abs(transform.dx) > 0.1 or abs(transform.dy) > 0.1:
            length = math.sqrt(transform.dx ** 2 + transform.dy ** 2)
            return (transform.dx / length, transform.dy / length)

        return (0.0, -1.0)  # Default: up

    def _sword_attack(
        self,
        attacker_id: int,
        transform: Transform,
        direction: Tuple[float, float],
        damage_comp: Damage,
        weapon_stats: dict,
    ) -> List[int]:
        """
        Sword attack: arc swing with frame-based hitbox.
        
        Creates an arc hitbox that sweeps in front of the player.
        Damage is only applied during specific animation frames (start_frame to end_frame).
        """
        params = weapon_stats["hitbox_params"]
        arc_angle = math.radians(params["arc_angle"])  # Total arc angle in radians
        start_frame = params["arc_start_frame"]  # First frame with damage
        end_frame = params["arc_end_frame"]  # Last frame with damage
        range_val = weapon_stats["range"]

        # Calculate arc boundaries: centered on attack direction
        base_angle = math.atan2(direction[1], direction[0])  # Attack direction
        start_angle = base_angle - arc_angle / 2  # Left boundary

        # Create arc hitbox
        self.hitbox_manager.add_arc_hitbox(
            center=(transform.x, transform.y),
            radius=range_val,
            start_angle=start_angle,
            arc_angle=arc_angle,
            start_frame=start_frame,
            end_frame=end_frame,
        )

        return []  # Hits handled by frame updates

    def _spear_attack(
        self,
        attacker_id: int,
        transform: Transform,
        direction: Tuple[float, float],
        damage_comp: Damage,
        weapon_stats: dict,
    ) -> List[int]:
        """
        Spear attack: forward thrust with line hitbox.
        
        Creates a line hitbox extending forward from player position.
        Can penetrate through multiple enemies (penetration > 0).
        """
        params = weapon_stats["hitbox_params"]
        start_frame = params["line_start_frame"]  # First damage frame
        end_frame = params["line_end_frame"]  # Last damage frame
        range_val = weapon_stats["range"]
        cone_angle = math.radians(params["cone_angle"])  # Cone width for hit detection

        # Calculate line endpoints: from player to max range in attack direction
        start_pos = (transform.x, transform.y)
        end_x = transform.x + direction[0] * range_val
        end_y = transform.y + direction[1] * range_val
        end_pos = (end_x, end_y)

        # Calculate width based on cone angle
        width = range_val * math.tan(cone_angle / 2) * 2

        # Create line hitbox
        self.hitbox_manager.add_line_hitbox(
            start=start_pos,
            end=end_pos,
            width=width,
            start_frame=start_frame,
            end_frame=end_frame,
        )

        return []  # Hits handled by frame updates

    def _crossbow_attack(
        self,
        attacker_id: int,
        transform: Transform,
        direction: Tuple[float, float],
        damage_comp: Damage,
        weapon_stats: dict,
        current_time: float,
    ) -> List[int]:
        """Crossbow attack: projectile with precise hitbox."""
        # Create projectile with hitbox info
        target_x = transform.x + direction[0] * weapon_stats["range"]
        target_y = transform.y + direction[1] * weapon_stats["range"]

        damage, _ = damage_comp.calculate_damage()

        params = weapon_stats["hitbox_params"]
        projectile_id = self.projectile_system.create_projectile(
            transform.x,
            transform.y,
            target_x,
            target_y,
            weapon_stats["projectile_speed"],
            damage,
            attacker_id,
            hitbox_type=params.get("hitbox_type", "capsule"),
            hitbox_width=params.get("hitbox_width", 8),
            hitbox_height=params.get("hitbox_height", 8),
        )

        return []  # Hits handled by projectile system

    def _is_enemy(self, attacker_id: int, target_id: int) -> bool:
        """Check if target is enemy of attacker."""
        attacker = self.entity_manager.get_entity(attacker_id)
        target = self.entity_manager.get_entity(target_id)

        if not attacker or not target:
            return False

        attacker_faction = attacker.get_component(Faction)
        target_faction = target.get_component(Faction)

        if not attacker_faction or not target_faction:
            return False

        return attacker_faction.is_enemy_of(target_faction)
