"""Dungeon generation algorithms with BSP and room types."""

import random
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Set, Tuple

import pygame

from game.world.level import Level
from game.world.tiles import Tile, TileType


class RoomType(str, Enum):
    """Room type enumeration."""

    START = "start"
    COMBAT = "combat"  # Бои с волнами
    TREASURE = "treasure"  # Сокровищница
    SHOP = "shop"  # Магазин
    MINI_BOSS = "mini_boss"
    BOSS = "boss"


@dataclass
class Room:
    """Represents a room in the dungeon."""

    rect: pygame.Rect
    room_type: RoomType
    room_id: int
    connections: List[int] = None  # IDs of connected rooms
    doors: List[Tuple[int, int]] = None  # Door positions (x, y)

    def __post_init__(self) -> None:
        """Initialize connections and doors."""
        if self.connections is None:
            self.connections = []
        if self.doors is None:
            self.doors = []


class DungeonGenerator:
    """Generates dungeon levels using BSP or room+corridor method."""

    def __init__(
        self,
        width: int = 80,
        height: int = 60,
        tile_size: int = 64,
        min_rooms: int = 6,
        max_rooms: int = 12,
        use_bsp: bool = True,
    ) -> None:
        """Initialize dungeon generator.

        Args:
            width: Level width in tiles
            height: Level height in tiles
            tile_size: Size of each tile in pixels (for grid calculations)
            min_rooms: Minimum number of rooms
            max_rooms: Maximum number of rooms
            use_bsp: Use BSP algorithm (True) or room+corridor (False)
        """
        self.width = width
        self.height = height
        self.tile_size = tile_size
        self.min_rooms = min_rooms
        self.max_rooms = max_rooms
        self.use_bsp = use_bsp
        self.rooms: List[Room] = []
        self.room_graph: Dict[int, Set[int]] = {}  # Adjacency list

    def generate(self, seed: Optional[int] = None, floor_number: int = 1) -> Level:
        """Generate a dungeon level.

        Args:
            seed: Random seed
            floor_number: Current floor number (affects difficulty)

        Returns:
            Generated level
        """
        if seed is not None:
            random.seed(seed)

        level = Level(self.width, self.height)
        self.rooms.clear()
        self.room_graph.clear()

        if self.use_bsp:
            self._generate_bsp(level)
        else:
            self._generate_room_corridor(level)

        # Assign room types
        self._assign_room_types(floor_number)

        # Ensure connectivity with A*
        self._ensure_connectivity(level)

        # Place doors
        self._place_doors(level)

        # Store rooms in level
        level.rooms = [room.rect for room in self.rooms]
        level.room_data = self.rooms  # Store full room data

        return level

    def _generate_bsp(self, level: Level) -> None:
        """Generate dungeon using BSP (Binary Space Partitioning)."""
        # BSP tree node
        class BSPNode:
            def __init__(self, x: int, y: int, width: int, height: int) -> None:
                self.x = x
                self.y = y
                self.width = width
                self.height = height
                self.left: Optional[BSPNode] = None
                self.right: Optional[BSPNode] = None
                self.room: Optional[pygame.Rect] = None

        def split_node(node: BSPNode, min_size: int = 8) -> bool:
            """Split BSP node."""
            # Decide split direction
            split_horizontal = random.choice([True, False])

            # Check if we can split
            if split_horizontal:
                if node.height < min_size * 2:
                    return False
                split_pos = random.randint(min_size, node.height - min_size)
                node.left = BSPNode(node.x, node.y, node.width, split_pos)
                node.right = BSPNode(
                    node.x, node.y + split_pos, node.width, node.height - split_pos
                )
            else:
                if node.width < min_size * 2:
                    return False
                split_pos = random.randint(min_size, node.width - min_size)
                node.left = BSPNode(node.x, node.y, split_pos, node.height)
                node.right = BSPNode(
                    node.x + split_pos, node.y, node.width - split_pos, node.height
                )

            return True

        def create_rooms(node: BSPNode) -> None:
            """Create rooms in BSP leaf nodes."""
            if node.left is None and node.right is None:
                # Leaf node - create room
                room_width = random.randint(6, node.width - 2)
                room_height = random.randint(6, node.height - 2)
                room_x = node.x + random.randint(1, node.width - room_width - 1)
                room_y = node.y + random.randint(1, node.height - room_height - 1)

                node.room = pygame.Rect(room_x, room_y, room_width, room_height)
            else:
                if node.left:
                    create_rooms(node.left)
                if node.right:
                    create_rooms(node.right)

        def carve_rooms(node: BSPNode, level: Level) -> None:
            """Carve rooms and corridors."""
            if node.left is None and node.right is None:
                # Leaf - carve room
                if node.room:
                    self._carve_room(level, node.room)
                    room = Room(
                        rect=node.room,
                        room_type=RoomType.COMBAT,  # Temporary
                        room_id=len(self.rooms),
                    )
                    self.rooms.append(room)
                    self.room_graph[room.room_id] = set()
            else:
                # Internal node - carve corridors
                if node.left and node.right:
                    left_room = _get_room_from_node(node.left)
                    right_room = _get_room_from_node(node.right)

                    if left_room and right_room:
                        # Connect rooms
                        self._create_corridor(
                            level, left_room.center, right_room.center
                        )
                        # Add connection
                        left_id = self._find_room_id(left_room)
                        right_id = self._find_room_id(right_room)
                        if left_id is not None and right_id is not None:
                            self.room_graph[left_id].add(right_id)
                            self.room_graph[right_id].add(left_id)

                if node.left:
                    carve_rooms(node.left, level)
                if node.right:
                    carve_rooms(node.right, level)

        def _get_room_from_node(node: BSPNode) -> Optional[pygame.Rect]:
            """Get room rect from BSP node."""
            if node.left is None and node.right is None:
                return node.room
            if node.left:
                result = _get_room_from_node(node.left)
                if result:
                    return result
            if node.right:
                return _get_room_from_node(node.right)
            return None

        # Create root node
        root = BSPNode(1, 1, self.width - 2, self.height - 2)

        # Split recursively
        max_splits = 4
        nodes_to_split = [root]
        for _ in range(max_splits):
            next_nodes = []
            for node in nodes_to_split:
                if split_node(node):
                    next_nodes.extend([node.left, node.right])
            if not next_nodes:
                break
            nodes_to_split = next_nodes

        # Create rooms
        create_rooms(root)

        # Carve rooms and corridors
        carve_rooms(root, level)

    def _generate_room_corridor(self, level: Level) -> None:
        """Generate dungeon using room+corridor method."""
        num_rooms = random.randint(self.min_rooms, self.max_rooms)
        rooms_placed = []

        for i in range(num_rooms):
            attempts = 0
            placed = False

            while not placed and attempts < 50:
                room_width = random.randint(6, 12)
                room_height = random.randint(6, 12)
                x = random.randint(1, self.width - room_width - 1)
                y = random.randint(1, self.height - room_height - 1)

                room_rect = pygame.Rect(x, y, room_width, room_height)

                # Check for overlaps
                overlap = False
                for other_rect in rooms_placed:
                    # Add padding
                    padded = pygame.Rect(
                        other_rect.x - 2,
                        other_rect.y - 2,
                        other_rect.width + 4,
                        other_rect.height + 4,
                    )
                    if room_rect.colliderect(padded):
                        overlap = True
                        break

                if not overlap:
                    self._carve_room(level, room_rect)
                    room = Room(
                        rect=room_rect,
                        room_type=RoomType.COMBAT,  # Temporary
                        room_id=len(self.rooms),
                    )
                    self.rooms.append(room)
                    self.room_graph[room.room_id] = set()
                    rooms_placed.append(room_rect)
                    placed = True

                attempts += 1

        # Connect rooms (minimum spanning tree + some extra connections)
        self._connect_rooms_mst(level)

    def _connect_rooms_mst(self, level: Level) -> None:
        """Connect rooms using minimum spanning tree."""
        if len(self.rooms) < 2:
            return

        # Calculate distances between rooms
        edges: List[Tuple[int, int, float]] = []
        for i, room1 in enumerate(self.rooms):
            for j, room2 in enumerate(self.rooms[i + 1 :], i + 1):
                dist = (
                    (room1.rect.centerx - room2.rect.centerx) ** 2
                    + (room1.rect.centery - room2.rect.centery) ** 2
                ) ** 0.5
                edges.append((i, j, dist))

        # Sort by distance
        edges.sort(key=lambda x: x[2])

        # Kruskal's algorithm for MST
        parent = list(range(len(self.rooms)))

        def find(x: int) -> int:
            if parent[x] != x:
                parent[x] = find(parent[x])
            return parent[x]

        def union(x: int, y: int) -> None:
            px, py = find(x), find(y)
            if px != py:
                parent[px] = py

        # Build MST
        for i, j, _ in edges:
            if find(i) != find(j):
                union(i, j)
                # Create corridor
                self._create_corridor(
                    level,
                    self.rooms[i].rect.center,
                    self.rooms[j].rect.center,
                )
                self.room_graph[i].add(j)
                self.room_graph[j].add(i)

        # Add some extra connections for loops
        extra_connections = len(self.rooms) // 3
        for _ in range(extra_connections):
            if edges:
                i, j, _ = random.choice(edges)
                if j not in self.room_graph[i]:
                    self._create_corridor(
                        level,
                        self.rooms[i].rect.center,
                        self.rooms[j].rect.center,
                    )
                    self.room_graph[i].add(j)
                    self.room_graph[j].add(i)

    def _assign_room_types(self, floor_number: int) -> None:
        """Assign room types based on floor number."""
        if not self.rooms:
            return

        # First room is always start
        self.rooms[0].room_type = RoomType.START

        # Last room is boss on floor 3, otherwise mini-boss or combat
        if floor_number >= 3:
            self.rooms[-1].room_type = RoomType.BOSS
        elif floor_number >= 2:
            if random.random() < 0.5:
                self.rooms[-1].room_type = RoomType.MINI_BOSS
            else:
                self.rooms[-1].room_type = RoomType.COMBAT
        else:
            self.rooms[-1].room_type = RoomType.COMBAT

        # Assign other types
        remaining = self.rooms[1:-1] if len(self.rooms) > 2 else []
        random.shuffle(remaining)

        treasure_count = max(1, len(remaining) // 4)
        shop_count = max(0, len(remaining) // 6)

        for i, room in enumerate(remaining):
            if i < treasure_count:
                room.room_type = RoomType.TREASURE
            elif i < treasure_count + shop_count:
                room.room_type = RoomType.SHOP
            else:
                room.room_type = RoomType.COMBAT

    def _ensure_connectivity(self, level: Level) -> None:
        """Ensure all rooms are reachable using A* pathfinding."""
        if len(self.rooms) < 2:
            return

        # Check connectivity using BFS
        visited = set()
        queue = [0]  # Start from first room
        visited.add(0)

        while queue:
            current = queue.pop(0)
            for neighbor in self.room_graph.get(current, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        # If not all rooms are connected, add corridors
        unvisited = set(range(len(self.rooms))) - visited
        if unvisited:
            for room_id in unvisited:
                # Find closest connected room
                closest_id = None
                min_dist = float("inf")
                for connected_id in visited:
                    dist = (
                        (self.rooms[room_id].rect.centerx - self.rooms[connected_id].rect.centerx) ** 2
                        + (self.rooms[room_id].rect.centery - self.rooms[connected_id].rect.centery) ** 2
                    ) ** 0.5
                    if dist < min_dist:
                        min_dist = dist
                        closest_id = connected_id

                if closest_id is not None:
                    # Create corridor
                    self._create_corridor(
                        level,
                        self.rooms[room_id].rect.center,
                        self.rooms[closest_id].rect.center,
                    )
                    self.room_graph[room_id].add(closest_id)
                    self.room_graph[closest_id].add(room_id)
                    visited.add(room_id)

    def _place_doors(self, level: Level) -> None:
        """Place doors between connected rooms."""
        for room in self.rooms:
            for connected_id in self.room_graph.get(room.room_id, set()):
                connected_room = self.rooms[connected_id]
                # Find connection point (where corridor meets room)
                door_pos = self._find_door_position(room.rect, connected_room.rect)
                if door_pos:
                    room.doors.append(door_pos)
                    # Place door tile
                    level.set_tile(door_pos[0], door_pos[1], Tile(TileType.DOOR))

    def _find_door_position(
        self, room1: pygame.Rect, room2: pygame.Rect
    ) -> Optional[Tuple[int, int]]:
        """Find door position between two rooms."""
        # Find intersection of room boundaries
        # Simple approach: find closest points
        x1, y1 = room1.center
        x2, y2 = room2.center

        # Determine direction
        dx = x2 - x1
        dy = y2 - y1

        # Find edge point of room1
        if abs(dx) > abs(dy):
            # Horizontal connection
            edge_x = room1.right if dx > 0 else room1.left
            edge_y = room1.centery
        else:
            # Vertical connection
            edge_x = room1.centerx
            edge_y = room1.bottom if dy > 0 else room1.top

        return (edge_x, edge_y)

    def _carve_room(self, level: Level, room: pygame.Rect) -> None:
        """Carve a room in the level."""
        for y in range(room.top, room.bottom):
            for x in range(room.left, room.right):
                if 0 <= x < self.width and 0 <= y < self.height:
                    level.set_tile(x, y, Tile(TileType.FLOOR))

    def _create_corridor(
        self, level: Level, start: Tuple[int, int], end: Tuple[int, int]
    ) -> None:
        """Create corridor between two points."""
        x1, y1 = start
        x2, y2 = end

        # L-shaped corridor
        # Horizontal first
        for x in range(min(x1, x2), max(x1, x2) + 1):
            if 0 <= x < self.width and 0 <= y1 < self.height:
                level.set_tile(x, y1, Tile(TileType.FLOOR))

        # Then vertical
        for y in range(min(y1, y2), max(y1, y2) + 1):
            if 0 <= x2 < self.width and 0 <= y < self.height:
                level.set_tile(x2, y, Tile(TileType.FLOOR))

    def _find_room_id(self, rect: pygame.Rect) -> Optional[int]:
        """Find room ID by rect."""
        for room in self.rooms:
            if room.rect == rect:
                return room.room_id
        return None

    def get_room_at(self, x: int, y: int) -> Optional[Room]:
        """Get room at tile coordinates."""
        for room in self.rooms:
            if room.rect.collidepoint(x, y):
                return room
        return None

    def get_wave_spawns(self, room_id: int, floor_number: int) -> List[Tuple[int, int]]:
        """Get spawn positions for wave-based combat.

        Args:
            room_id: Room ID
            floor_number: Current floor number

        Returns:
            List of spawn positions (x, y) in tile coordinates
        """
        if room_id >= len(self.rooms):
            return []

        room = self.rooms[room_id]
        spawns = []

        # Density increases with floor
        density = 0.3 + (floor_number - 1) * 0.1
        num_spawns = max(3, int((room.rect.width * room.rect.height) * density))

        for _ in range(num_spawns):
            x = random.randint(room.rect.left + 1, room.rect.right - 1)
            y = random.randint(room.rect.top + 1, room.rect.bottom - 1)
            spawns.append((x, y))

        return spawns
