"""Main game loop with fixed timestep and separate render."""

import time
from typing import Callable

import pygame

from game.core.scenes import SceneManager


class GameLoop:
    """Fixed timestep game loop with separate update and render."""

    def __init__(
        self,
        screen: pygame.Surface,
        scene_manager: SceneManager,
        fps: int = 60,
    ) -> None:
        """Initialize game loop."""
        self.screen = screen
        self.scene_manager = scene_manager
        self.fps = fps
        self.fixed_dt = 1.0 / fps  # Fixed timestep (1/60)
        self.running = False
        self.clock = pygame.time.Clock()
        self.accumulator = 0.0
        self.last_time = 0.0

    def run(self) -> None:
        """Run the game loop."""
        self.running = True
        self.last_time = time.time()

        while self.running:
            current_time = time.time()
            frame_time = current_time - self.last_time
            self.last_time = current_time

            # Cap frame time to avoid spiral of death
            frame_time = min(frame_time, 0.25)

            # Process events
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                self.scene_manager.handle_event(event)

            # Fixed timestep updates
            self.accumulator += frame_time
            update_count = 0
            max_updates = 5  # Prevent spiral of death

            while self.accumulator >= self.fixed_dt and update_count < max_updates:
                self.scene_manager.update(self.fixed_dt)
                self.accumulator -= self.fixed_dt
                update_count += 1

                if self.scene_manager.should_quit():
                    self.running = False
                    break

            # Interpolation factor for smooth rendering
            alpha = self.accumulator / self.fixed_dt

            # Render (separate from update)
            self.screen.fill((0, 0, 0))  # Clear screen
            self.scene_manager.render(self.screen, alpha)
            pygame.display.flip()

            # Maintain target FPS
            self.clock.tick(self.fps)
