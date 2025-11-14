"""Visual and gameplay effects: damage numbers, camera shake, particles."""

import math
import random
from dataclasses import dataclass
from typing import List, Tuple

import pygame


@dataclass
class DamageNumber:
    """Floating damage number."""

    x: float
    y: float
    damage: int
    is_crit: bool
    timer: float
    velocity_x: float
    velocity_y: float
    scale: float = 1.0

    def update(self, dt: float) -> None:
        """Update damage number."""
        self.timer -= dt
        self.x += self.velocity_x * dt
        self.y += self.velocity_y * dt
        # Gravity effect
        self.velocity_y += 50.0 * dt

    def is_alive(self) -> bool:
        """Check if number is still visible."""
        return self.timer > 0


@dataclass
class Particle:
    """Particle effect."""

    x: float
    y: float
    velocity_x: float
    velocity_y: float
    color: Tuple[int, int, int]
    lifetime: float
    size: float = 2.0

    def update(self, dt: float) -> None:
        """Update particle."""
        self.lifetime -= dt
        self.x += self.velocity_x * dt
        self.y += self.velocity_y * dt
        # Friction
        self.velocity_x *= 0.95
        self.velocity_y *= 0.95

    def is_alive(self) -> bool:
        """Check if particle is alive."""
        return self.lifetime > 0


class CameraShake:
    """Camera shake effect."""

    def __init__(self) -> None:
        """Initialize camera shake."""
        self.intensity: float = 0.0
        self.duration: float = 0.0
        self.remaining: float = 0.0
        self.offset_x: float = 0.0
        self.offset_y: float = 0.0

    def shake(self, intensity: float, duration: float) -> None:
        """Start camera shake.

        Args:
            intensity: Shake intensity (pixels)
            duration: Shake duration (seconds)
        """
        self.intensity = intensity
        self.duration = duration
        self.remaining = duration

    def update(self, dt: float) -> Tuple[float, float]:
        """Update camera shake. Returns (offset_x, offset_y)."""
        if self.remaining > 0:
            self.remaining -= dt
            # Random offset based on intensity
            progress = self.remaining / self.duration if self.duration > 0 else 0
            current_intensity = self.intensity * progress

            self.offset_x = random.uniform(-current_intensity, current_intensity)
            self.offset_y = random.uniform(-current_intensity, current_intensity)
        else:
            self.offset_x = 0.0
            self.offset_y = 0.0
            self.intensity = 0.0

        return (self.offset_x, self.offset_y)


class EffectsSystem:
    """Manages visual effects."""

    def __init__(self) -> None:
        """Initialize effects system."""
        self.damage_numbers: List[DamageNumber] = []
        self.particles: List[Particle] = []
        self.camera_shake = CameraShake()
        self.font: pygame.font.Font | None = None

    def add_damage_number(
        self, x: float, y: float, damage: int, is_crit: bool = False
    ) -> None:
        """Add floating damage number."""
        # Random offset to avoid overlap
        offset_x = random.uniform(-10, 10)
        offset_y = random.uniform(-5, 5)

        number = DamageNumber(
            x=x + offset_x,
            y=y + offset_y,
            damage=damage,
            is_crit=is_crit,
            timer=1.5 if is_crit else 1.0,
            velocity_x=random.uniform(-30, 30),
            velocity_y=random.uniform(-80, -50),
            scale=1.5 if is_crit else 1.0,
        )
        self.damage_numbers.append(number)

    def add_hit_particles(self, x: float, y: float, color: Tuple[int, int, int] = (255, 200, 0), count: int = 5) -> None:
        """Add hit particles."""
        for _ in range(count):
            particle = Particle(
                x=x,
                y=y,
                velocity_x=random.uniform(-100, 100),
                velocity_y=random.uniform(-100, 100),
                color=color,
                lifetime=random.uniform(0.3, 0.6),
                size=random.uniform(2.0, 4.0),
            )
            self.particles.append(particle)

    def add_crit_particles(self, x: float, y: float) -> None:
        """Add critical hit particles."""
        for _ in range(10):
            particle = Particle(
                x=x,
                y=y,
                velocity_x=random.uniform(-150, 150),
                velocity_y=random.uniform(-150, 50),
                color=(255, 255, 0),
                lifetime=random.uniform(0.4, 0.8),
                size=random.uniform(3.0, 5.0),
            )
            self.particles.append(particle)

    def shake_camera(self, intensity: float, duration: float) -> None:
        """Trigger camera shake."""
        self.camera_shake.shake(intensity, duration)

    def update(self, dt: float) -> Tuple[float, float]:
        """Update all effects. Returns camera shake offset."""
        # Update damage numbers
        for number in self.damage_numbers[:]:
            number.update(dt)
            if not number.is_alive():
                self.damage_numbers.remove(number)

        # Update particles
        for particle in self.particles[:]:
            particle.update(dt)
            if not particle.is_alive():
                self.particles.remove(particle)

        # Update camera shake
        return self.camera_shake.update(dt)

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0) -> None:
        """Render all effects."""
        if self.font is None:
            self.font = pygame.font.Font(None, 24)

        # Render damage numbers
        for number in self.damage_numbers:
            color = (255, 100, 100) if number.is_crit else (255, 255, 255)
            size = int(32 * number.scale) if number.is_crit else int(24 * number.scale)
            font = pygame.font.Font(None, size)

            # Add outline for readability
            text = font.render(str(number.damage), True, color)
            alpha = int(255 * (number.timer / 1.5) if number.is_crit else number.timer)
            text.set_alpha(alpha)

            screen.blit(
                text,
                (
                    int(number.x - camera_x),
                    int(number.y - camera_y),
                ),
            )

        # Render particles
        for particle in self.particles:
            alpha = int(255 * (particle.lifetime / 0.6))
            color_with_alpha = (*particle.color, alpha)

            overlay = pygame.Surface((int(particle.size * 2), int(particle.size * 2)), pygame.SRCALPHA)
            pygame.draw.circle(
                overlay,
                color_with_alpha,
                (int(particle.size), int(particle.size)),
                int(particle.size),
            )
            screen.blit(
                overlay,
                (
                    int(particle.x - particle.size - camera_x),
                    int(particle.y - particle.size - camera_y),
                ),
            )

