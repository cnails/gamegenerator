"""Enemy entities and AI with behavior trees."""

import json
import math
import os
import random
from typing import Dict, Optional

import pygame

from game.ecs.components import (
    AI,
    AIState,
    Collider,
    Damage,
    Enemy,
    Faction,
    FactionType,
    Health,
    Render,
    StatusEffects,
    Transform,
)
from game.ecs.entities import Entity, EntityManager
from game.gameplay.ai_states import EnemyStateMachine, SlimeStateMachine, load_enemy_configs


# Cache enemy configs
_enemy_configs: Optional[Dict] = None


def get_enemy_configs() -> Dict:
    """Get enemy configurations (cached)."""
    global _enemy_configs
    if _enemy_configs is None:
        _enemy_configs = load_enemy_configs()
    return _enemy_configs


def create_enemy(
    entity_manager: EntityManager,
    x: float,
    y: float,
    enemy_type: str = "goblin",
) -> Entity:
    """Create enemy entity with proper components."""
    configs = get_enemy_configs()
    config = configs.get(enemy_type, configs["goblin"])

    enemy = entity_manager.create_entity()

    # Create sprite based on type
    sprite_surface = pygame.Surface((32, 32), pygame.SRCALPHA)
    if enemy_type == "goblin":
        sprite_surface.fill((100, 150, 50))  # Green
        pygame.draw.circle(sprite_surface, (80, 120, 40), (16, 16), 12)
    elif enemy_type == "slime" or enemy_type == "slime_small":
        size = 24 if enemy_type == "slime_small" else 32
        sprite_surface = pygame.Surface((size, size), pygame.SRCALPHA)
        sprite_surface.fill((0, 255, 0, 180))  # Transparent green
        pygame.draw.ellipse(sprite_surface, (0, 200, 0), (0, 0, size, size))
    elif enemy_type == "goblin_chief":
        sprite_surface.fill((150, 100, 50))  # Brown
        pygame.draw.circle(sprite_surface, (120, 80, 40), (16, 16), 14)
        pygame.draw.circle(sprite_surface, (200, 150, 100), (16, 16), 8)  # Crown
    else:
        sprite_surface.fill((255, 0, 0))  # Red fallback

    # Add components
    transform = Transform(x=x, y=y, dx=0, dy=0)
    enemy.add_component(transform)

    render = Render(sprite_id=f"enemy_{enemy_type}", z=3)
    enemy.add_component(render)

    health = Health(max_hp=config.health, hp=config.health)
    enemy.add_component(health)

    damage = Damage(base=config.damage, crit_chance=0.0)
    enemy.add_component(damage)

    collider_size = 28 if enemy_type != "slime_small" else 20
    collider = Collider(width=collider_size, height=collider_size, solid=False)
    enemy.add_component(collider)

    faction = Faction(tag=FactionType.ENEMY if enemy_type != "goblin_chief" else FactionType.BOSS)
    enemy.add_component(faction)

    ai = AI(
        agro_radius=config.agro_radius,
        attack_range=config.attack_range,
        behavior="aggressive",
    )
    enemy.add_component(ai)

    enemy_comp = Enemy(enemy_type=enemy_type)
    enemy.add_component(enemy_comp)

    # Add status effects component for dodge/invulnerability
    status_effects = StatusEffects()
    enemy.add_component(status_effects)

    return enemy


class EnemyAI:
    """Enhanced enemy AI with behavior trees."""

    def __init__(self, entity_manager: EntityManager, pathfinder=None, puddle_system=None) -> None:
        """Initialize enemy AI."""
        self.entity_manager = entity_manager
        self.pathfinder = pathfinder
        self.puddle_system = puddle_system
        self.state_machines: Dict[int, EnemyStateMachine] = {}
        self.configs = get_enemy_configs()

    def update(self, dt: float, player_id: Optional[int] = None) -> None:
        """Update enemy AI."""
        if player_id is None:
            return

        player = self.entity_manager.get_entity(player_id)
        if not player:
            return

        player_transform = player.get_component(Transform)
        if not player_transform:
            return

        # Get all enemies
        from game.ecs.components import Faction, FactionType

        enemies = self.entity_manager.get_entities_with(Enemy, Transform, AI, Faction)
        for enemy in enemies:
            enemy_id = enemy.id
            enemy_transform = enemy.get_component(Transform)
            enemy_ai = enemy.get_component(AI)
            enemy_faction = enemy.get_component(Faction)
            enemy_comp = enemy.get_component(Enemy)

            if not enemy_transform or not enemy_ai or not enemy_faction or not enemy_comp:
                continue

            # Skip boss (handled separately)
            if enemy_faction.tag == FactionType.BOSS:
                continue

            # Get or create state machine
            if enemy_id not in self.state_machines:
                enemy_type = enemy_comp.enemy_type
                config = self.configs.get(enemy_type, self.configs["goblin"])

                if enemy_type == "slime" or enemy_type == "slime_small":
                    state_machine = SlimeStateMachine(enemy, config, self.pathfinder)
                else:
                    state_machine = EnemyStateMachine(enemy, config, self.pathfinder)

                self.state_machines[enemy_id] = state_machine

            # Update state machine
            state_machine = self.state_machines[enemy_id]
            state_machine.update(dt, player_transform)

            # Handle contact damage for slimes
            if enemy_comp.enemy_type in ["slime", "slime_small"]:
                config = self.configs.get(enemy_comp.enemy_type, self.configs["slime"])
                if config.contact_damage:
                    dx = player_transform.x - enemy_transform.x
                    dy = player_transform.y - enemy_transform.y
                    dist = math.sqrt(dx * dx + dy * dy)

                    if dist <= config.attack_range:
                        if state_machine.contact_damage_timer <= 0:
                            # Apply contact damage
                            from game.ecs.systems import CombatSystem

                            combat_system = CombatSystem(self.entity_manager)
                            combat_system.apply_damage(player_id, config.damage, enemy_id)

                            # Create puddle
                            if self.puddle_system:
                                self.puddle_system.add_puddle(
                                    enemy_transform.x,
                                    enemy_transform.y,
                                    30.0,
                                    config.slime_puddle_duration,
                                    config.slime_puddle_slow,
                                )

                            state_machine.contact_damage_timer = config.contact_damage_cooldown

        # Clean up state machines for removed entities
        for enemy_id in list(self.state_machines.keys()):
            if not self.entity_manager.get_entity(enemy_id):
                del self.state_machines[enemy_id]
