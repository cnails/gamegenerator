"""ECS Components."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List

import pygame


class FactionType(str, Enum):
    """Faction types."""

    PLAYER = "player"
    ENEMY = "enemy"
    BOSS = "boss"
    NEUTRAL = "neutral"


class WeaponType(str, Enum):
    """Weapon types."""

    SWORD = "sword"
    SPEAR = "spear"
    CROSSBOW = "crossbow"


class AIState(str, Enum):
    """AI behavior states."""

    IDLE = "idle"
    PATROL = "patrol"
    CHASE = "chase"
    ATTACK = "attack"
    RETREAT = "retreat"


class StatusEffectType(str, Enum):
    """Status effect types."""

    SLOW = "slow"
    SLOWED = "slowed"  # For puddles
    POISON = "poison"
    BURN = "burn"
    FREEZE = "freeze"
    STUN = "stun"
    REGEN = "regen"
    SPEED_BOOST = "speed_boost"
    INVULNERABLE = "invulnerable"


@dataclass
class StatusEffect:
    """Single status effect."""

    effect_type: StatusEffectType
    duration: float
    value: float = 0.0
    tick_rate: float = 1.0  # Damage/heal per second
    last_tick: float = 0.0


@dataclass
class Transform:
    """Transform component: position and velocity."""

    x: float = 0.0
    y: float = 0.0
    dx: float = 0.0
    dy: float = 0.0

    def to_tuple(self) -> tuple[int, int]:
        """Convert position to integer tuple."""
        return (int(self.x), int(self.y))

    def get_position(self) -> tuple[float, float]:
        """Get position as float tuple."""
        return (self.x, self.y)

    def get_velocity(self) -> tuple[float, float]:
        """Get velocity as float tuple."""
        return (self.dx, self.dy)


@dataclass
class Render:
    """Render component: sprite and z-order."""

    sprite_id: str = "default"
    z: int = 0
    image: pygame.Surface | None = None
    color: tuple[int, int, int] | None = None
    scale: float = 1.0
    rotation: float = 0.0
    flip_x: bool = False
    flip_y: bool = False

    def get_surface(self) -> pygame.Surface:
        """Get processed surface for rendering."""
        if self.image is None:
            # Create placeholder
            surf = pygame.Surface((32, 32))
            surf.fill(self.color or (255, 0, 255))
            return surf

        surf = self.image.copy()
        if self.scale != 1.0:
            size = (
                int(surf.get_width() * self.scale),
                int(surf.get_height() * self.scale),
            )
            surf = pygame.transform.scale(surf, size)

        if self.rotation != 0.0:
            surf = pygame.transform.rotate(surf, self.rotation)

        if self.flip_x or self.flip_y:
            surf = pygame.transform.flip(surf, self.flip_x, self.flip_y)

        return surf


@dataclass
class Health:
    """Health component."""

    max_hp: int
    hp: int

    def __post_init__(self) -> None:
        """Ensure hp doesn't exceed max_hp."""
        self.hp = min(self.hp, self.max_hp)

    def is_alive(self) -> bool:
        """Check if entity is alive."""
        return self.hp > 0

    def take_damage(self, amount: int) -> int:
        """Take damage and return actual damage dealt."""
        old_hp = self.hp
        self.hp = max(0, self.hp - amount)
        return old_hp - self.hp

    def heal(self, amount: int) -> int:
        """Heal and return actual healing done."""
        old_hp = self.hp
        self.hp = min(self.max_hp, self.hp + amount)
        return self.hp - old_hp

    def get_percentage(self) -> float:
        """Get health as percentage (0.0 to 1.0)."""
        return self.hp / self.max_hp if self.max_hp > 0 else 0.0


@dataclass
class Damage:
    """Damage component: base damage, crit chance, crit multiplier."""

    base: int = 10
    crit_chance: float = 0.0  # 0.0 to 1.0
    crit_multiplier: float = 2.0
    bonus_damage: int = 0  # Additional flat damage

    def calculate_damage(self, is_crit: bool | None = None) -> tuple[int, bool]:
        """Calculate damage with potential crit. Returns (damage, is_crit)."""
        import random

        if is_crit is None:
            is_crit = random.random() < self.crit_chance

        damage = self.base + self.bonus_damage
        if is_crit:
            damage = int(damage * self.crit_multiplier)

        return (damage, is_crit)


@dataclass
class Faction:
    """Faction component: identifies entity type."""

    tag: FactionType = FactionType.NEUTRAL

    def is_enemy_of(self, other: "Faction") -> bool:
        """Check if this faction is enemy of other."""
        if self.tag == FactionType.PLAYER:
            return other.tag in (FactionType.ENEMY, FactionType.BOSS)
        if self.tag in (FactionType.ENEMY, FactionType.BOSS):
            return other.tag == FactionType.PLAYER
        return False


@dataclass
class Weapon:
    """Weapon component: weapon type, stats, modifiers."""

    weapon_type: WeaponType = WeaponType.SWORD
    attack_delay: float = 0.67  # Seconds between attacks
    range: float = 60.0  # Attack range in pixels
    projectile_speed: float = 0.0  # For ranged weapons (pixels/sec)
    reload_time: float = 0.0  # For crossbow
    penetration: int = 0  # How many enemies can be hit (0 = no penetration)
    modifiers: Dict[str, Any] = field(default_factory=dict)
    last_attack_time: float = 0.0
    ammo: int = 0  # For ranged weapons (-1 = infinite)

    def can_attack(self, current_time: float) -> bool:
        """Check if weapon can attack now."""
        time_since_attack = current_time - self.last_attack_time
        return time_since_attack >= self.attack_delay

    def needs_reload(self) -> bool:
        """Check if weapon needs reloading."""
        return self.reload_time > 0 and self.ammo == 0

    def get_effective_range(self) -> float:
        """Get effective attack range."""
        range_mod = self.modifiers.get("range_multiplier", 1.0)
        return self.range * range_mod


@dataclass
class Inventory:
    """Inventory component: items and gold with weapon and consumable slots."""

    items: List[Dict[str, Any]] = field(default_factory=list)
    gold: int = 0
    max_size: int = 20
    # Weapon slots (3 slots)
    weapon_slots: List[Dict[str, Any] | None] = field(default_factory=lambda: [None, None, None])
    active_weapon_slot: int = 0  # Currently active weapon slot (0-2)
    # Consumable slots (2 slots)
    consumable_slots: List[Dict[str, Any] | None] = field(default_factory=lambda: [None, None])
    consumable_counts: List[int] = field(default_factory=lambda: [0, 0])  # Counts for each consumable

    def add_item(self, item: Dict[str, Any]) -> bool:
        """Add item to inventory. Returns True if successful."""
        if len(self.items) < self.max_size:
            self.items.append(item)
            return True
        return False

    def remove_item(self, index: int) -> Dict[str, Any] | None:
        """Remove item from inventory by index."""
        if 0 <= index < len(self.items):
            return self.items.pop(index)
        return None

    def add_gold(self, amount: int) -> None:
        """Add gold to inventory."""
        self.gold += amount

    def spend_gold(self, amount: int) -> bool:
        """Spend gold. Returns True if successful."""
        if self.gold >= amount:
            self.gold -= amount
            return True
        return False

    def set_weapon(self, slot: int, weapon_data: Dict[str, Any] | None) -> bool:
        """Set weapon in slot (0-2). Returns True if successful."""
        if 0 <= slot < len(self.weapon_slots):
            self.weapon_slots[slot] = weapon_data
            return True
        return False

    def get_active_weapon(self) -> Dict[str, Any] | None:
        """Get active weapon data."""
        if 0 <= self.active_weapon_slot < len(self.weapon_slots):
            return self.weapon_slots[self.active_weapon_slot]
        return None

    def switch_weapon_slot(self, slot: int) -> bool:
        """Switch to weapon slot (0-2). Returns True if successful."""
        if 0 <= slot < len(self.weapon_slots) and self.weapon_slots[slot] is not None:
            self.active_weapon_slot = slot
            return True
        return False

    def set_consumable(self, slot: int, consumable_data: Dict[str, Any] | None, count: int = 1) -> bool:
        """Set consumable in slot (0-1). Returns True if successful."""
        if 0 <= slot < len(self.consumable_slots):
            self.consumable_slots[slot] = consumable_data
            self.consumable_counts[slot] = count if consumable_data is not None else 0
            return True
        return False

    def use_consumable(self, slot: int) -> Dict[str, Any] | None:
        """Use consumable from slot (0-1). Returns consumable data if successful."""
        if 0 <= slot < len(self.consumable_slots):
            if self.consumable_slots[slot] is not None and self.consumable_counts[slot] > 0:
                self.consumable_counts[slot] -= 1
                if self.consumable_counts[slot] <= 0:
                    self.consumable_slots[slot] = None
                    self.consumable_counts[slot] = 0
                return self.consumable_slots[slot]
        return None

    def get_consumable(self, slot: int) -> tuple[Dict[str, Any] | None, int]:
        """Get consumable data and count from slot (0-1)."""
        if 0 <= slot < len(self.consumable_slots):
            return (self.consumable_slots[slot], self.consumable_counts[slot])
        return (None, 0)


@dataclass
class Experience:
    """Experience component: level, XP, next level XP."""

    level: int = 1
    xp: int = 0
    next_xp: int = 50
    xp_multiplier: float = 1.0  # For XP bonuses

    def add_xp(self, amount: int) -> bool:
        """Add experience. Returns True if leveled up."""
        adjusted_amount = int(amount * self.xp_multiplier)
        self.xp += adjusted_amount
        leveled_up = False

        while self.xp >= self.next_xp:
            self.xp -= self.next_xp
            self.level += 1
            self.next_xp = int(self.next_xp * 1.5)
            leveled_up = True

        return leveled_up

    def get_xp_percentage(self) -> float:
        """Get XP progress to next level (0.0 to 1.0)."""
        return self.xp / self.next_xp if self.next_xp > 0 else 0.0


@dataclass
class SkillTree:
    """Skill tree component: unlocked skill nodes."""

    unlocked_nodes: List[str] = field(default_factory=list)
    available_points: int = 0

    def unlock_node(self, node_id: str) -> bool:
        """Unlock a skill node. Returns True if successful."""
        if node_id not in self.unlocked_nodes:
            self.unlocked_nodes.append(node_id)
            return True
        return False

    def has_node(self, node_id: str) -> bool:
        """Check if node is unlocked."""
        return node_id in self.unlocked_nodes

    def add_skill_point(self, amount: int = 1) -> None:
        """Add skill points."""
        self.available_points += amount


@dataclass
class AI:
    """AI component: state machine and behavior parameters."""

    state: AIState = AIState.IDLE
    agro_radius: float = 200.0
    attack_range: float = 60.0
    patrol_radius: float = 100.0
    patrol_center: tuple[float, float] = (0.0, 0.0)
    behavior: str = "aggressive"  # "aggressive", "defensive", "cowardly"
    target_id: int | None = None
    state_timer: float = 0.0
    telegraph_duration: float = 0.0  # For boss telegraphs
    telegraph_position: tuple[float, float] | None = None
    telegraph_type: str | None = None  # "dash", "slam", "summon"

    def set_state(self, new_state: AIState) -> None:
        """Change AI state."""
        self.state = new_state
        self.state_timer = 0.0


@dataclass
class Collider:
    """Collider component: collision box and properties."""

    width: int = 32
    height: int = 32
    solid: bool = True
    hitbox: pygame.Rect | None = None  # Custom hitbox (optional)

    def get_rect(self, transform: Transform) -> pygame.Rect:
        """Get collision rect from transform."""
        if self.hitbox is not None:
            return pygame.Rect(
                int(transform.x) + self.hitbox.x,
                int(transform.y) + self.hitbox.y,
                self.hitbox.width,
                self.hitbox.height,
            )
        return pygame.Rect(int(transform.x), int(transform.y), self.width, self.height)

    def get_center(self, transform: Transform) -> tuple[float, float]:
        """Get center point of collider."""
        rect = self.get_rect(transform)
        return (rect.centerx, rect.centery)


@dataclass
class StatusEffects:
    """Status effects component: list of active effects."""

    effects: List[StatusEffect] = field(default_factory=list)

    def add_effect(self, effect: StatusEffect) -> None:
        """Add a status effect."""
        # Check if effect already exists
        for existing in self.effects:
            if existing.effect_type == effect.effect_type:
                # Refresh duration
                existing.duration = effect.duration
                return
        self.effects.append(effect)

    def remove_effect(self, effect_type: StatusEffectType) -> None:
        """Remove a status effect."""
        self.effects = [e for e in self.effects if e.effect_type != effect_type]

    def has_effect(self, effect_type: StatusEffectType) -> bool:
        """Check if entity has specific effect."""
        return any(e.effect_type == effect_type for e in self.effects)

    def get_effect(self, effect_type: StatusEffectType) -> StatusEffect | None:
        """Get specific effect if present."""
        for effect in self.effects:
            if effect.effect_type == effect_type:
                return effect
        return None

    def update(self, dt: float) -> None:
        """Update effects (reduce duration)."""
        for effect in self.effects[:]:
            effect.duration -= dt
            if effect.duration <= 0:
                self.effects.remove(effect)


@dataclass
class Projectile:
    """Projectile component: for ranged attacks."""

    damage: int = 10
    owner_id: int = -1
    lifetime: float = 5.0
    penetration: int = 0  # How many enemies can pass through
    hitbox_type: str = "capsule"  # "capsule", "rectangle", "ray"
    hitbox_width: float = 8.0
    hitbox_height: float = 8.0


@dataclass
class Enemy:
    """Enemy component: stores enemy type."""

    enemy_type: str = "goblin"  # "goblin", "slime", "slime_small", "goblin_chief"


@dataclass
class Loot:
    """Loot component: for items on the ground."""

    item_data: Dict[str, Any] = field(default_factory=dict)
    value: int = 0


@dataclass
class Player:
    """Player component: marker component for player entity."""

    pass


@dataclass
class Stats:
    """Stats component: entity statistics."""

    attack: int = 0
    defense: int = 0
    speed: int = 0


# Legacy components for backward compatibility
Position = Transform  # Alias
Velocity = Transform  # Alias
