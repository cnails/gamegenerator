"""Boss telegraph system with floor flashing."""

import math
from dataclasses import dataclass
from typing import List, Optional, Tuple

import pygame

from game.world.level import Level


class TelegraphType(str):
    """Telegraph types."""

    DASH = "dash"
    SLAM = "slam"
    SUMMON = "summon"


@dataclass
class Telegraph:
    """Boss telegraph indicator."""

    telegraph_type: str
    position: Tuple[float, float]
    direction: Tuple[float, float] | None
    duration: float
    remaining_time: float
    shape: str  # "line", "cone", "circle"
    shape_params: dict
    flash_interval: float = 0.1  # Flash every 0.1 seconds
    last_flash: float = 0.0
    visible: bool = True

    def update(self, dt: float) -> None:
        """Update telegraph."""
        self.remaining_time -= dt
        self.last_flash += dt

        if self.last_flash >= self.flash_interval:
            self.visible = not self.visible
            self.last_flash = 0.0

    def is_active(self) -> bool:
        """Check if telegraph is still active."""
        return self.remaining_time > 0


class TelegraphSystem:
    """Manages boss telegraphs with floor flashing."""

    def __init__(self, level: Level | None = None) -> None:
        """Initialize telegraph system."""
        self.level = level
        self.active_telegraphs: List[Telegraph] = []

    def add_dash_telegraph(
        self, start_pos: Tuple[float, float], end_pos: Tuple[float, float], duration: float
    ) -> Telegraph:
        """Add dash telegraph (line)."""
        dx = end_pos[0] - start_pos[0]
        dy = end_pos[1] - start_pos[1]
        length = math.sqrt(dx * dx + dy * dy)
        direction = (dx / length, dy / length) if length > 0 else (0.0, -1.0)

        telegraph = Telegraph(
            telegraph_type=TelegraphType.DASH,
            position=start_pos,
            direction=direction,
            duration=duration,
            remaining_time=duration,
            shape="line",
            shape_params={
                "start": start_pos,
                "end": end_pos,
                "width": 40.0,
            },
        )
        self.active_telegraphs.append(telegraph)
        return telegraph

    def add_slam_telegraph(
        self, center_pos: Tuple[float, float], direction: Tuple[float, float], duration: float
    ) -> Telegraph:
        """Add slam telegraph (cone)."""
        telegraph = Telegraph(
            telegraph_type=TelegraphType.SLAM,
            position=center_pos,
            direction=direction,
            duration=duration,
            remaining_time=duration,
            shape="cone",
            shape_params={
                "center": center_pos,
                "direction": direction,
                "angle": 120.0,  # degrees
                "range": 200.0,
            },
        )
        self.active_telegraphs.append(telegraph)
        return telegraph

    def add_summon_telegraph(self, position: Tuple[float, float], duration: float) -> Telegraph:
        """Add summon telegraph (circle)."""
        telegraph = Telegraph(
            telegraph_type=TelegraphType.SUMMON,
            position=position,
            direction=None,
            duration=duration,
            remaining_time=duration,
            shape="circle",
            shape_params={
                "center": position,
                "radius": 50.0,
            },
        )
        self.active_telegraphs.append(telegraph)
        return telegraph

    def update(self, dt: float) -> None:
        """Update all telegraphs."""
        for telegraph in self.active_telegraphs[:]:
            telegraph.update(dt)
            if not telegraph.is_active():
                self.active_telegraphs.remove(telegraph)

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0, tile_size: int = 32) -> None:
        """
        Render telegraphs on floor with flashing effect.
        
        Telegraphs are rendered with:
        - Red color for danger indication
        - Flashing effect (visible/invisible toggle every 0.1s)
        - Alpha fade based on remaining time (brighter = more time left)
        """
        for telegraph in self.active_telegraphs:
            if not telegraph.visible:
                continue

            # Bright red for danger, with pulsing alpha based on time remaining
            color = (255, 50, 50)  # Slightly softer red for better visibility
            # Alpha increases as time runs out (more visible = more urgent)
            alpha = int(200 + 55 * (telegraph.remaining_time / telegraph.duration))

            if telegraph.shape == "line":
                self._render_line_telegraph(screen, telegraph, color, alpha, camera_x, camera_y, tile_size)
            elif telegraph.shape == "cone":
                self._render_cone_telegraph(screen, telegraph, color, alpha, camera_x, camera_y, tile_size)
            elif telegraph.shape == "circle":
                self._render_circle_telegraph(screen, telegraph, color, alpha, camera_x, camera_y, tile_size)

    def _render_line_telegraph(
        self,
        screen: pygame.Surface,
        telegraph: Telegraph,
        color: Tuple[int, int, int],
        alpha: int,
        camera_x: int,
        camera_y: int,
        tile_size: int,
    ) -> None:
        """
        Render line telegraph (dash attack indicator).
        
        Draws a thick line from boss position to target position,
        indicating the dash path.
        """
        params = telegraph.shape_params
        start = params["start"]
        end = params["end"]
        width = params["width"]

        # Convert to screen coordinates
        start_x = int(start[0] - camera_x)
        start_y = int(start[1] - camera_y)
        end_x = int(end[0] - camera_x)
        end_y = int(end[1] - camera_y)

        # Create surface for alpha blending (allows transparency)
        overlay = pygame.Surface(screen.get_size(), pygame.SRCALPHA)
        # Draw thick line with alpha channel
        pygame.draw.line(overlay, (*color, alpha), (start_x, start_y), (end_x, end_y), int(width))
        screen.blit(overlay, (0, 0))

    def _render_cone_telegraph(
        self,
        screen: pygame.Surface,
        telegraph: Telegraph,
        color: Tuple[int, int, int],
        alpha: int,
        camera_x: int,
        camera_y: int,
        tile_size: int,
    ) -> None:
        """
        Render cone telegraph (slam attack indicator).
        
        Draws a cone-shaped polygon indicating the slam attack area.
        Cone extends from boss position in facing direction.
        """
        import math

        params = telegraph.shape_params
        center = params["center"]
        direction = params["direction"]
        angle = math.radians(params["angle"])  # Total cone angle in radians
        range_val = params["range"]

        center_x = int(center[0] - camera_x)
        center_y = int(center[1] - camera_y)

        # Calculate cone boundaries: half-angle on each side of direction
        base_angle = math.atan2(direction[1], direction[0])  # Boss facing direction
        start_angle = base_angle - angle / 2
        end_angle = base_angle + angle / 2

        # Build polygon points: center + arc points along cone edge
        points = [(center_x, center_y)]  # Start at boss position
        steps = 20  # Number of points along arc (more = smoother)
        for i in range(steps + 1):
            # Interpolate angle from start to end
            angle_val = start_angle + (end_angle - start_angle) * (i / steps)
            x = center_x + math.cos(angle_val) * range_val
            y = center_y + math.sin(angle_val) * range_val
            points.append((int(x), int(y)))

        # Draw filled polygon with alpha blending
        overlay = pygame.Surface(screen.get_size(), pygame.SRCALPHA)
        pygame.draw.polygon(overlay, (*color, alpha), points)
        screen.blit(overlay, (0, 0))

    def _render_circle_telegraph(
        self,
        screen: pygame.Surface,
        telegraph: Telegraph,
        color: Tuple[int, int, int],
        alpha: int,
        camera_x: int,
        camera_y: int,
        tile_size: int,
    ) -> None:
        """Render circle telegraph."""
        params = telegraph.shape_params
        center = params["center"]
        radius = params["radius"]

        center_x = int(center[0] - camera_x)
        center_y = int(center[1] - camera_y)

        overlay = pygame.Surface(screen.get_size(), pygame.SRCALPHA)
        pygame.draw.circle(overlay, (*color, alpha), (center_x, center_y), int(radius))
        screen.blit(overlay, (0, 0))

    def clear(self) -> None:
        """Clear all telegraphs."""
        self.active_telegraphs.clear()

