"""Confirmation dialogs."""

import pygame

from game.core.assets import assets
from game.core.i18n import i18n


class ConfirmDialog:
    """Confirmation dialog."""

    def __init__(self, title: str, message: str) -> None:
        """Initialize dialog."""
        self.title = title
        self.message = message
        self.visible = False
        self.result: bool | None = None  # None = not answered, True = yes, False = no
        self.selected_index = 0  # 0 = Yes, 1 = No
        self.font_title = None
        self.font_message = None
        self.font_button = None

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 32)
            self.font_message = assets.load_font("default", 20)
            self.font_button = assets.load_font("default", 24)

    def show(self) -> None:
        """Show dialog."""
        self.visible = True
        self.result = None
        self.selected_index = 0

    def hide(self) -> None:
        """Hide dialog."""
        self.visible = False
        self.result = None

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if not self.visible:
            return

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT or event.key == pygame.K_a:
                self.selected_index = 0
            elif event.key == pygame.K_RIGHT or event.key == pygame.K_d:
                self.selected_index = 1
            elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                self.result = self.selected_index == 0
                self.visible = False
            elif event.key == pygame.K_ESCAPE:
                self.result = False
                self.visible = False

    def render(self, screen: pygame.Surface) -> None:
        """Render dialog."""
        if not self.visible:
            return

        self._get_fonts()

        # Semi-transparent overlay
        overlay = pygame.Surface(screen.get_size())
        overlay.set_alpha(220)
        overlay.fill((0, 0, 0))
        screen.blit(overlay, (0, 0))

        # Dialog panel
        panel_width = 500
        panel_height = 250
        panel_x = (screen.get_width() - panel_width) // 2
        panel_y = (screen.get_height() - panel_height) // 2

        # Panel background
        pygame.draw.rect(screen, (40, 40, 60), (panel_x, panel_y, panel_width, panel_height))
        pygame.draw.rect(screen, (100, 100, 120), (panel_x, panel_y, panel_width, panel_height), 3)

        # Title
        title_surface = self.font_title.render(self.title, True, (255, 255, 255))
        title_rect = title_surface.get_rect(center=(panel_x + panel_width // 2, panel_y + 40))
        screen.blit(title_surface, title_rect)

        # Message
        message_surface = self.font_message.render(self.message, True, (200, 200, 200))
        message_rect = message_surface.get_rect(center=(panel_x + panel_width // 2, panel_y + 100))
        screen.blit(message_surface, message_rect)

        # Buttons
        button_width = 150
        button_height = 40
        button_y = panel_y + panel_height - 80
        button_spacing = 50

        # Yes button
        yes_x = panel_x + (panel_width - button_width * 2 - button_spacing) // 2
        yes_color = (255, 255, 0) if self.selected_index == 0 else (150, 150, 150)
        pygame.draw.rect(screen, (60, 60, 80), (yes_x, button_y, button_width, button_height))
        pygame.draw.rect(screen, yes_color, (yes_x, button_y, button_width, button_height), 2)
        yes_text = i18n.get("confirm_yes", "Yes")
        yes_surface = self.font_button.render(yes_text, True, yes_color)
        yes_rect = yes_surface.get_rect(center=(yes_x + button_width // 2, button_y + button_height // 2))
        screen.blit(yes_surface, yes_rect)

        # No button
        no_x = yes_x + button_width + button_spacing
        no_color = (255, 255, 0) if self.selected_index == 1 else (150, 150, 150)
        pygame.draw.rect(screen, (60, 60, 80), (no_x, button_y, button_width, button_height))
        pygame.draw.rect(screen, no_color, (no_x, button_y, button_width, button_height), 2)
        no_text = i18n.get("confirm_no", "No")
        no_surface = self.font_button.render(no_text, True, no_color)
        no_rect = no_surface.get_rect(center=(no_x + button_width // 2, button_y + button_height // 2))
        screen.blit(no_surface, no_rect)

        # Instructions
        inst_text = "LEFT/RIGHT: Select, ENTER: Confirm, ESC: Cancel"
        inst_surface = self.font_message.render(inst_text, True, (150, 150, 150))
        inst_rect = inst_surface.get_rect(center=(panel_x + panel_width // 2, panel_y + panel_height - 20))
        screen.blit(inst_surface, inst_rect)

