"""Menu screens with localization and settings."""

import pygame

from game.core.assets import assets
from game.core.i18n import i18n
from game.core.scenes import Scene
from game.core.settings import GameSettings
from game.ui.dialogs import ConfirmDialog


class MainMenuScene(Scene):
    """Main menu scene."""

    def __init__(self) -> None:
        """Initialize main menu."""
        super().__init__()
        self.font_title = None
        self.font_menu = None
        self.selected_index = 0
        self.menu_items = [
            i18n.get("menu_start", "Start Game"),
            i18n.get("menu_tutorial", "Tutorial"),
            i18n.get("menu_settings", "Settings"),
            i18n.get("menu_quit", "Quit"),
        ]

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 48)
            self.font_menu = assets.load_font("default", 32)

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_UP or event.key == pygame.K_w:
                self.selected_index = (self.selected_index - 1) % len(self.menu_items)
            elif event.key == pygame.K_DOWN or event.key == pygame.K_s:
                self.selected_index = (self.selected_index + 1) % len(self.menu_items)
            elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                if self.selected_index == 0:
                    self.next_scene = "gameplay"
                elif self.selected_index == 1:
                    self.next_scene = "tutorial"
                elif self.selected_index == 2:
                    self.next_scene = "settings"
                elif self.selected_index == 3:
                    self.should_quit = True

    def update(self, dt: float) -> None:
        """Update menu."""
        pass

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render menu."""
        self._get_fonts()
        screen.fill((20, 20, 40))

        # Title
        title_text = "ROGUELIKE"
        title_surface = self.font_title.render(title_text, True, (255, 255, 255))
        title_rect = title_surface.get_rect(center=(screen.get_width() // 2, 150))
        screen.blit(title_surface, title_rect)

        # Menu items
        menu_y = 300
        for i, item in enumerate(self.menu_items):
            color = (255, 255, 0) if i == self.selected_index else (200, 200, 200)
            item_surface = self.font_menu.render(item, True, color)
            item_rect = item_surface.get_rect(center=(screen.get_width() // 2, menu_y + i * 60))
            screen.blit(item_surface, item_rect)


class PauseScene(Scene):
    """Pause menu scene with settings and exit options."""

    def __init__(self, settings: GameSettings) -> None:
        """Initialize pause menu."""
        super().__init__()
        self.settings = settings
        self.font_title = None
        self.font_menu = None
        self.selected_index = 0
        self.menu_items = [
            i18n.get("menu_resume", "Resume"),
            i18n.get("menu_settings_title", "Settings"),
            i18n.get("menu_exit_to_menu", "Exit to Menu"),
            i18n.get("menu_quit_game", "Quit Game"),
        ]
        self.exit_dialog = ConfirmDialog(
            i18n.get("confirm_exit_title", "Exit to Menu?"),
            i18n.get("confirm_exit_message", "Are you sure you want to exit?"),
        )
        self.showing_dialog = False

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 32)
            self.font_menu = assets.load_font("default", 24)

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if self.showing_dialog:
            self.exit_dialog.handle_event(event)
            if self.exit_dialog.result is not None:
                if self.exit_dialog.result:
                    # Exit confirmed
                    if self.selected_index == 2:  # Exit to menu
                        self.next_scene = "main_menu"
                    elif self.selected_index == 3:  # Quit game
                        self.should_quit = True
                self.showing_dialog = False
                self.exit_dialog.hide()
            return

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_ESCAPE:
                # Resume game
                self.should_quit = True  # Signal to pop scene
            elif event.key == pygame.K_UP or event.key == pygame.K_w:
                self.selected_index = (self.selected_index - 1) % len(self.menu_items)
            elif event.key == pygame.K_DOWN or event.key == pygame.K_s:
                self.selected_index = (self.selected_index + 1) % len(self.menu_items)
            elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                if self.selected_index == 0:
                    # Resume
                    self.should_quit = True
                elif self.selected_index == 1:
                    # Settings
                    self.next_scene = "settings"
                elif self.selected_index in (2, 3):
                    # Show confirmation dialog
                    self.showing_dialog = True
                    self.exit_dialog.show()

    def update(self, dt: float) -> None:
        """Update pause menu."""
        pass

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render pause menu."""
        self._get_fonts()

        # Semi-transparent overlay
        overlay = pygame.Surface(screen.get_size())
        overlay.set_alpha(180)
        overlay.fill((0, 0, 0))
        screen.blit(overlay, (0, 0))

        if self.showing_dialog:
            self.exit_dialog.render(screen)
            return

        # Pause text
        pause_text = i18n.get("menu_pause", "PAUSED")
        pause_surface = self.font_title.render(pause_text, True, (255, 255, 255))
        pause_rect = pause_surface.get_rect(center=(screen.get_width() // 2, 150))
        screen.blit(pause_surface, pause_rect)

        # Menu items
        menu_y = 250
        for i, item in enumerate(self.menu_items):
            color = (255, 255, 0) if i == self.selected_index else (200, 200, 200)
            item_surface = self.font_menu.render(item, True, color)
            item_rect = item_surface.get_rect(center=(screen.get_width() // 2, menu_y + i * 50))
            screen.blit(item_surface, item_rect)


class SettingsScene(Scene):
    """Settings menu scene."""

    def __init__(self, settings: GameSettings) -> None:
        """Initialize settings scene."""
        super().__init__()
        self.settings = settings
        self.font_title = None
        self.font_menu = None
        self.selected_section = "audio"  # "audio", "controls", "language"
        self.selected_index = 0
        self.audio_items = [
            i18n.get("settings_master_volume", "Master Volume"),
            i18n.get("settings_sfx_volume", "SFX Volume"),
            i18n.get("settings_music_volume", "Music Volume"),
        ]
        self.controls_items = [
            i18n.get("settings_controls", "Controls"),
        ]
        self.language_items = ["English", "Русский"]

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 32)
            self.font_menu = assets.load_font("default", 24)

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_TAB:
                # Switch sections
                sections = ["audio", "controls", "language"]
                current_idx = sections.index(self.selected_section)
                self.selected_section = sections[(current_idx + 1) % len(sections)]
                self.selected_index = 0
            elif event.key == pygame.K_ESCAPE:
                self.next_scene = "main_menu"
            elif event.key == pygame.K_LEFT or event.key == pygame.K_a:
                self._adjust_setting(-1)
            elif event.key == pygame.K_RIGHT or event.key == pygame.K_d:
                self._adjust_setting(1)
            elif event.key == pygame.K_UP or event.key == pygame.K_w:
                max_items = self._get_max_items()
                self.selected_index = (self.selected_index - 1) % max_items
            elif event.key == pygame.K_DOWN or event.key == pygame.K_s:
                max_items = self._get_max_items()
                self.selected_index = (self.selected_index + 1) % max_items
            elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                if self.selected_section == "language":
                    # Toggle language
                    current_lang = i18n.current_language
                    new_lang = "ru" if current_lang == "en" else "en"
                    i18n.set_language(new_lang)
                    self.settings.language = new_lang
                    self.settings.save()
                    # Reload menu items
                    self._reload_menu_items()

    def _get_max_items(self) -> int:
        """Get max items for current section."""
        if self.selected_section == "audio":
            return len(self.audio_items)
        elif self.selected_section == "controls":
            return len(self.controls_items)
        elif self.selected_section == "language":
            return len(self.language_items)
        return 1

    def _adjust_setting(self, direction: int) -> None:
        """Adjust current setting."""
        if self.selected_section == "audio":
            step = 0.1 * direction
            if self.selected_index == 0:
                self.settings.volume_master = max(0.0, min(1.0, self.settings.volume_master + step))
            elif self.selected_index == 1:
                self.settings.volume_sfx = max(0.0, min(1.0, self.settings.volume_sfx + step))
            elif self.selected_index == 2:
                self.settings.volume_music = max(0.0, min(1.0, self.settings.volume_music + step))
            self.settings.save()

    def _reload_menu_items(self) -> None:
        """Reload menu items with new language."""
        self.audio_items = [
            i18n.get("settings_master_volume", "Master Volume"),
            i18n.get("settings_sfx_volume", "SFX Volume"),
            i18n.get("settings_music_volume", "Music Volume"),
        ]

    def update(self, dt: float) -> None:
        """Update settings scene."""
        pass

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render settings."""
        self._get_fonts()
        screen.fill((20, 20, 40))

        # Title
        title_text = i18n.get("menu_settings_title", "Settings")
        title_surface = self.font_title.render(title_text, True, (255, 255, 255))
        title_rect = title_surface.get_rect(center=(screen.get_width() // 2, 50))
        screen.blit(title_surface, title_rect)

        # Sections
        sections = [
            (i18n.get("settings_audio", "Audio"), "audio"),
            (i18n.get("settings_controls", "Controls"), "controls"),
            (i18n.get("settings_language", "Language"), "language"),
        ]

        section_y = 150
        for i, (section_name, section_id) in enumerate(sections):
            color = (255, 255, 0) if section_id == self.selected_section else (150, 150, 150)
            section_surface = self.font_menu.render(section_name, True, color)
            screen.blit(section_surface, (50, section_y + i * 40))

        # Settings for current section
        settings_y = 300
        if self.selected_section == "audio":
            for i, item in enumerate(self.audio_items):
                color = (255, 255, 0) if i == self.selected_index else (200, 200, 200)
                item_surface = self.font_menu.render(item, True, color)
                screen.blit(item_surface, (100, settings_y + i * 40))

                # Value
                if i == 0:
                    value = f"{int(self.settings.volume_master * 100)}%"
                elif i == 1:
                    value = f"{int(self.settings.volume_sfx * 100)}%"
                else:
                    value = f"{int(self.settings.volume_music * 100)}%"
                value_surface = self.font_menu.render(value, True, color)
                screen.blit(value_surface, (400, settings_y + i * 40))

        elif self.selected_section == "language":
            for i, lang in enumerate(self.language_items):
                color = (255, 255, 0) if i == self.selected_index else (200, 200, 200)
                is_current = (i == 0 and i18n.current_language == "en") or (
                    i == 1 and i18n.current_language == "ru"
                )
                prefix = "> " if is_current else "  "
                lang_surface = self.font_menu.render(prefix + lang, True, color)
                screen.blit(lang_surface, (100, settings_y + i * 40))

        # Instructions
        inst_text = "TAB: Switch sections, LEFT/RIGHT: Adjust, ESC: Back"
        inst_surface = self.font_menu.render(inst_text, True, (150, 150, 150))
        screen.blit(inst_surface, (50, screen.get_height() - 50))


class GameOverScene(Scene):
    """Game over scene with statistics."""

    def __init__(self) -> None:
        """Initialize game over scene."""
        super().__init__()
        self.font_title = None
        self.font_stats = None
        self.font_menu = None

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 48)
            self.font_stats = assets.load_font("default", 20)
            self.font_menu = assets.load_font("default", 24)

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                self.next_scene = "main_menu"
            elif event.key == pygame.K_ESCAPE:
                self.should_quit = True

    def update(self, dt: float) -> None:
        """Update game over scene."""
        pass

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render game over scene with statistics."""
        self._get_fonts()
        screen.fill((40, 20, 20))

        from game.gameplay.stats import game_stats
        import time

        # Update end time if not set
        if game_stats.end_time == 0:
            game_stats.end_time = time.time()

        # Game Over text
        title_text = i18n.get("gameover_title", "GAME OVER")
        title_surface = self.font_title.render(title_text, True, (255, 0, 0))
        title_rect = title_surface.get_rect(center=(screen.get_width() // 2, 100))
        screen.blit(title_surface, title_rect)

        # Statistics
        stats_y = 200
        stats = [
            (i18n.get("stats_time", "Time"), game_stats.format_time()),
            (i18n.get("stats_kills", "Kills"), str(game_stats.kills)),
            (
                i18n.get("stats_damage_sword", "Sword Damage"),
                str(game_stats.damage_by_weapon.get("sword", 0)),
            ),
            (
                i18n.get("stats_damage_spear", "Spear Damage"),
                str(game_stats.damage_by_weapon.get("spear", 0)),
            ),
            (
                i18n.get("stats_damage_crossbow", "Crossbow Damage"),
                str(game_stats.damage_by_weapon.get("crossbow", 0)),
            ),
            (i18n.get("stats_total_damage", "Total Damage"), str(game_stats.total_damage)),
        ]

        for i, (label, value) in enumerate(stats):
            label_surface = self.font_stats.render(f"{label}:", True, (200, 200, 200))
            value_surface = self.font_stats.render(value, True, (255, 255, 255))
            screen.blit(label_surface, (screen.get_width() // 2 - 200, stats_y + i * 30))
            screen.blit(value_surface, (screen.get_width() // 2 + 50, stats_y + i * 30))

        # Instructions
        inst_text = i18n.get("stats_return_menu", "Press ENTER to return to menu")
        inst_surface = self.font_menu.render(inst_text, True, (200, 200, 200))
        inst_rect = inst_surface.get_rect(center=(screen.get_width() // 2, screen.get_height() - 50))
        screen.blit(inst_surface, inst_rect)


class VictoryScene(Scene):
    """Victory scene with statistics."""

    def __init__(self) -> None:
        """Initialize victory scene."""
        super().__init__()
        self.font_title = None
        self.font_stats = None
        self.font_menu = None

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 48)
            self.font_stats = assets.load_font("default", 20)
            self.font_menu = assets.load_font("default", 24)

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                self.next_scene = "main_menu"
            elif event.key == pygame.K_ESCAPE:
                self.should_quit = True

    def update(self, dt: float) -> None:
        """Update victory scene."""
        pass

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render victory scene with statistics."""
        self._get_fonts()
        screen.fill((20, 40, 20))

        from game.gameplay.stats import game_stats
        import time

        # Update end time if not set
        if game_stats.end_time == 0:
            game_stats.end_time = time.time()

        # Victory text
        title_text = i18n.get("victory_title", "VICTORY!")
        title_surface = self.font_title.render(title_text, True, (0, 255, 0))
        title_rect = title_surface.get_rect(center=(screen.get_width() // 2, 100))
        screen.blit(title_surface, title_rect)

        # Statistics
        stats_y = 200
        stats = [
            (i18n.get("stats_time", "Time"), game_stats.format_time()),
            (i18n.get("stats_kills", "Kills"), str(game_stats.kills)),
            (
                i18n.get("stats_damage_sword", "Sword Damage"),
                str(game_stats.damage_by_weapon.get("sword", 0)),
            ),
            (
                i18n.get("stats_damage_spear", "Spear Damage"),
                str(game_stats.damage_by_weapon.get("spear", 0)),
            ),
            (
                i18n.get("stats_damage_crossbow", "Crossbow Damage"),
                str(game_stats.damage_by_weapon.get("crossbow", 0)),
            ),
            (i18n.get("stats_total_damage", "Total Damage"), str(game_stats.total_damage)),
        ]

        for i, (label, value) in enumerate(stats):
            label_surface = self.font_stats.render(f"{label}:", True, (200, 200, 200))
            value_surface = self.font_stats.render(value, True, (255, 255, 255))
            screen.blit(label_surface, (screen.get_width() // 2 - 200, stats_y + i * 30))
            screen.blit(value_surface, (screen.get_width() // 2 + 50, stats_y + i * 30))

        # Instructions
        inst_text = i18n.get("stats_return_menu", "Press ENTER to return to menu")
        inst_surface = self.font_menu.render(inst_text, True, (200, 200, 200))
        inst_rect = inst_surface.get_rect(center=(screen.get_width() // 2, screen.get_height() - 50))
        screen.blit(inst_surface, inst_rect)
