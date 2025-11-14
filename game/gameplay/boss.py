"""Boss system with arena, gates, music, and phases."""

import math
import random
from dataclasses import dataclass
from typing import List, Optional, Tuple

import pygame

from game.ecs.components import AI, Faction, FactionType, Health, Transform
from game.ecs.entities import Entity, EntityManager
from game.gameplay.ai_states import EnemyConfig, load_enemy_configs
from game.gameplay.telegraphs import TelegraphSystem


@dataclass
class ArenaGate:
    """Arena gate that closes during boss fight."""

    x: float
    y: float
    width: float
    height: float
    is_closed: bool = False
    close_progress: float = 0.0  # 0.0 to 1.0
    close_duration: float = 1.0

    def update(self, dt: float) -> None:
        """Update gate closing animation."""
        if self.is_closed and self.close_progress < 1.0:
            self.close_progress = min(1.0, self.close_progress + dt / self.close_duration)

    def close(self) -> None:
        """Start closing gate."""
        self.is_closed = True

    def is_fully_closed(self) -> bool:
        """Check if gate is fully closed."""
        return self.is_closed and self.close_progress >= 1.0


class BossArena:
    """Boss arena with gates and boundaries."""

    def __init__(self, center_x: float, center_y: float, width: float, height: float) -> None:
        """Initialize arena."""
        self.center_x = center_x
        self.center_y = center_y
        self.width = width
        self.height = height
        self.gates: List[ArenaGate] = []
        self.is_active = False

        # Create gates at edges
        gate_width = 80.0
        gate_height = 40.0

        # Top gate
        self.gates.append(ArenaGate(center_x - gate_width / 2, center_y - height / 2, gate_width, gate_height))
        # Bottom gate
        self.gates.append(ArenaGate(center_x - gate_width / 2, center_y + height / 2 - gate_height, gate_width, gate_height))
        # Left gate
        self.gates.append(ArenaGate(center_x - width / 2, center_y - gate_height / 2, gate_height, gate_width))
        # Right gate
        self.gates.append(ArenaGate(center_x + width / 2 - gate_height, center_y - gate_height / 2, gate_height, gate_width))

    def close_gates(self) -> None:
        """Close all gates."""
        for gate in self.gates:
            gate.close()
        self.is_active = True

    def open_gates(self) -> None:
        """Open all gates."""
        for gate in self.gates:
            gate.is_closed = False
            gate.close_progress = 0.0
        self.is_active = False

    def update(self, dt: float) -> None:
        """Update gates."""
        for gate in self.gates:
            gate.update(dt)

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0) -> None:
        """Render gates."""
        for gate in self.gates:
            if gate.is_closed:
                gate_x = int(gate.x - camera_x)
                gate_y = int(gate.y - camera_y)

                # Draw gate with closing animation
                height = int(gate.height * gate.close_progress)
                pygame.draw.rect(screen, (100, 50, 0), (gate_x, gate_y, int(gate.width), height))


class BossSystem:
    """Manages boss fight with phases, arena, and special mechanics."""

    def __init__(
        self,
        entity_manager: EntityManager,
        telegraph_system: TelegraphSystem,
        effects_system,
        puddle_system,
    ) -> None:
        """Initialize boss system."""
        self.entity_manager = entity_manager
        self.telegraph_system = telegraph_system
        self.effects_system = effects_system
        self.puddle_system = puddle_system
        self.configs = load_enemy_configs()
        self.boss_config = self.configs.get("goblin_chief", None)
        self.arena: Optional[BossArena] = None
        self.boss_id: Optional[int] = None
        self.intro_timer: float = 0.0
        self.intro_duration: float = 2.0
        self.is_intro_active = False
        self.boss_music_playing = False

    def start_boss_fight(self, boss_id: int, arena_center_x: float, arena_center_y: float) -> None:
        """Start boss fight with intro."""
        self.boss_id = boss_id
        boss = self.entity_manager.get_entity(boss_id)

        if not boss or not self.boss_config:
            return

        # Create arena
        arena_config = self.boss_config.attacks.get("arena", {}) if self.boss_config.attacks else {}
        arena_width = arena_config.get("width", 800)
        arena_height = arena_config.get("height", 600)

        self.arena = BossArena(arena_center_x, arena_center_y, arena_width, arena_height)
        self.arena.close_gates()

        # Start intro
        self.is_intro_active = True
        self.intro_timer = 0.0
        intro_config = self.boss_config.attacks.get("intro", {}) if self.boss_config.attacks else {}
        self.intro_duration = intro_config.get("duration", 2.0)

        # TODO: Play boss music
        # pygame.mixer.music.load("data/sfx/boss_music.ogg")
        # pygame.mixer.music.play(-1)
        self.boss_music_playing = True

    def update(self, dt: float, player_id: Optional[int] = None) -> None:
        """Update boss system."""
        if not self.boss_id:
            return

        boss = self.entity_manager.get_entity(self.boss_id)
        if not boss:
            self.boss_id = None
            if self.arena:
                self.arena.open_gates()
            return

        # Update intro
        if self.is_intro_active:
            self.intro_timer += dt
            if self.intro_timer >= self.intro_duration:
                self.is_intro_active = False

        # Update arena
        if self.arena:
            self.arena.update(dt)

        # Update boss AI
        boss_transform = boss.get_component(Transform)
        boss_ai = boss.get_component(AI)
        boss_health = boss.get_component(Health)
        boss_faction = boss.get_component(Faction)

        if not boss_transform or not boss_ai or not boss_health or not boss_faction:
            return

        # Check phase
        phase_2 = boss_health.hp <= boss_health.max_hp * self.boss_config.phase_2_threshold

        # Update attack cooldowns
        attacks = self.boss_config.attacks if self.boss_config.attacks else {}
        dash_config = attacks.get("dash", {})
        slam_config = attacks.get("slam", {})
        summon_config = attacks.get("summon", {})

        # Handle telegraphs
        if boss_ai.telegraph_duration > 0:
            boss_ai.telegraph_duration -= dt
            if boss_ai.telegraph_duration <= 0:
                # Execute attack
                self._execute_boss_attack(boss, boss_ai, boss_transform, player_id, boss_ai.telegraph_type)
                boss_ai.telegraph_type = None
                boss_ai.state_timer = 0.0
            return

        # Choose next attack
        if boss_ai.state_timer >= dash_config.get("cooldown", 4.0):
            self._start_boss_telegraph(boss, boss_ai, boss_transform, player_id, "dash")
        elif phase_2 and boss_ai.state_timer >= slam_config.get("cooldown", 3.0):
            self._start_boss_telegraph(boss, boss_ai, boss_transform, player_id, "slam")
        elif phase_2 and boss_ai.state_timer >= summon_config.get("cooldown", 10.0):
            self._start_boss_telegraph(boss, boss_ai, boss_transform, player_id, "summon")

    def _start_boss_telegraph(
        self, boss: Entity, ai: AI, transform: Transform, player_id: Optional[int], attack_type: str
    ) -> None:
        """Start boss telegraph."""
        player = self.entity_manager.get_entity(player_id) if player_id else None
        if not player:
            return

        player_transform = player.get_component(Transform)
        if not player_transform:
            return

        attacks = self.boss_config.attacks if self.boss_config.attacks else {}
        attack_config = attacks.get(attack_type, {})

        telegraph_duration = attack_config.get("telegraph_duration", 0.5)

        if attack_type == "dash":
            self.telegraph_system.add_dash_telegraph(
                (transform.x, transform.y), (player_transform.x, player_transform.y), telegraph_duration
            )
        elif attack_type == "slam":
            dx = player_transform.x - transform.x
            dy = player_transform.y - transform.y
            length = math.sqrt(dx * dx + dy * dy)
            if length > 0:
                direction = (dx / length, dy / length)
                self.telegraph_system.add_slam_telegraph((transform.x, transform.y), direction, telegraph_duration)
        elif attack_type == "summon":
            self.telegraph_system.add_summon_telegraph((transform.x, transform.y), telegraph_duration)

        ai.telegraph_type = attack_type
        ai.telegraph_duration = telegraph_duration

    def _execute_boss_attack(
        self, boss: Entity, ai: AI, transform: Transform, player_id: Optional[int], attack_type: str
    ) -> None:
        """Execute boss attack."""
        attacks = self.boss_config.attacks if self.boss_config.attacks else {}
        attack_config = attacks.get(attack_type, {})

        if attack_type == "dash":
            # Dash towards player
            player = self.entity_manager.get_entity(player_id) if player_id else None
            if player:
                player_transform = player.get_component(Transform)
                if player_transform:
                    dash_speed = attack_config.get("dash_speed", 400.0)
                    dx = player_transform.x - transform.x
                    dy = player_transform.y - transform.y
                    length = math.sqrt(dx * dx + dy * dy)
                    if length > 0:
                        transform.dx = (dx / length) * dash_speed / 60.0
                        transform.dy = (dy / length) * dash_speed / 60.0

        elif attack_type == "slam":
            # Slam attack
            boss_health = boss.get_component(Health)
            phase_2 = boss_health and boss_health.hp <= boss_health.max_hp * self.boss_config.phase_2_threshold

            damage = attack_config.get("damage", 20)
            if phase_2:
                damage = int(damage * attack_config.get("phase_2_damage_multiplier", 1.5))

            range_val = attack_config.get("range", 150.0)
            if phase_2:
                range_val *= attack_config.get("phase_2_range_multiplier", 1.2)

            # Apply damage to player in range
            if player_id:
                player = self.entity_manager.get_entity(player_id)
                if player:
                    player_transform = player.get_component(Transform)
                    if player_transform:
                        dx = player_transform.x - transform.x
                        dy = player_transform.y - transform.y
                        dist = math.sqrt(dx * dx + dy * dy)
                        if dist <= range_val:
                            from game.ecs.systems import CombatSystem

                            combat_system = CombatSystem(self.entity_manager)
                            combat_system.apply_damage(player_id, damage, boss.id)

        elif attack_type == "summon":
            # Summon enemies
            waves = attack_config.get("waves", 2)
            enemies_per_wave = attack_config.get("enemies_per_wave", 3)
            enemy_type = attack_config.get("enemy_type", "goblin")
            spawn_radius = attack_config.get("spawn_radius", 100.0)

            from game.gameplay.enemies import create_enemy

            for wave in range(waves):
                for _ in range(enemies_per_wave):
                    angle = random.uniform(0, 2 * math.pi)
                    spawn_x = transform.x + math.cos(angle) * spawn_radius
                    spawn_y = transform.y + math.sin(angle) * spawn_radius
                    create_enemy(self.entity_manager, spawn_x, spawn_y, enemy_type)

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0) -> None:
        """Render boss arena."""
        if self.arena:
            self.arena.render(screen, camera_x, camera_y)

    def on_boss_death(self) -> None:
        """Handle boss death."""
        if self.arena:
            self.arena.open_gates()
        self.boss_id = None
        # TODO: Stop boss music
        self.boss_music_playing = False

