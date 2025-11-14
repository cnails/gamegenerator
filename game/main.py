"""Main entry point for the game."""

import sys
from pathlib import Path

import pygame

from game.core.assets import assets
from game.core.loop import GameLoop
from game.core.scenes import SceneManager
from game.core.settings import GameSettings
from game.gameplay.scene import GameplayScene
from game.ui.menus import GameOverScene, MainMenuScene, PauseScene, SettingsScene, VictoryScene
from game.ui.tutorial import TutorialScene


def main() -> None:
    """Main game entry point."""
    # Initialize pygame
    pygame.init()
    pygame.mixer.init()

    # Load settings
    settings_path = Path("data/config/settings.json")
    settings = GameSettings.load(str(settings_path))
    if not settings_path.exists():
        settings.save(str(settings_path))
    
    # Initialize localization
    from game.core.i18n import i18n
    i18n.set_language(settings.language)

    # Create window with integer scaling
    base_width = settings.screen_width // settings.pixel_scale
    base_height = settings.screen_height // settings.pixel_scale

    screen = pygame.display.set_mode((settings.screen_width, settings.screen_height))
    pygame.display.set_caption("2D Roguelike")

    # Create scene manager
    scene_manager = SceneManager()

    # Register scenes
    scene_manager.register("main_menu", MainMenuScene())
    scene_manager.register("gameplay", GameplayScene(settings))
    scene_manager.register("pause", PauseScene(settings))
    scene_manager.register("settings", SettingsScene(settings))
    scene_manager.register("gameover", GameOverScene())
    scene_manager.register("victory", VictoryScene())
    scene_manager.register("tutorial", TutorialScene())

    # Start with main menu
    scene_manager.switch_to("main_menu")

    # Initialize default fonts
    assets.load_font("default", 24)
    assets.load_font("default", 18)
    assets.load_font("default", 14)

    # Create and run game loop
    game_loop = GameLoop(screen, scene_manager, fps=settings.fps)
    game_loop.run()

    # Cleanup
    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()

