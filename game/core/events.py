"""Event bus system for game events."""

from dataclasses import dataclass
from typing import Any, Callable, Dict, List

from pygame import event as pygame_event


@dataclass
class GameEvent:
    """Base game event."""

    event_type: str
    data: Dict[str, Any] | None = None


class EventBus:
    """Event bus for decoupled event handling."""

    def __init__(self) -> None:
        """Initialize event bus."""
        self._handlers: Dict[str, List[Callable[[GameEvent], None]]] = {}
        self._queue: List[GameEvent] = []

    def subscribe(self, event_type: str, handler: Callable[[GameEvent], None]) -> None:
        """Subscribe handler to event type."""
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    def unsubscribe(self, event_type: str, handler: Callable[[GameEvent], None]) -> None:
        """Unsubscribe handler from event type."""
        if event_type in self._handlers:
            try:
                self._handlers[event_type].remove(handler)
            except ValueError:
                pass

    def emit(self, event: GameEvent) -> None:
        """Emit event (queued for processing)."""
        self._queue.append(event)

    def process(self) -> None:
        """Process all queued events."""
        while self._queue:
            event = self._queue.pop(0)
            handlers = self._handlers.get(event.event_type, [])
            for handler in handlers:
                try:
                    handler(event)
                except Exception as e:
                    print(f"Error handling event {event.event_type}: {e}")

    def clear(self) -> None:
        """Clear all queued events."""
        self._queue.clear()


# Global event bus instance
event_bus = EventBus()

# Event type constants
EVENT_DAMAGE_TAKEN = "damage_taken"
EVENT_HEALED = "healed"
EVENT_XP_GAINED = "xp_gained"
EVENT_LEVEL_UP = "level_up"
EVENT_ITEM_PICKED_UP = "item_picked_up"
EVENT_ITEM_DROPPED = "item_dropped"
EVENT_ENEMY_KILLED = "enemy_killed"
EVENT_PLAYER_DIED = "player_died"
EVENT_VICTORY = "victory"
EVENT_DUNGEON_LEVEL_CHANGED = "dungeon_level_changed"

