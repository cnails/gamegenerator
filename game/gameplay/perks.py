"""Perk system with definitions and application logic."""

import random
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List


class PerkRarity(str, Enum):
    """Perk rarity levels."""

    COMMON = "common"
    RARE = "rare"
    EPIC = "epic"


class PerkCategory(str, Enum):
    """Perk categories/trees."""

    WEAPON = "weapon"  # Оружие
    SURVIVAL = "survival"  # Выживание
    CHIVALRY = "chivalry"  # Рыцарское искусство


@dataclass
class Perk:
    """Perk definition."""

    id: str
    name: str
    name_ru: str
    description: str
    description_ru: str
    category: PerkCategory
    rarity: PerkRarity
    effects: Dict[str, Any]  # Effects to apply
    icon: str = "default"  # Icon identifier

    def get_name(self, language: str = "en") -> str:
        """Get localized name."""
        return self.name_ru if language == "ru" else self.name

    def get_description(self, language: str = "en") -> str:
        """Get localized description."""
        return self.description_ru if language == "ru" else self.description


# Perk definitions
PERKS: Dict[str, Perk] = {
    # WEAPON TREE
    "weapon_damage_1": Perk(
        id="weapon_damage_1",
        name="Sharp Blade",
        name_ru="Острый клинок",
        description="+20% weapon damage",
        description_ru="+20% урона оружием",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.COMMON,
        effects={"damage_multiplier": 1.2},
    ),
    "weapon_damage_2": Perk(
        id="weapon_damage_2",
        name="Master Forge",
        name_ru="Мастерская ковка",
        description="+40% weapon damage",
        description_ru="+40% урона оружием",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.RARE,
        effects={"damage_multiplier": 1.4},
    ),
    "weapon_speed_1": Perk(
        id="weapon_speed_1",
        name="Swift Strikes",
        name_ru="Быстрые удары",
        description="-25% attack delay",
        description_ru="-25% задержки атаки",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.COMMON,
        effects={"attack_speed_multiplier": 0.75},
    ),
    "weapon_speed_2": Perk(
        id="weapon_speed_2",
        name="Lightning Fast",
        name_ru="Молниеносный",
        description="-50% attack delay",
        description_ru="-50% задержки атаки",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.RARE,
        effects={"attack_speed_multiplier": 0.5},
    ),
    "weapon_penetration": Perk(
        id="weapon_penetration",
        name="Piercing Strike",
        name_ru="Проникающий удар",
        description="Attacks pierce through 1 enemy",
        description_ru="Атаки пробивают 1 врага",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.RARE,
        effects={"penetration": 1},
    ),
    "weapon_crit_1": Perk(
        id="weapon_crit_1",
        name="Critical Eye",
        name_ru="Критический взгляд",
        description="+15% crit chance",
        description_ru="+15% шанс крита",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.COMMON,
        effects={"crit_chance": 0.15},
    ),
    "weapon_crit_2": Perk(
        id="weapon_crit_2",
        name="Death Strike",
        name_ru="Смертельный удар",
        description="+30% crit chance, +50% crit damage",
        description_ru="+30% шанс крита, +50% урон крита",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.EPIC,
        effects={"crit_chance": 0.30, "crit_multiplier": 0.5},
    ),
    "weapon_burn": Perk(
        id="weapon_burn",
        name="Flaming Weapon",
        name_ru="Пылающее оружие",
        description="Attacks apply burn (5 dmg/sec for 3s)",
        description_ru="Атаки наносят ожог (5 урона/сек на 3с)",
        category=PerkCategory.WEAPON,
        rarity=PerkRarity.RARE,
        effects={"on_hit_effect": "burn", "burn_damage": 5, "burn_duration": 3.0},
    ),
    # SURVIVAL TREE
    "survival_hp_1": Perk(
        id="survival_hp_1",
        name="Tough",
        name_ru="Крепкий",
        description="+25 max HP",
        description_ru="+25 макс. ЗД",
        category=PerkCategory.SURVIVAL,
        rarity=PerkRarity.COMMON,
        effects={"max_hp": 25},
    ),
    "survival_hp_2": Perk(
        id="survival_hp_2",
        name="Iron Constitution",
        name_ru="Железная конституция",
        description="+50 max HP",
        description_ru="+50 макс. ЗД",
        category=PerkCategory.SURVIVAL,
        rarity=PerkRarity.RARE,
        effects={"max_hp": 50},
    ),
    "survival_armor": Perk(
        id="survival_armor",
        name="Armor Plating",
        name_ru="Бронепластины",
        description="-20% incoming damage",
        description_ru="-20% входящего урона",
        category=PerkCategory.SURVIVAL,
        rarity=PerkRarity.RARE,
        effects={"damage_reduction": 0.2},
    ),
    "survival_regen": Perk(
        id="survival_regen",
        name="Regeneration",
        name_ru="Регенерация",
        description="Regenerate 2 HP/sec",
        description_ru="Регенерируй 2 ЗД/сек",
        category=PerkCategory.SURVIVAL,
        rarity=PerkRarity.RARE,
        effects={"hp_regen": 2.0},
    ),
    "survival_resist": Perk(
        id="survival_resist",
        name="Resistance",
        name_ru="Сопротивление",
        description="+50% resistance to status effects",
        description_ru="+50% сопротивления эффектам",
        category=PerkCategory.SURVIVAL,
        rarity=PerkRarity.COMMON,
        effects={"status_resistance": 0.5},
    ),
    "survival_vampire": Perk(
        id="survival_vampire",
        name="Vampiric Strike",
        name_ru="Вампирический удар",
        description="Heal for 10% of damage dealt",
        description_ru="Лечись на 10% от нанесённого урона",
        category=PerkCategory.SURVIVAL,
        rarity=PerkRarity.EPIC,
        effects={"lifesteal": 0.1},
    ),
    # CHIVALRY TREE
    "chivalry_dash_distance": Perk(
        id="chivalry_dash_distance",
        name="Long Dash",
        name_ru="Длинный рывок",
        description="+50% dash distance",
        description_ru="+50% дальность рывка",
        category=PerkCategory.CHIVALRY,
        rarity=PerkRarity.COMMON,
        effects={"dash_distance_multiplier": 1.5},
    ),
    "chivalry_dash_cooldown": Perk(
        id="chivalry_dash_cooldown",
        name="Quick Recovery",
        name_ru="Быстрое восстановление",
        description="-50% dash cooldown",
        description_ru="-50% кулдаун рывка",
        category=PerkCategory.CHIVALRY,
        rarity=PerkRarity.RARE,
        effects={"dash_cooldown_multiplier": 0.5},
    ),
    "chivalry_dash_damage": Perk(
        id="chivalry_dash_damage",
        name="Dash Strike",
        name_ru="Удар в рывке",
        description="Dash deals 50 damage to enemies",
        description_ru="Рывок наносит 50 урона врагам",
        category=PerkCategory.CHIVALRY,
        rarity=PerkRarity.RARE,
        effects={"dash_damage": 50},
    ),
    "chivalry_battle_cry": Perk(
        id="chivalry_battle_cry",
        name="Battle Cry",
        name_ru="Боевой клич",
        description="Battle cry stuns nearby enemies for 2s (30s cooldown)",
        description_ru="Боевой клич оглушает врагов на 2с (кулдаун 30с)",
        category=PerkCategory.CHIVALRY,
        rarity=PerkRarity.EPIC,
        effects={"battle_cry": True, "battle_cry_stun_duration": 2.0, "battle_cry_cooldown": 30.0},
    ),
    "chivalry_aura": Perk(
        id="chivalry_aura",
        name="Aura of Might",
        name_ru="Аура мощи",
        description="+10% damage and speed in 200px radius",
        description_ru="+10% урона и скорости в радиусе 200px",
        category=PerkCategory.CHIVALRY,
        rarity=PerkRarity.EPIC,
        effects={"aura_radius": 200, "aura_damage_bonus": 0.1, "aura_speed_bonus": 0.1},
    ),
}


def get_perks_by_category(category: PerkCategory) -> List[Perk]:
    """Get all perks in a category."""
    return [perk for perk in PERKS.values() if perk.category == category]


def get_perks_by_rarity(rarity: PerkRarity) -> List[Perk]:
    """Get all perks of a rarity."""
    return [perk for perk in PERKS.values() if perk.rarity == rarity]


def roll_perks(count: int = 3, exclude: List[str] | None = None) -> List[Perk]:
    """Roll random perks with rarity weighting.

    Args:
        count: Number of perks to roll
        exclude: List of perk IDs to exclude

    Returns:
        List of rolled perks
    """
    exclude = exclude or []
    available_perks = [p for p in PERKS.values() if p.id not in exclude]

    # Rarity weights: common=70%, rare=25%, epic=5%
    weights = {
        PerkRarity.COMMON: 0.70,
        PerkRarity.RARE: 0.25,
        PerkRarity.EPIC: 0.05,
    }

    rolled = []
    for _ in range(count):
        # Roll rarity
        rarity_roll = random.random()
        if rarity_roll < weights[PerkRarity.COMMON]:
            target_rarity = PerkRarity.COMMON
        elif rarity_roll < weights[PerkRarity.COMMON] + weights[PerkRarity.RARE]:
            target_rarity = PerkRarity.RARE
        else:
            target_rarity = PerkRarity.EPIC

        # Get perks of target rarity
        rarity_perks = [p for p in available_perks if p.rarity == target_rarity]
        if not rarity_perks:
            # Fallback to any available perk
            rarity_perks = available_perks

        if rarity_perks:
            perk = random.choice(rarity_perks)
            rolled.append(perk)
            available_perks.remove(perk)  # Don't roll duplicates

    return rolled


def apply_perk(player_entity, perk: Perk) -> None:
    """Apply perk effects to player entity."""
    from game.ecs.components import Damage, Health, Weapon, StatusEffects

    effects = perk.effects

    # Apply damage multiplier
    if "damage_multiplier" in effects:
        damage = player_entity.get_component(Damage)
        if damage:
            damage.base = int(damage.base * effects["damage_multiplier"])

    # Apply attack speed multiplier
    if "attack_speed_multiplier" in effects:
        weapon = player_entity.get_component(Weapon)
        if weapon:
            weapon.attack_delay *= effects["attack_speed_multiplier"]

    # Apply max HP bonus
    if "max_hp" in effects:
        health = player_entity.get_component(Health)
        if health:
            health.max_hp += effects["max_hp"]
            health.hp += effects["max_hp"]  # Also heal

    # Apply crit chance
    if "crit_chance" in effects:
        damage = player_entity.get_component(Damage)
        if damage:
            damage.crit_chance += effects["crit_chance"]

    # Apply crit multiplier bonus
    if "crit_multiplier" in effects:
        damage = player_entity.get_component(Damage)
        if damage:
            damage.crit_multiplier += effects["crit_multiplier"]

    # Store other effects in a component for runtime use
    # (damage_reduction, hp_regen, lifesteal, etc.)
    # These will be handled by systems

