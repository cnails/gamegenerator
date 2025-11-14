"""A* pathfinding for enemy movement."""

import heapq
from dataclasses import dataclass
from typing import List, Optional, Tuple

from game.world.level import Level


@dataclass
class Node:
    """A* node."""

    x: int
    y: int
    g: float = 0.0  # Cost from start
    h: float = 0.0  # Heuristic to goal
    parent: Optional["Node"] = None

    @property
    def f(self) -> float:
        """Total cost."""
        return self.g + self.h

    def __lt__(self, other: "Node") -> bool:
        """Comparison for heapq."""
        return self.f < other.f


class Pathfinder:
    """A* pathfinding implementation."""

    def __init__(self, level: Level, tile_size: int = 32) -> None:
        """Initialize pathfinder."""
        self.level = level
        self.tile_size = tile_size

    def heuristic(self, x1: int, y1: int, x2: int, y2: int) -> float:
        """Manhattan distance heuristic."""
        return abs(x1 - x2) + abs(y1 - y2)

    def get_neighbors(self, x: int, y: int) -> List[Tuple[int, int]]:
        """Get walkable neighbors."""
        neighbors = []
        directions = [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, 1), (1, -1), (-1, -1)]

        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            if self.level.is_walkable(nx, ny):
                neighbors.append((nx, ny))

        return neighbors

    def find_path(
        self, start_x: float, start_y: float, goal_x: float, goal_y: float
    ) -> List[Tuple[float, float]]:
        """
        Find path from start to goal using A* algorithm.
        
        Returns list of world coordinates representing the path.
        If no path found, returns direct line to goal.
        
        Algorithm:
        1. Convert world coords to tile coords
        2. Ensure start/goal are walkable (find nearest if not)
        3. A* search: open_set (priority queue), closed_set (visited)
        4. Reconstruct path by following parent pointers
        5. Convert back to world coordinates
        """
        # Convert world coordinates to tile coordinates
        start_tile_x = int(start_x // self.tile_size)
        start_tile_y = int(start_y // self.tile_size)
        goal_tile_x = int(goal_x // self.tile_size)
        goal_tile_y = int(goal_y // self.tile_size)

        # Check if goal is walkable, if not find nearest walkable tile
        if not self.level.is_walkable(goal_tile_x, goal_tile_y):
            goal_tile_x, goal_tile_y = self._find_nearest_walkable(goal_tile_x, goal_tile_y)

        if not self.level.is_walkable(start_tile_x, start_tile_y):
            start_tile_x, start_tile_y = self._find_nearest_walkable(start_tile_x, start_tile_y)

        # A* algorithm: open_set (nodes to explore), closed_set (visited nodes)
        open_set = []  # Priority queue (heapq)
        closed_set = set()  # Visited tiles

        start_node = Node(start_tile_x, start_tile_y)
        start_node.h = self.heuristic(start_tile_x, start_tile_y, goal_tile_x, goal_tile_y)
        heapq.heappush(open_set, start_node)

        while open_set:
            current = heapq.heappop(open_set)

            # Skip if already processed (duplicate in queue)
            if (current.x, current.y) in closed_set:
                continue

            closed_set.add((current.x, current.y))

            # Check if reached goal
            if current.x == goal_tile_x and current.y == goal_tile_y:
                # Reconstruct path by following parent pointers backwards
                path = []
                node = current
                while node:
                    # Convert tile coordinates to world coordinates (center of tile)
                    world_x = node.x * self.tile_size + self.tile_size // 2
                    world_y = node.y * self.tile_size + self.tile_size // 2
                    path.append((world_x, world_y))
                    node = node.parent
                path.reverse()  # Path was built backwards, reverse to get start->goal
                return path

            # Check neighbors (8-directional movement)
            for nx, ny in self.get_neighbors(current.x, current.y):
                if (nx, ny) in closed_set:
                    continue

                # Calculate movement cost (diagonal costs sqrt(2) ≈ 1.414)
                is_diagonal = abs(nx - current.x) + abs(ny - current.y) == 2
                cost = 1.414 if is_diagonal else 1.0

                # Create neighbor node with updated cost
                neighbor = Node(nx, ny, current.g + cost)
                neighbor.h = self.heuristic(nx, ny, goal_tile_x, goal_tile_y)
                neighbor.parent = current

                heapq.heappush(open_set, neighbor)

        # No path found, return direct path as fallback
        return [(goal_x, goal_y)]

    def _find_nearest_walkable(self, x: int, y: int, max_radius: int = 5) -> Tuple[int, int]:
        """Find nearest walkable tile."""
        for radius in range(1, max_radius + 1):
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    if abs(dx) + abs(dy) == radius:
                        nx, ny = x + dx, y + dy
                        if self.level.is_walkable(nx, ny):
                            return (nx, ny)
        return (x, y)  # Fallback

