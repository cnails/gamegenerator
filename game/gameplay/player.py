"""Player entity and logic with advanced controls."""

import math
import pygame

from game.core.assets import assets
from game.core.timers import Cooldown, TimerManager
from game.ecs.components import (
    Collider,
    Damage,
    Experience,
    Faction,
    FactionType,
    Health,
    Inventory,
    Render,
    SkillTree,
    StatusEffect,
    StatusEffectType,
    StatusEffects,
    Transform,
    Weapon,
    WeaponType,
)


class InputBuffer:
    """Buffer for queuing inputs (for attack buffering)."""

    def __init__(self, buffer_time: float = 0.3) -> None:
        """Initialize input buffer.

        Args:
            buffer_time: How long to keep buffered input (seconds)
        """
        self.buffer_time = buffer_time
        self.buffered_actions: dict[str, float] = {}  # action -> timestamp

    def buffer_action(self, action: str, current_time: float) -> None:
        """Buffer an action."""
        self.buffered_actions[action] = current_time

    def consume_action(self, action: str, current_time: float) -> bool:
        """Check and consume buffered action if valid."""
        if action in self.buffered_actions:
            if current_time - self.buffered_actions[action] <= self.buffer_time:
                del self.buffered_actions[action]
                return True
            else:
                del self.buffered_actions[action]
        return False

    def update(self, current_time: float) -> None:
        """Remove expired buffered actions."""
        expired = [
            action
            for action, timestamp in self.buffered_actions.items()
            if current_time - timestamp > self.buffer_time
        ]
        for action in expired:
            del self.buffered_actions[action]


class PlayerController:
    """Advanced player controller with dodge, weapons, potions."""

    def __init__(self, entity_manager, player_id: int, keybindings) -> None:
        """Initialize player controller."""
        self.entity_manager = entity_manager
        self.player_id = player_id
        self.keybindings = keybindings
        self.input_buffer = InputBuffer(buffer_time=0.3)
        self.timer_manager = TimerManager()

        # Cooldowns
        self.timer_manager.add_cooldown("dodge", 1.2)
        self.timer_manager.add_cooldown("potion", 10.0)

        # Smooth input
        self.move_input_x = 0.0
        self.move_input_y = 0.0
        self.input_smoothing = 0.2  # Lerp factor

        # Dodge state
        self.is_dodging = False
        self.dodge_duration = 0.2
        self.dodge_timer = 0.0
        self.dodge_direction = (0.0, 0.0)
        self.dodge_speed = 300.0  # pixels/sec

    def handle_event(self, event: pygame.event.Event, current_time: float) -> None:
        """Handle input events."""
        if event.type == pygame.KEYDOWN:
            # Weapon switching
            if event.key == pygame.K_q:
                self._switch_weapon(-1)  # Previous
            elif event.key == pygame.K_e:
                self._switch_weapon(1)  # Next

            # Dodge/roll
            elif event.key == pygame.K_LSHIFT or event.key == pygame.K_RSHIFT:
                self._try_dodge(current_time)

            # Potion
            elif event.key == self.keybindings.secondary:  # K key
                self._try_use_potion(current_time)

            # Attack - buffer input
            elif event.key == self.keybindings.attack:
                self.input_buffer.buffer_action("attack", current_time)

    def update(self, dt: float, current_time: float) -> None:
        """Update player controller."""
        self.timer_manager.update(dt)
        self.input_buffer.update(current_time)

        player = self.entity_manager.get_entity(self.player_id)
        if not player:
            return

        transform = player.get_component(Transform)
        weapon = player.get_component(Weapon)
        status_effects = player.get_component(StatusEffects)

        if not transform or not weapon:
            return

        # Handle dodge
        if self.is_dodging:
            self.dodge_timer -= dt
            if self.dodge_timer <= 0:
                self.is_dodging = False
                # Remove invulnerability
                if status_effects:
                    status_effects.remove_effect(StatusEffectType.SPEED_BOOST)
            else:
                # Apply dodge movement
                transform.dx = self.dodge_direction[0] * self.dodge_speed / 60.0
                transform.dy = self.dodge_direction[1] * self.dodge_speed / 60.0
                return  # Skip normal movement during dodge

        # Smooth movement input
        keys = pygame.key.get_pressed()
        target_x, target_y = 0.0, 0.0

        if keys[self.keybindings.move_up] or keys[self.keybindings.move_up_alt]:
            target_y = -1.0
        if keys[self.keybindings.move_down] or keys[self.keybindings.move_down_alt]:
            target_y = 1.0
        if keys[self.keybindings.move_left] or keys[self.keybindings.move_left_alt]:
            target_x = -1.0
        if keys[self.keybindings.move_right] or keys[self.keybindings.move_right_alt]:
            target_x = 1.0

        # Normalize diagonal
        if target_x != 0 and target_y != 0:
            target_x *= 0.707
            target_y *= 0.707

        # Smooth input interpolation
        self.move_input_x = self.move_input_x * (1 - self.input_smoothing) + target_x * self.input_smoothing
        self.move_input_y = self.move_input_y * (1 - self.input_smoothing) + target_y * self.input_smoothing

        # Apply movement speed
        speed = 140.0
        if status_effects:
            slow_effect = status_effects.get_effect(StatusEffectType.SLOW)
            if slow_effect:
                speed *= 1.0 - slow_effect.value

            speed_boost = status_effects.get_effect(StatusEffectType.SPEED_BOOST)
            if speed_boost:
                speed *= 1.0 + speed_boost.value

        transform.dx = self.move_input_x * speed / 60.0
        transform.dy = self.move_input_y * speed / 60.0

    def _try_dodge(self, current_time: float) -> None:
        """Try to perform dodge/roll."""
        cooldown = self.timer_manager.get_cooldown("dodge")
        if not cooldown or not cooldown.is_ready():
            return

        player = self.entity_manager.get_entity(self.player_id)
        if not player:
            return

        transform = player.get_component(Transform)
        status_effects = player.get_component(StatusEffects)

        if not transform:
            return

        # Get dodge direction from current movement
        if abs(transform.dx) < 0.1 and abs(transform.dy) < 0.1:
            # No movement, dodge forward (or last direction)
            self.dodge_direction = (0.0, -1.0)  # Default: up
        else:
            # Normalize movement direction
            length = math.sqrt(transform.dx ** 2 + transform.dy ** 2)
            if length > 0:
                self.dodge_direction = (transform.dx / length, transform.dy / length)

        # Start dodge
        self.is_dodging = True
        self.dodge_timer = self.dodge_duration
        cooldown.trigger()

        # Add invulnerability effect (using speed boost as placeholder)
        if status_effects:
            invuln = StatusEffect(
                effect_type=StatusEffectType.SPEED_BOOST,
                duration=self.dodge_duration,
                value=0.0,  # No speed boost, just invulnerability marker
            )
            status_effects.add_effect(invuln)

    def _try_use_potion(self, current_time: float) -> None:
        """Try to use healing potion."""
        cooldown = self.timer_manager.get_cooldown("potion")
        if not cooldown or not cooldown.is_ready():
            return

        player = self.entity_manager.get_entity(self.player_id)
        if not player:
            return

        inventory = player.get_component(Inventory)
        health = player.get_component(Health)

        if not inventory or not health:
            return

        # Find potion
        potion_index = None
        for i, item in enumerate(inventory.items):
            if item.get("type") == "potion" and item.get("healing"):
                potion_index = i
                break

        if potion_index is None:
            return  # No potion

        # Use potion
        potion = inventory.remove_item(potion_index)
        healing_amount = potion.get("healing", 50)
        health.heal(healing_amount)
        cooldown.trigger()

    def _switch_weapon(self, direction: int) -> None:
        """Switch weapon (cycle)."""
        player = self.entity_manager.get_entity(self.player_id)
        if not player:
            return

        weapon = player.get_component(Weapon)
        if not weapon:
            return

        weapons = [WeaponType.SWORD, WeaponType.SPEAR, WeaponType.CROSSBOW]
        current_index = weapons.index(weapon.weapon_type) if weapon.weapon_type in weapons else 0

        new_index = (current_index + direction) % len(weapons)
        weapon.weapon_type = weapons[new_index]

        # Update weapon stats based on type
        if weapon.weapon_type == WeaponType.SWORD:
            weapon.attack_delay = 0.5
            weapon.range = 60.0
            weapon.penetration = 0
        elif weapon.weapon_type == WeaponType.SPEAR:
            weapon.attack_delay = 0.7
            weapon.range = 90.0
            weapon.penetration = 1
        elif weapon.weapon_type == WeaponType.CROSSBOW:
            weapon.attack_delay = 1.5
            weapon.range = 400.0
            weapon.projectile_speed = 400.0
            weapon.reload_time = 0.0
            weapon.penetration = 0

    def can_attack(self, current_time: float) -> bool:
        """Check if player can attack (with buffer)."""
        player = self.entity_manager.get_entity(self.player_id)
        if not player:
            return False

        weapon = player.get_component(Weapon)
        if not weapon:
            return False

        # Check buffered input
        if self.input_buffer.consume_action("attack", current_time):
            return weapon.can_attack(current_time)

        return False

    def is_invulnerable(self) -> bool:
        """Check if player is invulnerable (dodging)."""
        return self.is_dodging


def create_player(entity_manager, x: float, y: float) -> int:
    """Create player entity with all components.

    Returns:
        Entity ID
    """
    player = entity_manager.create_entity()

    # Create placeholder sprite
    sprite_surface = pygame.Surface((32, 32))
    sprite_surface.fill((0, 255, 0))  # Green for player
    pygame.draw.circle(sprite_surface, (0, 200, 0), (16, 16), 12)

    # Components
    transform = Transform(x=x, y=y)
    player.add_component(transform)

    render = Render(sprite_id="player", z=0, image=sprite_surface)
    player.add_component(render)

    health = Health(max_hp=100, hp=100)
    player.add_component(health)

    damage = Damage(base=15, crit_chance=0.1, crit_multiplier=2.0)
    player.add_component(damage)

    faction = Faction(tag=FactionType.PLAYER)
    player.add_component(faction)

    weapon = Weapon(
        weapon_type=WeaponType.SWORD,
        attack_delay=0.5,
        range=60.0,
    )
    player.add_component(weapon)

    inventory = Inventory()
    # Initialize weapon slots with starting weapons
    inventory.set_weapon(0, {"type": "sword", "name": "Sword", "weapon_type": WeaponType.SWORD})
    inventory.set_weapon(1, {"type": "spear", "name": "Spear", "weapon_type": WeaponType.SPEAR})
    inventory.set_weapon(2, {"type": "crossbow", "name": "Crossbow", "weapon_type": WeaponType.CROSSBOW})
    inventory.active_weapon_slot = 0
    # Initialize consumable slots with starting potions
    inventory.set_consumable(0, {"type": "potion", "healing": 50, "name": "Health Potion"}, count=3)
    inventory.set_consumable(1, None, count=0)
    player.add_component(inventory)

    experience = Experience(level=1, xp=0, next_xp=50)
    player.add_component(experience)

    skill_tree = SkillTree()
    player.add_component(skill_tree)

    collider = Collider(width=28, height=28)
    player.add_component(collider)

    status_effects = StatusEffects()
    player.add_component(status_effects)

    return player.id
