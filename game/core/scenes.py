"""Scene management system with stack support."""

from abc import ABC, abstractmethod
from typing import Any

import pygame

from game.core.events import event_bus


class Scene(ABC):
    """Base scene class."""

    def __init__(self) -> None:
        """Initialize scene."""
        self.next_scene: str | None = None
        self.should_quit = False
        self.paused = False

    @abstractmethod
    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle pygame event."""
        pass

    @abstractmethod
    def update(self, dt: float) -> None:
        """Update scene logic."""
        pass

    @abstractmethod
    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render scene. Alpha is interpolation factor for smooth rendering."""
        pass

    def on_enter(self) -> None:
        """Called when scene is entered."""
        pass

    def on_exit(self) -> None:
        """Called when scene is exited."""
        pass


class SceneManager:
    """Manages game scenes with stack support."""

    def __init__(self) -> None:
        """Initialize scene manager."""
        self.scenes: dict[str, Scene] = {}
        self.scene_stack: list[str] = []  # Stack of scene names

    def register(self, name: str, scene: Scene) -> None:
        """Register a scene."""
        self.scenes[name] = scene

    def push_scene(self, name: str) -> None:
        """Push a scene onto the stack (pause current, show new)."""
        if name not in self.scenes:
            print(f"Scene '{name}' not found")
            return

        # Pause current scene if exists
        if self.scene_stack:
            current_name = self.scene_stack[-1]
            current_scene = self.scenes[current_name]
            current_scene.paused = True

        # Push new scene
        self.scene_stack.append(name)
        new_scene = self.scenes[name]
        new_scene.on_enter()

    def pop_scene(self) -> None:
        """Pop current scene from stack (resume previous)."""
        if not self.scene_stack:
            return

        # Exit current scene
        current_name = self.scene_stack.pop()
        current_scene = self.scenes[current_name]
        current_scene.on_exit()
        current_scene.should_quit = False  # Reset flag for reuse

        # Resume previous scene if exists
        if self.scene_stack:
            previous_name = self.scene_stack[-1]
            previous_scene = self.scenes[previous_name]
            previous_scene.paused = False

    def switch_to(self, name: str) -> None:
        """Switch to a scene (clear stack, set new scene)."""
        if name not in self.scenes:
            print(f"Scene '{name}' not found")
            return

        # Exit all scenes
        for scene_name in self.scene_stack:
            self.scenes[scene_name].on_exit()

        # Clear stack and set new scene
        self.scene_stack.clear()
        self.scene_stack.append(name)
        self.scenes[name].on_enter()

    def get_current_scene(self) -> Scene | None:
        """Get current active scene."""
        if not self.scene_stack:
            return None
        return self.scenes.get(self.scene_stack[-1])

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle event for current scene."""
        current_scene = self.get_current_scene()
        if current_scene:
            current_scene.handle_event(event)

    def should_pop_scene(self) -> bool:
        """Check if current scene wants to be popped."""
        current_scene = self.get_current_scene()
        if not current_scene:
            return False
        # Only pop if there's more than one scene in stack
        # (if only one scene, should_quit means exit game)
        return current_scene.should_quit and len(self.scene_stack) > 1

    def update(self, dt: float) -> None:
        """Update current scene."""
        # Check if scene wants to be popped
        if self.should_pop_scene():
            self.pop_scene()
            return

        current_scene = self.get_current_scene()
        if current_scene and not current_scene.paused:
            current_scene.update(dt)
            if current_scene.next_scene:
                self.switch_to(current_scene.next_scene)
                current_scene.next_scene = None

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render current scene."""
        current_scene = self.get_current_scene()
        if current_scene:
            current_scene.render(screen, alpha)

    def should_quit(self) -> bool:
        """Check if game should quit."""
        current_scene = self.get_current_scene()
        if current_scene:
            return current_scene.should_quit
        return False
