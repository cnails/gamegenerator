"""Precise hitbox system for melee attacks and projectiles."""

import math
from dataclasses import dataclass
from typing import List, Optional, Tuple

import pygame

from game.ecs.components import Collider, Transform


@dataclass
class ArcHitbox:
    """Arc/sector hitbox for melee attacks."""

    center: Tuple[float, float]
    radius: float
    start_angle: float  # radians
    arc_angle: float  # radians
    start_frame: int
    end_frame: int
    current_frame: int = 0

    def check_point(self, point: Tuple[float, float]) -> bool:
        """Check if point is inside arc."""
        dx = point[0] - self.center[0]
        dy = point[1] - self.center[1]
        distance = math.sqrt(dx * dx + dy * dy)

        if distance > self.radius:
            return False

        if distance == 0:
            return True

        angle = math.atan2(dy, dx)
        angle_diff = angle - self.start_angle

        # Normalize angle difference
        while angle_diff > math.pi:
            angle_diff -= 2 * math.pi
        while angle_diff < -math.pi:
            angle_diff += 2 * math.pi

        return abs(angle_diff) <= self.arc_angle / 2

    def check_entity(self, entity_transform: Transform, entity_collider: Collider) -> bool:
        """Check if entity collides with arc."""
        # Check center point
        if self.check_point((entity_transform.x, entity_transform.y)):
            return True

        # Check corners of collider
        rect = entity_collider.get_rect(entity_transform)
        corners = [
            (rect.left, rect.top),
            (rect.right, rect.top),
            (rect.right, rect.bottom),
            (rect.left, rect.bottom),
        ]

        for corner in corners:
            if self.check_point(corner):
                return True

        return False

    def is_active(self) -> bool:
        """Check if hitbox is in active damage frame."""
        return self.start_frame <= self.current_frame <= self.end_frame


@dataclass
class LineHitbox:
    """Line/cone hitbox for thrust attacks."""

    start: Tuple[float, float]
    end: Tuple[float, float]
    width: float  # Width of the line (for cone)
    start_frame: int
    end_frame: int
    current_frame: int = 0

    def check_point(self, point: Tuple[float, float]) -> bool:
        """Check if point is inside line hitbox."""
        # Vector from start to end
        line_dx = self.end[0] - self.start[0]
        line_dy = self.end[1] - self.start[1]
        line_length = math.sqrt(line_dx * line_dx + line_dy * line_dy)

        if line_length == 0:
            return False

        # Vector from start to point
        point_dx = point[0] - self.start[0]
        point_dy = point[1] - self.start[1]

        # Project point onto line
        t = (point_dx * line_dx + point_dy * line_dy) / (line_length * line_length)

        # Check if projection is within line segment
        if t < 0 or t > 1:
            return False

        # Find closest point on line
        closest_x = self.start[0] + t * line_dx
        closest_y = self.start[1] + t * line_dy

        # Check distance from point to line
        dist_dx = point[0] - closest_x
        dist_dy = point[1] - closest_y
        distance = math.sqrt(dist_dx * dist_dx + dist_dy * dist_dy)

        return distance <= self.width / 2

    def check_entity(self, entity_transform: Transform, entity_collider: Collider) -> bool:
        """Check if entity collides with line."""
        # Check center point
        if self.check_point((entity_transform.x, entity_transform.y)):
            return True

        # Check corners
        rect = entity_collider.get_rect(entity_transform)
        corners = [
            (rect.left, rect.top),
            (rect.right, rect.top),
            (rect.right, rect.bottom),
            (rect.left, rect.bottom),
        ]

        for corner in corners:
            if self.check_point(corner):
                return True

        return False

    def is_active(self) -> bool:
        """Check if hitbox is in active damage frame."""
        return self.start_frame <= self.current_frame <= self.end_frame


@dataclass
class ProjectileHitbox:
    """Hitbox for projectiles (capsule, rectangle, or ray)."""

    position: Tuple[float, float]
    direction: Tuple[float, float]
    hitbox_type: str  # "capsule", "rectangle", "ray"
    width: float
    height: float
    speed: float

    def check_point(self, point: Tuple[float, float]) -> bool:
        """Check if point intersects with projectile hitbox."""
        dx = point[0] - self.position[0]
        dy = point[1] - self.position[1]
        distance = math.sqrt(dx * dx + dy * dy)

        if self.hitbox_type == "capsule":
            # Capsule: circle at each end + rectangle in middle
            radius = min(self.width, self.height) / 2
            if distance <= radius:
                return True

            # Check distance to line segment (simplified)
            return distance <= self.width / 2

        elif self.hitbox_type == "rectangle":
            # Rectangle hitbox
            return abs(dx) <= self.width / 2 and abs(dy) <= self.height / 2

        elif self.hitbox_type == "ray":
            # Ray: very thin line
            return distance <= 2.0  # 2 pixel tolerance

        return False

    def check_entity(self, entity_transform: Transform, entity_collider: Collider) -> bool:
        """Check if entity collides with projectile."""
        # Check center point
        if self.check_point((entity_transform.x, entity_transform.y)):
            return True

        # Check corners
        rect = entity_collider.get_rect(entity_transform)
        corners = [
            (rect.left, rect.top),
            (rect.right, rect.top),
            (rect.right, rect.bottom),
            (rect.left, rect.bottom),
        ]

        for corner in corners:
            if self.check_point(corner):
                return True

        return False


class HitboxManager:
    """Manages active hitboxes for frame-based damage windows."""

    def __init__(self) -> None:
        """Initialize hitbox manager."""
        self.active_hitboxes: List[ArcHitbox | LineHitbox] = []
        self.frame_counter = 0

    def add_arc_hitbox(
        self,
        center: Tuple[float, float],
        radius: float,
        start_angle: float,
        arc_angle: float,
        start_frame: int,
        end_frame: int,
    ) -> ArcHitbox:
        """Add arc hitbox."""
        hitbox = ArcHitbox(
            center=center,
            radius=radius,
            start_angle=start_angle,
            arc_angle=arc_angle,
            start_frame=start_frame,
            end_frame=end_frame,
            current_frame=0,
        )
        self.active_hitboxes.append(hitbox)
        return hitbox

    def add_line_hitbox(
        self,
        start: Tuple[float, float],
        end: Tuple[float, float],
        width: float,
        start_frame: int,
        end_frame: int,
    ) -> LineHitbox:
        """Add line hitbox."""
        hitbox = LineHitbox(
            start=start,
            end=end,
            width=width,
            start_frame=start_frame,
            end_frame=end_frame,
            current_frame=0,
        )
        self.active_hitboxes.append(hitbox)
        return hitbox

    def update(self) -> None:
        """Update hitbox frames."""
        self.frame_counter += 1
        expired = []

        for hitbox in self.active_hitboxes:
            hitbox.current_frame = self.frame_counter
            if hitbox.current_frame > hitbox.end_frame:
                expired.append(hitbox)

        for hitbox in expired:
            self.active_hitboxes.remove(hitbox)

    def check_hits(
        self, attacker_id: int, entity_manager, exclude_ids: Optional[List[int]] = None
    ) -> List[int]:
        """Check for hits with active hitboxes. Returns list of hit entity IDs."""
        if exclude_ids is None:
            exclude_ids = []

        hit_entities = []

        for hitbox in self.active_hitboxes:
            if not hitbox.is_active():
                continue

            for entity_id, entity in entity_manager.entities.items():
                if entity_id == attacker_id or entity_id in exclude_ids or entity_id in hit_entities:
                    continue

                transform = entity.get_component(Transform)
                collider = entity.get_component(Collider)

                if not transform or not collider:
                    continue

                # Check collision
                if isinstance(hitbox, ArcHitbox):
                    if hitbox.check_entity(transform, collider):
                        hit_entities.append(entity_id)
                elif isinstance(hitbox, LineHitbox):
                    if hitbox.check_entity(transform, collider):
                        hit_entities.append(entity_id)

        return hit_entities

    def clear(self) -> None:
        """Clear all active hitboxes."""
        self.active_hitboxes.clear()
        self.frame_counter = 0

