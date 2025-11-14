"""ECS Systems."""

import json
import math
import random
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List

import pygame

from game.core.events import (
    EVENT_DAMAGE_TAKEN,
    EVENT_ENEMY_KILLED,
    EVENT_HEALED,
    EVENT_LEVEL_UP,
    EVENT_PLAYER_DIED,
    EVENT_XP_GAINED,
    event_bus,
    GameEvent,
)
from game.ecs.components import (
    AI,
    AIState,
    Collider,
    Damage,
    Experience,
    Faction,
    FactionType,
    Health,
    Inventory,
    Projectile,
    Render,
    SkillTree,
    StatusEffect,
    StatusEffectType,
    StatusEffects,
    Transform,
    Weapon,
    WeaponType,
)

if TYPE_CHECKING:
    from game.ecs.entities import Entity, EntityManager


class InputSystem:
    """Handles player input."""

    def __init__(self, entity_manager: "EntityManager", keybindings: Any) -> None:
        """Initialize input system."""
        self.entity_manager = entity_manager
        self.keybindings = keybindings
        self.keys_pressed: Dict[int, bool] = {}

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle pygame event."""
        if event.type == pygame.KEYDOWN:
            self.keys_pressed[event.key] = True
        elif event.type == pygame.KEYUP:
            self.keys_pressed[event.key] = False

    def update(self, current_time: float) -> None:
        """Update input and apply to player."""
        players = self.entity_manager.get_entities_with(Faction, Transform, Weapon)
        if not players:
            return

        player = players[0]
        transform = player.get_component(Transform)
        weapon = player.get_component(Weapon)

        if not transform or not weapon:
            return

        # Movement
        dx, dy = 0.0, 0.0
        if self.keys_pressed.get(self.keybindings.move_up) or self.keys_pressed.get(
            self.keybindings.move_up_alt
        ):
            dy = -1.0
        if self.keys_pressed.get(self.keybindings.move_down) or self.keys_pressed.get(
            self.keybindings.move_down_alt
        ):
            dy = 1.0
        if self.keys_pressed.get(self.keybindings.move_left) or self.keys_pressed.get(
            self.keybindings.move_left_alt
        ):
            dx = -1.0
        if self.keys_pressed.get(self.keybindings.move_right) or self.keys_pressed.get(
            self.keybindings.move_right_alt
        ):
            dx = 1.0

        # Normalize diagonal movement
        if dx != 0 and dy != 0:
            dx *= 0.707  # 1/sqrt(2)
            dy *= 0.707

        # Apply movement speed (from status effects or base)
        speed = 140.0  # Base speed in pixels/sec
        status_effects = player.get_component(StatusEffects)
        if status_effects:
            slow_effect = status_effects.get_effect(StatusEffectType.SLOW)
            if slow_effect:
                speed *= 1.0 - slow_effect.value

            speed_boost = status_effects.get_effect(StatusEffectType.SPEED_BOOST)
            if speed_boost:
                speed *= 1.0 + speed_boost.value

        transform.dx = dx * speed / 60.0  # Convert to per-frame
        transform.dy = dy * speed / 60.0

        # Attack
        if (
            self.keys_pressed.get(self.keybindings.attack)
            and weapon.can_attack(current_time)
        ):
            # Attack will be handled by CombatSystem
            weapon.last_attack_time = current_time


class MovementSystem:
    """Handles entity movement with dt integration."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize movement system."""
        self.entity_manager = entity_manager

    def update(self, dt: float) -> None:
        """Update movement with delta time."""
        entities = self.entity_manager.get_entities_with(Transform)
        for entity in entities:
            transform = entity.get_component(Transform)
            if not transform:
                continue

            # Apply velocity
            transform.x += transform.dx * dt * 60.0
            transform.y += transform.dy * dt * 60.0

            # Apply status effects
            status_effects = entity.get_component(StatusEffects)
            if status_effects:
                status_effects.update(dt)


class RenderSystem:
    """Handles entity rendering."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize render system."""
        self.entity_manager = entity_manager

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0) -> None:
        """Render all entities with Render component."""
        entities = self.entity_manager.get_entities_with(Render, Transform)
        
        # Sort by z-order
        entities_with_z = []
        for entity in entities:
            render_comp = entity.get_component(Render)
            transform = entity.get_component(Transform)
            if render_comp and transform:
                entities_with_z.append((render_comp.z, entity))
        
        entities_with_z.sort(key=lambda x: x[0])
        
        # Render entities
        for z, entity in entities_with_z:
            render_comp = entity.get_component(Render)
            transform = entity.get_component(Transform)
            if not render_comp or not transform:
                continue
            
            surface = render_comp.get_surface()
            x = int(transform.x - camera_x)
            y = int(transform.y - camera_y)
            screen.blit(surface, (x, y))


class CollisionSystem:
    """Handles collision detection."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize collision system."""
        self.entity_manager = entity_manager

    def update(self, dt: float) -> None:
        """Update collision detection."""
        # Collision detection can be implemented here if needed
        # For now, collisions are handled in GameplayScene
        pass


class CombatSystem:
    """Handles combat: attacks, hits, damage, crits."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize combat system."""
        self.entity_manager = entity_manager

    def perform_attack(
        self, attacker_id: int, target_pos: tuple[float, float], current_time: float
    ) -> List[int]:
        """Perform attack from attacker. Returns list of hit entity IDs."""
        attacker = self.entity_manager.get_entity(attacker_id)
        if not attacker:
            return []

        weapon = attacker.get_component(Weapon)
        damage_comp = attacker.get_component(Damage)
        attacker_faction = attacker.get_component(Faction)
        attacker_transform = attacker.get_component(Transform)

        if not weapon or not damage_comp or not attacker_faction or not attacker_transform:
            return []

        if not weapon.can_attack(current_time):
            return []

        weapon.last_attack_time = current_time

        # Find targets in range
        hit_entities = []
        range_sq = weapon.get_effective_range() ** 2

        for entity_id, entity in self.entity_manager.entities.items():
            if entity_id == attacker_id:
                continue

            target_faction = entity.get_component(Faction)
            target_transform = entity.get_component(Transform)
            target_health = entity.get_component(Health)

            if (
                not target_faction
                or not target_transform
                or not target_health
                or not attacker_faction.is_enemy_of(target_faction)
            ):
                continue

            # Check range
            dx = target_transform.x - target_pos[0]
            dy = target_transform.y - target_pos[1]
            dist_sq = dx * dx + dy * dy

            if dist_sq <= range_sq:
                # Calculate damage
                damage, is_crit = damage_comp.calculate_damage()
                actual_damage = self.apply_damage(entity_id, damage, attacker_id, is_crit)

                if actual_damage > 0:
                    hit_entities.append(entity_id)

                # Check penetration
                if weapon.penetration > 0 and len(hit_entities) >= weapon.penetration + 1:
                    break

        return hit_entities

    def apply_damage(
        self, target_id: int, damage: int, attacker_id: int, is_crit: bool = False
    ) -> int:
        """Apply damage to target. Returns actual damage dealt."""
        target = self.entity_manager.get_entity(target_id)
        if not target:
            return 0

        health = target.get_component(Health)
        if not health:
            return 0

        # Check for dodge (for enemies)
        faction = target.get_component(Faction)
        if faction and faction.tag == FactionType.ENEMY:
            # 10% dodge chance for goblins (placeholder)
            if random.random() < 0.1:
                return 0  # Dodged!

        actual_damage = health.take_damage(damage)

        if actual_damage > 0:
            event_bus.emit(
                GameEvent(
                    EVENT_DAMAGE_TAKEN,
                    {
                        "entity_id": target_id,
                        "damage": actual_damage,
                        "attacker_id": attacker_id,
                        "is_crit": is_crit,
                    },
                )
            )

            # Check for death
            if not health.is_alive():
                # Note: enemy_ai and puddle_system should be passed from GameplayScene
                # For now, pass None - will be handled in GameplayScene via events
                self.handle_death(target_id, attacker_id, None, None)

        return actual_damage

    def handle_death(self, entity_id: int, killer_id: int, puddle_system=None, enemy_ai=None) -> None:
        """Handle entity death."""
        entity = self.entity_manager.get_entity(entity_id)
        killer = self.entity_manager.get_entity(killer_id)

        if not entity or not killer:
            return

        faction = entity.get_component(Faction)
        killer_faction = killer.get_component(Faction)

        if faction and killer_faction:
            if faction.tag == FactionType.PLAYER:
                event_bus.emit(GameEvent(EVENT_PLAYER_DIED, {"entity_id": entity_id}))
            elif faction.tag in (FactionType.ENEMY, FactionType.BOSS):
                # Handle slime split before removing entity
                from game.ecs.components import Enemy
                enemy_comp = entity.get_component(Enemy)
                if enemy_comp and enemy_comp.enemy_type in ["slime", "slime_small"]:
                    transform = entity.get_component(Transform)
                    if transform and enemy_ai:
                        # Get state machine and trigger split
                        if hasattr(enemy_ai, "state_machines") and entity_id in enemy_ai.state_machines:
                            state_machine = enemy_ai.state_machines[entity_id]
                            if hasattr(state_machine, "on_death"):
                                state_machine.on_death(self.entity_manager)

                # Grant XP (formula: base_xp * (1 + enemy_level * 0.1))
                exp = entity.get_component(Experience)
                if exp:
                    base_xp = 10
                    enemy_level = exp.level
                    xp_amount = int(base_xp * (1 + enemy_level * 0.1))
                    
                    # Boss gives more XP
                    enemy_faction = entity.get_component(Faction)
                    if enemy_faction and enemy_faction.tag == FactionType.BOSS:
                        xp_amount = int(xp_amount * 3)
                    
                    killer_exp = killer.get_component(Experience)
                    if killer_exp:
                        leveled_up = killer_exp.add_xp(xp_amount)
                        if leveled_up:
                            event_bus.emit(
                                GameEvent(
                                    EVENT_LEVEL_UP,
                                    {"entity_id": killer_id, "level": killer_exp.level},
                                )
                            )

                event_bus.emit(
                    GameEvent(
                        EVENT_ENEMY_KILLED,
                        {"entity_id": entity_id, "killer_id": killer_id},
                    )
                )

                # Remove entity after handling
                self.entity_manager.remove_entity(entity_id)


class ProjectileSystem:
    """Handles projectile movement and collisions."""

    def __init__(self, entity_manager: "EntityManager", effects_system=None) -> None:
        """Initialize projectile system."""
        self.entity_manager = entity_manager
        self.effects_system = effects_system

    def create_projectile(
        self,
        x: float,
        y: float,
        target_x: float,
        target_y: float,
        speed: float,
        damage: int,
        owner_id: int,
        hitbox_type: str = "capsule",
        hitbox_width: float = 8.0,
        hitbox_height: float = 8.0,
    ) -> int:
        """Create a projectile with precise hitbox. Returns entity ID."""
        projectile = self.entity_manager.create_entity()

        # Calculate direction
        dx = target_x - x
        dy = target_y - y
        dist = math.sqrt(dx * dx + dy * dy)
        if dist > 0:
            dx /= dist
            dy /= dist

        transform = Transform(x=x, y=y, dx=dx * speed / 60.0, dy=dy * speed / 60.0)
        projectile.add_component(transform)

        # Store projectile data with hitbox info
        projectile_comp = Projectile(
            damage=damage,
            owner_id=owner_id,
            lifetime=5.0,
            hitbox_type=hitbox_type,
            hitbox_width=hitbox_width,
            hitbox_height=hitbox_height,
        )
        projectile.add_component(projectile_comp)

        # Add render component
        render = Render(sprite_id="projectile", z=5)
        projectile.add_component(render)

        # Add collider based on hitbox type
        if hitbox_type == "capsule":
            collider = Collider(width=int(hitbox_width), height=int(hitbox_height), solid=False)
        elif hitbox_type == "rectangle":
            collider = Collider(width=int(hitbox_width), height=int(hitbox_height), solid=False)
        else:  # ray
            collider = Collider(width=2, height=2, solid=False)
        projectile.add_component(collider)

        return projectile.id

    def update(self, dt: float) -> None:
        """Update projectiles."""
        projectiles = self.entity_manager.get_entities_with(Projectile, Transform)
        combat_system = CombatSystem(self.entity_manager)

        for projectile_entity in projectiles[:]:
            projectile = projectile_entity.get_component(Projectile)
            transform = projectile_entity.get_component(Transform)

            if not projectile or not transform:
                continue

            # Update lifetime
            projectile.lifetime -= dt
            if projectile.lifetime <= 0:
                self.entity_manager.remove_entity(projectile_entity.id)
                continue

            # Check collisions
            collider = projectile_entity.get_component(Collider)
            if collider:
                # Find entities in range
                for entity_id, entity in self.entity_manager.entities.items():
                    if entity_id == projectile_entity.id or entity_id == projectile.owner_id:
                        continue

                    target_faction = entity.get_component(Faction)
                    target_transform = entity.get_component(Transform)
                    target_collider = entity.get_component(Collider)

                    if not target_faction or not target_transform or not target_collider:
                        continue

                    # Check if enemy
                    owner = self.entity_manager.get_entity(projectile.owner_id)
                    owner_faction = owner.get_component(Faction) if owner else None
                    if owner_faction and not owner_faction.is_enemy_of(target_faction):
                        continue

                    # Precise collision check based on hitbox type
                    hit = False
                    from game.gameplay.hitboxes import ProjectileHitbox

                    proj_hitbox = ProjectileHitbox(
                        position=(transform.x, transform.y),
                        direction=(transform.dx, transform.dy),
                        hitbox_type=projectile.hitbox_type,
                        width=projectile.hitbox_width,
                        height=projectile.hitbox_height,
                        speed=0.0,  # Not used for collision
                    )
                    hit = proj_hitbox.check_entity(target_transform, target_collider)

                    if hit:
                        # Hit!
                        damage, is_crit = (projectile.damage, False)  # Projectiles don't crit by default
                        actual_damage = combat_system.apply_damage(entity_id, damage, projectile.owner_id, is_crit)

                        # Add hit effects
                        if self.effects_system and actual_damage > 0:
                            self.effects_system.add_damage_number(
                                target_transform.x, target_transform.y, actual_damage, False
                            )
                            self.effects_system.add_hit_particles(target_transform.x, target_transform.y, (200, 200, 255))

                        # Check penetration
                        if projectile.penetration > 0:
                            projectile.penetration -= 1
                            # Continue to next entity (projectile passes through)
                        else:
                            # Projectile destroyed on hit - add impact particles
                            if self.effects_system:
                                self.effects_system.add_hit_particles(transform.x, transform.y, (150, 150, 255), count=8)
                            self.entity_manager.remove_entity(projectile_entity.id)
                            break


class AISystem:
    """Handles AI: patrol, chase, attack, boss telegraphs."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize AI system."""
        self.entity_manager = entity_manager

    def update(self, dt: float) -> None:
        """Update AI behavior."""
        ai_entities = self.entity_manager.get_entities_with(AI, Transform, Faction)
        players = self.entity_manager.get_entities_with(Faction, Transform)

        player = None
        player_transform = None
        for p in players:
            p_faction = p.get_component(Faction)
            if p_faction and p_faction.tag == FactionType.PLAYER:
                player = p
                player_transform = p.get_component(Transform)
                break

        for entity in ai_entities:
            ai = entity.get_component(AI)
            transform = entity.get_component(Transform)
            faction = entity.get_component(Faction)

            if not ai or not transform or not faction:
                continue

            ai.state_timer += dt

            if faction.tag == FactionType.BOSS:
                self.update_boss_ai(entity, ai, transform, player, player_transform, dt)
            else:
                self.update_enemy_ai(entity, ai, transform, player, player_transform, dt)

    def update_enemy_ai(
        self,
        entity: "Entity",
        ai: AI,
        transform: Transform,
        player: "Entity | None",
        player_transform: Transform | None,
        dt: float,
    ) -> None:
        """Update regular enemy AI."""
        if not player or not player_transform:
            ai.set_state(AIState.IDLE)
            transform.dx = 0
            transform.dy = 0
            return

        # Calculate distance to player
        dx = player_transform.x - transform.x
        dy = player_transform.y - transform.y
        distance = math.sqrt(dx * dx + dy * dy)

        if distance <= ai.agro_radius:
            if distance <= ai.attack_range:
                ai.set_state(AIState.ATTACK)
                # Stop moving
                transform.dx = 0
                transform.dy = 0
            else:
                ai.set_state(AIState.CHASE)
                # Move towards player
                speed = 120.0 / 60.0  # pixels per frame
                if distance > 0:
                    transform.dx = (dx / distance) * speed
                    transform.dy = (dy / distance) * speed
        else:
            ai.set_state(AIState.PATROL)
            # Simple patrol (placeholder)
            transform.dx = 0
            transform.dy = 0

    def update_boss_ai(
        self,
        entity: "Entity",
        ai: AI,
        transform: Transform,
        player: "Entity | None",
        player_transform: Transform | None,
        dt: float,
    ) -> None:
        """Update boss AI with telegraphs."""
        if not player or not player_transform:
            return

        health = entity.get_component(Health)
        phase_2 = health and health.hp <= health.max_hp * 0.4  # 40% HP threshold

        # Handle telegraphs
        if ai.telegraph_duration > 0:
            ai.telegraph_duration -= dt
            if ai.telegraph_duration <= 0:
                # Execute telegraph action
                self.execute_boss_telegraph(entity, ai, transform, player_transform)
            return

        # Choose action based on cooldowns and phase
        if ai.state_timer >= 4.0:  # Dash cooldown
            self.start_boss_telegraph(entity, ai, "dash", 0.5)
        elif phase_2 and ai.state_timer >= 8.0:  # Slam cooldown
            self.start_boss_telegraph(entity, ai, "slam", 1.5)
        elif ai.state_timer >= 10.0:  # Summon cooldown
            self.start_boss_telegraph(entity, ai, "summon", 1.0)

    def start_boss_telegraph(
        self, entity: "Entity", ai: AI, telegraph_type: str, duration: float, telegraph_system=None
    ) -> None:
        """Start boss telegraph."""
        transform = entity.get_component(Transform)
        if transform:
            ai.telegraph_type = telegraph_type
            ai.telegraph_duration = duration
            ai.telegraph_position = (transform.x, transform.y)

            # Add visual telegraph if system provided
            if telegraph_system:
                if telegraph_type == "dash":
                    # Get player position for dash target
                    players = self.entity_manager.get_entities_with(Faction, Transform)
                    player = None
                    for p in players:
                        p_faction = p.get_component(Faction)
                        if p_faction and p_faction.tag == FactionType.PLAYER:
                            player = p
                            break
                    if player:
                        player_transform = player.get_component(Transform)
                        if player_transform:
                            telegraph_system.add_dash_telegraph(
                                (transform.x, transform.y),
                                (player_transform.x, player_transform.y),
                                duration,
                            )
                elif telegraph_type == "slam":
                    # Get direction to player
                    players = self.entity_manager.get_entities_with(Faction, Transform)
                    player = None
                    for p in players:
                        p_faction = p.get_component(Faction)
                        if p_faction and p_faction.tag == FactionType.PLAYER:
                            player = p
                            break
                    if player:
                        player_transform = player.get_component(Transform)
                        if player_transform:
                            dx = player_transform.x - transform.x
                            dy = player_transform.y - transform.y
                            length = math.sqrt(dx * dx + dy * dy)
                            if length > 0:
                                direction = (dx / length, dy / length)
                                telegraph_system.add_slam_telegraph(
                                    (transform.x, transform.y), direction, duration
                                )
                elif telegraph_type == "summon":
                    telegraph_system.add_summon_telegraph((transform.x, transform.y), duration)

    def execute_boss_telegraph(
        self,
        entity: "Entity",
        ai: AI,
        transform: Transform,
        player_transform: Transform,
    ) -> None:
        """Execute boss telegraph action."""
        if ai.telegraph_type == "dash":
            # Dash towards player
            dx = player_transform.x - transform.x
            dy = player_transform.y - transform.y
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > 0:
                speed = 300.0 / 60.0  # Fast dash
                transform.dx = (dx / dist) * speed
                transform.dy = (dy / dist) * speed
        elif ai.telegraph_type == "slam":
            # Ground slam (handled by combat system)
            pass
        elif ai.telegraph_type == "summon":
            # Summon minions (placeholder)
            pass

        ai.state_timer = 0.0
        ai.telegraph_type = None
        ai.telegraph_position = None


class SkillSystem:
    """Handles skill application and effects."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize skill system."""
        self.entity_manager = entity_manager

    def apply_skill(self, entity_id: int, skill_id: str) -> bool:
        """Apply a skill to entity. Returns True if successful."""
        entity = self.entity_manager.get_entity(entity_id)
        if not entity:
            return False

        skill_tree = entity.get_component(SkillTree)
        if not skill_tree or not skill_tree.has_node(skill_id):
            return False

        # Apply skill effects (placeholder)
        # This would modify components based on skill_id
        return True

    def get_available_skills(self, entity_id: int) -> List[str]:
        """Get list of available skills for entity."""
        entity = self.entity_manager.get_entity(entity_id)
        if not entity:
            return []

        skill_tree = entity.get_component(SkillTree)
        if not skill_tree:
            return []

        return skill_tree.unlocked_nodes


class LootSystem:
    """Handles loot dropping and pickup."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize loot system."""
        self.entity_manager = entity_manager
        self.pickup_range = 30.0

    def drop_loot(
        self, x: float, y: float, loot_type: str, value: int = 0
    ) -> int:
        """Drop loot at position. Returns entity ID."""
        loot_entity = self.entity_manager.create_entity()
        transform = Transform(x=x, y=y)
        loot_entity.add_component(transform)

        from game.ecs.components import Loot

        loot_comp = Loot(item_data={"type": loot_type, "value": value}, value=value)
        loot_entity.add_component(loot_comp)

        # Add render
        render = Render(sprite_id="loot", z=1)
        loot_entity.add_component(render)

        return loot_entity.id

    def check_pickup(self, player_id: int) -> None:
        """Check if player can pick up nearby loot."""
        player = self.entity_manager.get_entity(player_id)
        if not player:
            return

        player_transform = player.get_component(Transform)
        player_inventory = player.get_component(Inventory)

        if not player_transform or not player_inventory:
            return

        from game.ecs.components import Loot

        loot_entities = self.entity_manager.get_entities_with(Loot, Transform)
        for loot_entity in loot_entities:
            loot_comp = loot_entity.get_component(Loot)
            loot_transform = loot_entity.get_component(Transform)

            if not loot_comp or not loot_transform:
                continue

            # Check distance
            dx = loot_transform.x - player_transform.x
            dy = loot_transform.y - player_transform.y
            distance = math.sqrt(dx * dx + dy * dy)

            if distance <= self.pickup_range:
                # Pick up
                if loot_comp.item_data.get("type") == "gold":
                    player_inventory.add_gold(loot_comp.value)
                else:
                    player_inventory.add_item(loot_comp.item_data)

                self.entity_manager.remove_entity(loot_entity.id)


class UISystem:
    """Handles UI: HUD, damage numbers, etc."""

    def __init__(self, entity_manager: "EntityManager") -> None:
        """Initialize UI system."""
        self.entity_manager = entity_manager
        self.damage_numbers: List[Dict[str, Any]] = []
        self.font: pygame.font.Font | None = None

    def add_damage_number(
        self, x: float, y: float, damage: int, is_crit: bool = False
    ) -> None:
        """Add floating damage number."""
        self.damage_numbers.append(
            {
                "x": x,
                "y": y,
                "damage": damage,
                "is_crit": is_crit,
                "timer": 1.0,
                "velocity_y": -50.0,
            }
        )

    def update(self, dt: float) -> None:
        """Update UI elements."""
        # Update damage numbers
        for num in self.damage_numbers[:]:
            num["timer"] -= dt
            num["y"] += num["velocity_y"] * dt
            if num["timer"] <= 0:
                self.damage_numbers.remove(num)

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0) -> None:
        """Render UI elements."""
        if self.font is None:
            self.font = pygame.font.Font(None, 24)

        # Render damage numbers
        for num in self.damage_numbers:
            color = (255, 100, 100) if num["is_crit"] else (255, 255, 255)
            size = 32 if num["is_crit"] else 24
            font = pygame.font.Font(None, size)
            text = font.render(str(num["damage"]), True, color)
            alpha = int(255 * num["timer"])
            text.set_alpha(alpha)
            screen.blit(
                text,
                (
                    int(num["x"] - camera_x),
                    int(num["y"] - camera_y),
                ),
            )


class SaveLoadSystem:
    """Handles save/load functionality."""

    def __init__(self, entity_manager: "EntityManager", save_path: Path | str = "save/game.json") -> None:
        """Initialize save/load system."""
        self.entity_manager = entity_manager
        self.save_path = Path(save_path)
        self.save_path.parent.mkdir(parents=True, exist_ok=True)

    def save(self) -> bool:
        """Save game state to JSON."""
        save_data: Dict[str, Any] = {
            "entities": [],
            "next_entity_id": self.entity_manager.next_id,
        }

        for entity_id, entity in self.entity_manager.entities.items():
            entity_data: Dict[str, Any] = {"id": entity_id, "components": {}}

            # Save each component
            for comp_type, comp in entity.components.items():
                comp_name = comp_type.__name__
                if hasattr(comp, "__dict__"):
                    entity_data["components"][comp_name] = self._serialize_component(comp)

            save_data["entities"].append(entity_data)

        try:
            with open(self.save_path, "w", encoding="utf-8") as f:
                json.dump(save_data, f, indent=2)
            return True
        except IOError as e:
            print(f"Failed to save: {e}")
            return False

    def load(self) -> bool:
        """Load game state from JSON."""
        if not self.save_path.exists():
            return False

        try:
            with open(self.save_path, "r", encoding="utf-8") as f:
                save_data = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"Failed to load: {e}")
            return False

        self.entity_manager.clear()
        self.entity_manager.next_id = save_data.get("next_entity_id", 0)

        # Load entities (placeholder - would need proper deserialization)
        # This is a simplified version

        return True

    def _serialize_component(self, comp: Any) -> Dict[str, Any]:
        """Serialize component to dict."""
        result: Dict[str, Any] = {}
        if hasattr(comp, "__dict__"):
            for key, value in comp.__dict__.items():
                if isinstance(value, (int, float, str, bool, list, dict)):
                    result[key] = value
                elif hasattr(value, "__dict__"):
                    result[key] = self._serialize_component(value)
        return result
