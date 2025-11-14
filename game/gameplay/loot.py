"""Loot and item system."""

import random
from typing import Any, Dict, Optional

from game.core.events import EVENT_ITEM_PICKED_UP, event_bus, GameEvent
from game.ecs.components import Inventory, Loot, Transform
from game.ecs.entities import Entity, EntityManager


def create_loot_item(
    entity_manager: EntityManager,
    x: float,
    y: float,
    item_data: Optional[Dict[str, Any]] = None,
) -> Entity:
    """Create a loot item entity."""
    if item_data is None:
        item_data = generate_random_item()

    loot = entity_manager.create_entity()
    loot.add_component(Transform(x=x, y=y))
    loot.add_component(Loot(item_data=item_data, value=item_data.get("value", 0)))

    # Create placeholder sprite
    import pygame

    sprite_surface = pygame.Surface((16, 16))
    sprite_surface.fill((255, 215, 0))  # Gold color
    pygame.draw.rect(sprite_surface, (200, 150, 0), (2, 2, 12, 12))

    from game.ecs.components import Render

    loot.add_component(Render(sprite_id="loot", z=1, image=sprite_surface, scale=0.5))

    return loot


def generate_random_item() -> Dict[str, Any]:
    """Generate a random item."""
    item_types = ["weapon", "armor", "potion", "consumable"]
    item_type = random.choice(item_types)

    item: Dict[str, Any] = {
        "name": f"{item_type.title()}",
        "type": item_type,
        "value": random.randint(5, 50),
    }

    if item_type == "weapon":
        item["attack"] = random.randint(1, 5)
    elif item_type == "armor":
        item["defense"] = random.randint(1, 5)
    elif item_type == "potion":
        item["healing"] = random.randint(10, 50)

    return item


class LootSystem:
    """Handles loot pickup."""

    def __init__(self, entity_manager: EntityManager) -> None:
        """Initialize loot system."""
        self.entity_manager = entity_manager
        self.pickup_range = 30.0

    def check_pickup(self, player_id: int) -> None:
        """Check if player can pick up nearby loot."""
        player = self.entity_manager.get_entity(player_id)
        if not player:
            return

        player_pos = player.get_component(Transform)
        player_inv = player.get_component(Inventory)
        if not player_pos or not player_inv:
            return

        loot_entities = self.entity_manager.get_entities_with(Loot, Transform)
        for loot_entity in loot_entities:
            loot_pos = loot_entity.get_component(Transform)
            loot_comp = loot_entity.get_component(Loot)
            if not loot_pos or not loot_comp:
                continue

            dx = loot_pos.x - player_pos.x
            dy = loot_pos.y - player_pos.y
            distance = (dx * dx + dy * dy) ** 0.5

            if distance <= self.pickup_range:
                # Try to add to inventory
                if player_inv.add_item(loot_comp.item_data):
                    event_bus.emit(
                        GameEvent(
                            EVENT_ITEM_PICKED_UP,
                            {"entity_id": player_id, "item": loot_comp.item_data},
                        )
                    )
                    # Remove loot entity
                    self.entity_manager.remove_entity(loot_entity.id)

