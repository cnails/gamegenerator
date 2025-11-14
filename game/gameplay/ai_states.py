"""AI state machine and behavior trees for enemies."""

import json
import math
import os
import random
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from game.ecs.components import (
    AI,
    AIState,
    Faction,
    FactionType,
    Health,
    StatusEffect,
    StatusEffectType,
    StatusEffects,
    Transform,
)
from game.ecs.entities import Entity, EntityManager
from game.gameplay.pathfinding import Pathfinder


class EnemyType(str, Enum):
    """Enemy types."""

    GOBLIN = "goblin"
    SLIME = "slime"
    SLIME_SMALL = "slime_small"
    GOBLIN_CHIEF = "goblin_chief"


@dataclass
class EnemyConfig:
    """Enemy configuration loaded from JSON."""

    name: str
    health: int
    damage: int
    speed: float
    agro_radius: float
    attack_range: float
    attack_delay: float = 1.0  # Default attack delay
    dodge_chance: float = 0.0
    dodge_duration: float = 0.0
    pathfinding_update_interval: float = 0.5
    contact_damage: bool = False
    contact_damage_cooldown: float = 1.0
    slime_puddle_duration: float = 0.0
    slime_puddle_slow: float = 0.0
    split_chance: float = 0.0
    split_count: int = 2
    split_size_multiplier: float = 0.7
    states: Dict[str, Any] = None
    attacks: Dict[str, Any] = None
    phase_2_threshold: float = 0.0
    phase_2_speed_multiplier: float = 1.0
    arena: Dict[str, Any] = None
    intro: Dict[str, Any] = None

    def __post_init__(self) -> None:
        """Initialize defaults."""
        if self.states is None:
            self.states = {}
        if self.attacks is None:
            self.attacks = {}
        if self.arena is None:
            self.arena = {}
        if self.intro is None:
            self.intro = {}


class EnemyStateMachine:
    """State machine for enemy AI."""

    def __init__(self, entity: Entity, config: EnemyConfig, pathfinder: Pathfinder) -> None:
        """Initialize state machine."""
        self.entity = entity
        self.config = config
        self.pathfinder = pathfinder
        self.ai = entity.get_component(AI)
        self.transform = entity.get_component(Transform)
        self.current_path: List[Tuple[float, float]] = []
        self.path_index = 0
        self.path_update_timer = 0.0
        self.attack_cooldown = 0.0
        self.dodge_timer = 0.0
        self.contact_damage_timer = 0.0

    def update(self, dt: float, player_transform: Optional[Transform]) -> None:
        """Update state machine."""
        if not self.ai or not self.transform:
            return

        # Update timers
        self.attack_cooldown = max(0.0, self.attack_cooldown - dt)
        self.dodge_timer = max(0.0, self.dodge_timer - dt)
        self.contact_damage_timer = max(0.0, self.contact_damage_timer - dt)
        self.path_update_timer += dt

        if not player_transform:
            self.ai.set_state(AIState.IDLE)
            self.transform.dx = 0
            self.transform.dy = 0
            return

        # Calculate distance to player
        dx = player_transform.x - self.transform.x
        dy = player_transform.y - self.transform.y
        distance = math.sqrt(dx * dx + dy * dy)

        # State transitions
        if distance <= self.config.agro_radius:
            if distance <= self.config.attack_range and self.attack_cooldown <= 0:
                self.ai.set_state(AIState.ATTACK)
            else:
                self.ai.set_state(AIState.CHASE)
        else:
            self.ai.set_state(AIState.PATROL)

        # Execute current state
        if self.ai.state == AIState.PATROL:
            self._update_patrol(dt, player_transform)
        elif self.ai.state == AIState.CHASE:
            self._update_chase(dt, player_transform)
        elif self.ai.state == AIState.ATTACK:
            self._update_attack(dt, player_transform)

    def _update_patrol(self, dt: float, player_transform: Transform) -> None:
        """Update patrol state."""
        # Simple random movement or stay still
        patrol_config = self.config.states.get("patrol", {})
        speed_mult = patrol_config.get("speed_multiplier", 0.5)
        self.transform.dx = 0
        self.transform.dy = 0

    def _update_chase(self, dt: float, player_transform: Transform) -> None:
        """Update chase state with pathfinding."""
        chase_config = self.config.states.get("chase", {})
        speed_mult = chase_config.get("speed_multiplier", 1.0)

        # Update path periodically
        if self.path_update_timer >= self.config.pathfinding_update_interval:
            self.current_path = self.pathfinder.find_path(
                self.transform.x, self.transform.y, player_transform.x, player_transform.y
            )
            self.path_index = 0
            self.path_update_timer = 0.0

        # Follow path
        if self.current_path and self.path_index < len(self.current_path):
            target_x, target_y = self.current_path[self.path_index]

            dx = target_x - self.transform.x
            dy = target_y - self.transform.y
            dist = math.sqrt(dx * dx + dy * dy)

            if dist < 10.0:  # Reached waypoint
                self.path_index += 1
            else:
                speed = self.config.speed * speed_mult
                if dist > 0:
                    self.transform.dx = (dx / dist) * speed / 60.0
                    self.transform.dy = (dy / dist) * speed / 60.0
        else:
            # Direct movement if no path
            dx = player_transform.x - self.transform.x
            dy = player_transform.y - self.transform.y
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > 0:
                speed = self.config.speed * speed_mult
                self.transform.dx = (dx / dist) * speed / 60.0
                self.transform.dy = (dy / dist) * speed / 60.0

    def _update_attack(self, dt: float, player_transform: Transform) -> None:
        """Update attack state."""
        attack_config = self.config.states.get("attack", {})

        # Stop movement
        self.transform.dx = 0
        self.transform.dy = 0

        # Perform attack (dash or melee)
        if self.attack_cooldown <= 0:
            dash_speed = attack_config.get("dash_speed", 200.0)
            dash_duration = attack_config.get("dash_duration", 0.3)

            # Dash towards player
            dx = player_transform.x - self.transform.x
            dy = player_transform.y - self.transform.y
            dist = math.sqrt(dx * dx + dy * dy)

            if dist > 0:
                self.transform.dx = (dx / dist) * dash_speed / 60.0
                self.transform.dy = (dy / dist) * dash_speed / 60.0

            self.attack_cooldown = attack_config.get("attack_cooldown", 1.5)

            # Apply dodge if available
            if random.random() < self.config.dodge_chance:
                self.dodge_timer = self.config.dodge_duration
                status_effects = self.entity.get_component(StatusEffects)
                if status_effects:
                    from game.ecs.components import StatusEffect, StatusEffectType

                    status_effects.add_effect(
                        StatusEffect(StatusEffectType.INVULNERABLE, self.config.dodge_duration)
                    )


class SlimeStateMachine(EnemyStateMachine):
    """Specialized state machine for slimes."""

    def _update_chase(self, dt: float, player_transform: Transform) -> None:
        """Slime chase - slower movement."""
        dx = player_transform.x - self.transform.x
        dy = player_transform.y - self.transform.y
        dist = math.sqrt(dx * dx + dy * dy)

        if dist > 0:
            speed = self.config.speed
            self.transform.dx = (dx / dist) * speed / 60.0
            self.transform.dy = (dy / dist) * speed / 60.0

    def on_death(self, entity_manager: EntityManager) -> None:
        """Handle slime split on death."""
        if random.random() < self.config.split_chance:
            for _ in range(self.config.split_count):
                # Create smaller slime
                from game.gameplay.enemies import create_enemy

                small_slime = create_enemy(
                    entity_manager,
                    self.transform.x + random.uniform(-20, 20),
                    self.transform.y + random.uniform(-20, 20),
                    "slime_small",
                )


def load_enemy_configs() -> Dict[str, EnemyConfig]:
    """Load enemy configurations from JSON."""
    # Get absolute path to data directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(current_dir))
    config_path = os.path.join(project_root, "data", "balance", "enemies.json")

    with open(config_path, "r") as f:
        data = json.load(f)

    configs = {}
    for enemy_type, enemy_data in data.items():
        configs[enemy_type] = EnemyConfig(**enemy_data)

    return configs

