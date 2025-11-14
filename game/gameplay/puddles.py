"""Slime puddle system for slowing effects."""

from dataclasses import dataclass
from typing import List, Tuple

import pygame

from game.ecs.components import StatusEffect, StatusEffectType, StatusEffects, Transform


@dataclass
class Puddle:
    """Slime puddle that slows entities."""

    x: float
    y: float
    radius: float
    duration: float
    slow_amount: float  # 0.0 to 1.0 (1.0 = complete stop)
    remaining_time: float

    def update(self, dt: float) -> None:
        """Update puddle lifetime."""
        self.remaining_time -= dt

    def is_active(self) -> bool:
        """Check if puddle is still active."""
        return self.remaining_time > 0

    def check_collision(self, entity_x: float, entity_y: float) -> bool:
        """Check if entity is in puddle."""
        dx = entity_x - self.x
        dy = entity_y - self.y
        distance_sq = dx * dx + dy * dy
        return distance_sq <= self.radius * self.radius


class PuddleSystem:
    """Manages slime puddles."""

    def __init__(self) -> None:
        """Initialize puddle system."""
        self.puddles: List[Puddle] = []

    def add_puddle(self, x: float, y: float, radius: float, duration: float, slow_amount: float) -> None:
        """Add a new puddle."""
        puddle = Puddle(x, y, radius, duration, slow_amount, duration)
        self.puddles.append(puddle)

    def update(self, dt: float, entity_manager) -> None:
        """Update all puddles and apply effects to entities."""
        # Update puddles
        for puddle in self.puddles[:]:
            puddle.update(dt)
            if not puddle.is_active():
                self.puddles.remove(puddle)

        # Apply slow effects to entities in puddles
        from game.ecs.components import Faction, FactionType

        entities = entity_manager.get_entities_with(Transform, Faction)
        for entity in entities:
            transform = entity.get_component(Transform)
            faction = entity.get_component(Faction)

            if not transform or not faction:
                continue

            # Only affect player
            if faction.tag != FactionType.PLAYER:
                continue

            # Check if in any puddle
            for puddle in self.puddles:
                if puddle.check_collision(transform.x, transform.y):
                    status_effects = entity.get_component(StatusEffects)
                    if not status_effects:
                        status_effects = StatusEffects()
                        entity.add_component(status_effects)

                    # Apply slow effect
                    status_effects.add_effect(
                        StatusEffect(StatusEffectType.SLOWED, puddle.duration, {"slow_amount": puddle.slow_amount})
                    )
                    break

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0) -> None:
        """Render puddles."""
        for puddle in self.puddles:
            if not puddle.is_active():
                continue

            # Calculate alpha based on remaining time
            alpha = int(150 * (puddle.remaining_time / puddle.duration))

            # Draw puddle
            center_x = int(puddle.x - camera_x)
            center_y = int(puddle.y - camera_y)

            overlay = pygame.Surface((int(puddle.radius * 2), int(puddle.radius * 2)), pygame.SRCALPHA)
            pygame.draw.circle(overlay, (0, 255, 0, alpha), (int(puddle.radius), int(puddle.radius)), int(puddle.radius))
            screen.blit(overlay, (center_x - int(puddle.radius), center_y - int(puddle.radius)))

    def clear(self) -> None:
        """Clear all puddles."""
        self.puddles.clear()

