"""Weapon definitions with base stats and rarity modifiers."""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional

from game.ecs.components import WeaponType


class Rarity(str, Enum):
    """Weapon rarity levels."""

    COMMON = "common"
    RARE = "rare"
    EPIC = "epic"
    LEGENDARY = "legendary"


@dataclass
class WeaponModifier:
    """Weapon modifier effect."""

    name: str
    damage_multiplier: float = 1.0
    crit_chance_bonus: float = 0.0
    crit_multiplier_bonus: float = 0.0
    range_multiplier: float = 1.0
    attack_speed_multiplier: float = 1.0
    effects: List[str] = None  # Special effects like "fire", "poison", etc.

    def __post_init__(self) -> None:
        """Initialize effects list."""
        if self.effects is None:
            self.effects = []


@dataclass
class WeaponDefinition:
    """Base weapon definition."""

    weapon_type: WeaponType
    base_damage: int
    base_crit_chance: float
    base_crit_multiplier: float
    base_range: float
    base_attack_delay: float
    penetration: int
    projectile_speed: float = 0.0
    hitbox_type: str = "arc"  # "arc", "line", "projectile"
    hitbox_params: Dict = None  # Specific hitbox parameters

    def __post_init__(self) -> None:
        """Initialize hitbox params."""
        if self.hitbox_params is None:
            self.hitbox_params = {}


# Base weapon definitions
WEAPON_DEFINITIONS: Dict[WeaponType, WeaponDefinition] = {
    WeaponType.SWORD: WeaponDefinition(
        weapon_type=WeaponType.SWORD,
        base_damage=15,
        base_crit_chance=0.1,
        base_crit_multiplier=2.0,
        base_range=60.0,
        base_attack_delay=0.5,
        penetration=0,
        hitbox_type="arc",
        hitbox_params={
            "arc_angle": 60.0,  # degrees
            "arc_start_frame": 0,
            "arc_end_frame": 3,  # Frame-based damage window
            "total_frames": 10,
        },
    ),
    WeaponType.SPEAR: WeaponDefinition(
        weapon_type=WeaponType.SPEAR,
        base_damage=20,
        base_crit_chance=0.15,
        base_crit_multiplier=2.2,
        base_range=90.0,
        base_attack_delay=0.7,
        penetration=1,
        hitbox_type="line",
        hitbox_params={
            "cone_angle": 30.0,  # degrees
            "line_start_frame": 2,
            "line_end_frame": 5,
            "total_frames": 12,
        },
    ),
    WeaponType.CROSSBOW: WeaponDefinition(
        weapon_type=WeaponType.CROSSBOW,
        base_damage=25,
        base_crit_chance=0.2,
        base_crit_multiplier=2.5,
        base_range=400.0,
        base_attack_delay=1.5,
        penetration=0,
        projectile_speed=400.0,
        hitbox_type="projectile",
        hitbox_params={
            "hitbox_type": "capsule",  # "capsule", "rectangle", "ray"
            "hitbox_width": 8,
            "hitbox_height": 8,
            "lifetime": 5.0,
        },
    ),
}

# Rarity modifiers
RARITY_MODIFIERS: Dict[Rarity, WeaponModifier] = {
    Rarity.COMMON: WeaponModifier(
        name="Common",
        damage_multiplier=1.0,
        crit_chance_bonus=0.0,
        crit_multiplier_bonus=0.0,
    ),
    Rarity.RARE: WeaponModifier(
        name="Rare",
        damage_multiplier=1.15,
        crit_chance_bonus=0.05,
        crit_multiplier_bonus=0.2,
        effects=["sharp"],  # +5% damage
    ),
    Rarity.EPIC: WeaponModifier(
        name="Epic",
        damage_multiplier=1.3,
        crit_chance_bonus=0.1,
        crit_multiplier_bonus=0.4,
        range_multiplier=1.1,
        effects=["sharp", "balanced"],  # +10% damage, +10% range
    ),
    Rarity.LEGENDARY: WeaponModifier(
        name="Legendary",
        damage_multiplier=1.5,
        crit_chance_bonus=0.15,
        crit_multiplier_bonus=0.6,
        range_multiplier=1.2,
        attack_speed_multiplier=1.1,
        effects=["sharp", "balanced", "masterwork"],  # Multiple bonuses
    ),
}

# Special effect modifiers
SPECIAL_MODIFIERS: Dict[str, WeaponModifier] = {
    "fire": WeaponModifier(
        name="Fire",
        damage_multiplier=1.1,
        effects=["fire_damage"],  # Adds fire damage over time
    ),
    "ice": WeaponModifier(
        name="Ice",
        effects=["slow"],  # Slows enemies
    ),
    "poison": WeaponModifier(
        name="Poison",
        effects=["poison_damage"],  # Adds poison damage over time
    ),
    "lifesteal": WeaponModifier(
        name="Lifesteal",
        effects=["lifesteal"],  # Heals on hit
    ),
    "chain": WeaponModifier(
        name="Chain",
        effects=["chain_lightning"],  # Damage chains to nearby enemies
    ),
}


def get_weapon_stats(weapon_type: WeaponType, rarity: Rarity = Rarity.COMMON, modifiers: List[str] = None) -> Dict:
    """Get weapon stats with rarity and modifiers applied."""
    base = WEAPON_DEFINITIONS[weapon_type]
    rarity_mod = RARITY_MODIFIERS[rarity]

    if modifiers is None:
        modifiers = []

    # Calculate final stats
    damage = int(base.base_damage * rarity_mod.damage_multiplier)
    crit_chance = base.base_crit_chance + rarity_mod.crit_chance_bonus
    crit_multiplier = base.base_crit_multiplier + rarity_mod.crit_multiplier_bonus
    range_val = base.base_range * rarity_mod.range_multiplier
    attack_delay = base.base_attack_delay / rarity_mod.attack_speed_multiplier

    # Apply special modifiers
    for mod_name in modifiers:
        if mod_name in SPECIAL_MODIFIERS:
            special_mod = SPECIAL_MODIFIERS[mod_name]
            damage = int(damage * special_mod.damage_multiplier)
            crit_chance += special_mod.crit_chance_bonus
            crit_multiplier += special_mod.crit_multiplier_bonus
            range_val *= special_mod.range_multiplier
            attack_delay /= special_mod.attack_speed_multiplier

    return {
        "damage": damage,
        "crit_chance": min(crit_chance, 1.0),  # Cap at 100%
        "crit_multiplier": crit_multiplier,
        "range": range_val,
        "attack_delay": attack_delay,
        "penetration": base.penetration,
        "projectile_speed": base.projectile_speed,
        "hitbox_type": base.hitbox_type,
        "hitbox_params": base.hitbox_params.copy(),
        "rarity": rarity,
        "modifiers": modifiers + rarity_mod.effects,
    }

