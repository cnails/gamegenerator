"""Entity management."""

from typing import Any, Dict, TypeVar

from game.ecs.components import (
    AI,
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
    StatusEffects,
    Transform,
    Weapon,
    WeaponType,
)

# Legacy imports for backward compatibility
from game.ecs.components import Enemy

# Legacy component aliases (if needed)
# Loot, Player, Stats components may not exist - remove if causing errors

Position = Transform  # Alias
Velocity = Transform  # Alias
Sprite = Render  # Alias

Component = TypeVar("Component")


class Entity:
    """Entity in ECS system."""

    def __init__(self, entity_id: int) -> None:
        """Initialize entity."""
        self.id = entity_id
        self.components: Dict[type, Any] = {}

    def add_component(self, component: Any) -> None:
        """Add component to entity."""
        self.components[type(component)] = component

    def remove_component(self, component_type: type) -> None:
        """Remove component from entity."""
        if component_type in self.components:
            del self.components[component_type]

    def get_component(self, component_type: type[Component]) -> Component | None:
        """Get component by type."""
        return self.components.get(component_type)

    def has_component(self, component_type: type) -> bool:
        """Check if entity has component."""
        return component_type in self.components


class EntityManager:
    """Manages entities."""

    def __init__(self) -> None:
        """Initialize entity manager."""
        self.entities: Dict[int, Entity] = {}
        self.next_id = 0

    def create_entity(self) -> Entity:
        """Create new entity."""
        entity = Entity(self.next_id)
        self.entities[self.next_id] = entity
        self.next_id += 1
        return entity

    def remove_entity(self, entity_id: int) -> None:
        """Remove entity."""
        if entity_id in self.entities:
            del self.entities[entity_id]

    def get_entity(self, entity_id: int) -> Entity | None:
        """Get entity by ID."""
        return self.entities.get(entity_id)

    def get_entities_with(self, *component_types: type) -> list[Entity]:
        """Get all entities with specified components."""
        result = []
        for entity in self.entities.values():
            if all(entity.has_component(ct) for ct in component_types):
                result.append(entity)
        return result

    def clear(self) -> None:
        """Clear all entities."""
        self.entities.clear()
        self.next_id = 0

