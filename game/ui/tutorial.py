"""Tutorial/tooltips screen."""

import pygame

from game.core.assets import assets
from game.core.scenes import Scene


class TutorialScene(Scene):
    """Tutorial screen with tooltips."""

    def __init__(self) -> None:
        """Initialize tutorial scene."""
        super().__init__()
        self.font_title = None
        self.font_text = None
        self.font_key = None

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 36)
            self.font_text = assets.load_font("default", 20)
            self.font_key = assets.load_font("default", 18)

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_RETURN or event.key == pygame.K_SPACE or event.key == pygame.K_ESCAPE:
                self.next_scene = "main_menu"

    def update(self, dt: float) -> None:
        """Update tutorial."""
        pass

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render tutorial."""
        self._get_fonts()
        screen.fill((20, 20, 30))

        # Title
        title_text = "УПРАВЛЕНИЕ"
        title_surface = self.font_title.render(title_text, True, (255, 255, 255))
        title_rect = title_surface.get_rect(center=(screen.get_width() // 2, 50))
        screen.blit(title_surface, title_rect)

        y_offset = 120
        line_height = 35

        # Movement
        self._render_tooltip(
            screen,
            "Движение",
            "WASD / Стрелки",
            "Перемещение персонажа по диагонали с нормализацией",
            y_offset,
        )
        y_offset += line_height * 2

        # Dodge
        self._render_tooltip(
            screen,
            "Перекат/Рывок",
            "Shift",
            "Короткий инвулн, кулдаун 1.2с",
            y_offset,
        )
        y_offset += line_height * 2

        # Attack
        self._render_tooltip(
            screen,
            "Атака",
            "J",
            "Атака текущим оружием (буфер нажатий активен)",
            y_offset,
        )
        y_offset += line_height * 2

        # Weapon switching
        self._render_tooltip(
            screen,
            "Смена оружия",
            "Q / E",
            "Циклическое переключение между мечом, копьём и арбалетом",
            y_offset,
        )
        y_offset += line_height * 2

        # Weapons
        y_offset += 20
        weapons_title = self.font_text.render("Оружие:", True, (200, 200, 255))
        screen.blit(weapons_title, (screen.get_width() // 2 - 200, y_offset))
        y_offset += line_height

        self._render_weapon_info(
            screen,
            "Меч",
            "Swing-удар по дуге, радиус 60px",
            y_offset,
        )
        y_offset += line_height * 1.5

        self._render_weapon_info(
            screen,
            "Копьё",
            "Тычок вперёд, радиус 90px, пробивание 1 врага",
            y_offset,
        )
        y_offset += line_height * 1.5

        self._render_weapon_info(
            screen,
            "Арбалет",
            "Болт на расстояние, перезарядка 1.5с",
            y_offset,
        )
        y_offset += line_height * 2

        # Potion
        self._render_tooltip(
            screen,
            "Зелье лечения",
            "K",
            "Восстанавливает 50 HP, общий кулдаун 10с",
            y_offset,
        )
        y_offset += line_height * 2

        # Other controls
        y_offset += 20
        self._render_tooltip(
            screen,
            "Инвентарь",
            "I",
            "Открыть/закрыть инвентарь",
            y_offset,
        )
        y_offset += line_height * 2

        self._render_tooltip(
            screen,
            "Пауза",
            "ESC",
            "Приостановить игру",
            y_offset,
        )
        y_offset += line_height * 2

        # Boss fight tips
        y_offset += 20
        boss_title = self.font_text.render("Бой с боссом:", True, (255, 150, 150))
        screen.blit(boss_title, (screen.get_width() // 2 - 200, y_offset))
        y_offset += line_height

        self._render_weapon_info(
            screen,
            "Телеграфы",
            "Красные мигающие индикаторы показывают зону атаки босса",
            y_offset,
        )
        y_offset += line_height * 1.5

        self._render_weapon_info(
            screen,
            "Dash",
            "Линия от босса — уклоняйтесь в сторону",
            y_offset,
        )
        y_offset += line_height * 1.5

        self._render_weapon_info(
            screen,
            "Slam",
            "Конус впереди босса — отойдите назад или в сторону",
            y_offset,
        )
        y_offset += line_height * 1.5

        self._render_weapon_info(
            screen,
            "Summon",
            "Круг вокруг босса — скоро появятся враги",
            y_offset,
        )

        # Instructions
        inst_text = "Нажмите ENTER, SPACE или ESC для возврата"
        inst_surface = self.font_text.render(inst_text, True, (150, 150, 150))
        inst_rect = inst_surface.get_rect(center=(screen.get_width() // 2, screen.get_height() - 30))
        screen.blit(inst_surface, inst_rect)

    def _render_tooltip(
        self, screen: pygame.Surface, name: str, key: str, description: str, y: int
    ) -> None:
        """Render a tooltip line."""
        x = screen.get_width() // 2 - 300

        # Name
        name_surface = self.font_text.render(name + ":", True, (255, 255, 255))
        screen.blit(name_surface, (x, y))

        # Key (highlighted)
        key_surface = self.font_key.render(f"[{key}]", True, (255, 255, 0))
        screen.blit(key_surface, (x + 150, y))

        # Description
        desc_surface = self.font_text.render(description, True, (200, 200, 200))
        screen.blit(desc_surface, (x, y + 20))

    def _render_weapon_info(self, screen: pygame.Surface, name: str, description: str, y: int) -> None:
        """Render weapon info."""
        x = screen.get_width() // 2 - 200

        # Name
        name_surface = self.font_text.render(f"• {name}:", True, (150, 200, 255))
        screen.blit(name_surface, (x, y))

        # Description
        desc_surface = self.font_text.render(description, True, (180, 180, 180))
        screen.blit(desc_surface, (x + 80, y))

