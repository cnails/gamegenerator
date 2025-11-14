"""Perk selection UI for level up."""

import pygame

from game.core.assets import assets
from game.core.i18n import i18n
from game.gameplay.perks import Perk, PerkRarity, roll_perks


class PerkSelectionUI:
    """UI for selecting perks on level up."""

    def __init__(self) -> None:
        """Initialize perk selection UI."""
        self.visible = False
        self.perks: list[Perk] = []
        self.selected_index = 0
        self.reroll_count = 0
        self.max_free_rerolls = 1
        self.reroll_cost = 50  # Gold cost for additional rerolls
        self.font_title = None
        self.font_perk = None
        self.font_small = None

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font_title is None:
            self.font_title = assets.load_font("default", 32)
            self.font_perk = assets.load_font("default", 20)
            self.font_small = assets.load_font("default", 16)

    def show(self, exclude: list[str] | None = None) -> None:
        """Show perk selection with 3 random perks."""
        self.perks = roll_perks(count=3, exclude=exclude)
        self.visible = True
        self.selected_index = 0

    def hide(self) -> None:
        """Hide perk selection."""
        self.visible = False
        self.perks = []
        self.selected_index = 0

    def reroll(self, player_inventory) -> bool:
        """Reroll perks. Returns True if successful."""
        # Check if can reroll
        if self.reroll_count < self.max_free_rerolls:
            # Free reroll
            self.perks = roll_perks(count=3, exclude=[p.id for p in self.perks])
            self.reroll_count += 1
            return True
        elif player_inventory and player_inventory.gold >= self.reroll_cost:
            # Paid reroll
            if player_inventory.spend_gold(self.reroll_cost):
                self.perks = roll_perks(count=3, exclude=[p.id for p in self.perks])
                self.reroll_count += 1
                return True
        return False

    def handle_event(self, event: pygame.event.Event, player_inventory) -> str | None:
        """Handle events. Returns selected perk ID or None."""
        if not self.visible:
            return None

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_LEFT or event.key == pygame.K_a:
                self.selected_index = (self.selected_index - 1) % len(self.perks)
            elif event.key == pygame.K_RIGHT or event.key == pygame.K_d:
                self.selected_index = (self.selected_index + 1) % len(self.perks)
            elif event.key == pygame.K_1:
                self.selected_index = 0
            elif event.key == pygame.K_2:
                if len(self.perks) > 1:
                    self.selected_index = 1
            elif event.key == pygame.K_3:
                if len(self.perks) > 2:
                    self.selected_index = 2
            elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                # Select perk
                if 0 <= self.selected_index < len(self.perks):
                    selected_perk = self.perks[self.selected_index]
                    self.hide()
                    return selected_perk.id
            elif event.key == pygame.K_r:
                # Reroll
                self.reroll(player_inventory)

        return None

    def render(self, screen: pygame.Surface) -> None:
        """Render perk selection UI."""
        if not self.visible:
            return

        self._get_fonts()
        current_lang = i18n.current_language

        # Semi-transparent overlay
        overlay = pygame.Surface(screen.get_size())
        overlay.set_alpha(220)
        overlay.fill((0, 0, 0))
        screen.blit(overlay, (0, 0))

        # Panel
        panel_width = 900
        panel_height = 500
        panel_x = (screen.get_width() - panel_width) // 2
        panel_y = (screen.get_height() - panel_height) // 2

        # Panel background
        pygame.draw.rect(screen, (30, 30, 50), (panel_x, panel_y, panel_width, panel_height))
        pygame.draw.rect(screen, (100, 100, 120), (panel_x, panel_y, panel_width, panel_height), 3)

        # Title
        title_text = "LEVEL UP!" if current_lang == "en" else "ПОВЫШЕНИЕ УРОВНЯ!"
        title_surface = self.font_title.render(title_text, True, (255, 255, 0))
        title_rect = title_surface.get_rect(center=(panel_x + panel_width // 2, panel_y + 40))
        screen.blit(title_surface, title_rect)

        # Subtitle
        subtitle_text = "Choose a perk:" if current_lang == "en" else "Выберите перк:"
        subtitle_surface = self.font_perk.render(subtitle_text, True, (200, 200, 200))
        subtitle_rect = subtitle_surface.get_rect(center=(panel_x + panel_width // 2, panel_y + 80))
        screen.blit(subtitle_surface, subtitle_rect)

        # Perk cards
        card_width = 250
        card_height = 350
        card_spacing = 30
        start_x = panel_x + (panel_width - (card_width * 3 + card_spacing * 2)) // 2
        card_y = panel_y + 120

        for i, perk in enumerate(self.perks):
            card_x = start_x + i * (card_width + card_spacing)
            is_selected = i == self.selected_index

            # Card background
            bg_color = (60, 60, 80) if is_selected else (40, 40, 60)
            border_color = self._get_rarity_color(perk.rarity)
            border_width = 4 if is_selected else 2

            pygame.draw.rect(screen, bg_color, (card_x, card_y, card_width, card_height))
            pygame.draw.rect(screen, border_color, (card_x, card_y, card_width, card_height), border_width)

            # Rarity indicator
            rarity_text = perk.rarity.value.upper()
            rarity_surface = self.font_small.render(rarity_text, True, border_color)
            screen.blit(rarity_surface, (card_x + 10, card_y + 10))

            # Perk name
            perk_name = perk.get_name(current_lang)
            name_surface = self.font_perk.render(perk_name, True, (255, 255, 255))
            name_rect = name_surface.get_rect(center=(card_x + card_width // 2, card_y + 50))
            screen.blit(name_surface, name_rect)

            # Category
            category_names = {
                "weapon": "Weapon" if current_lang == "en" else "Оружие",
                "survival": "Survival" if current_lang == "en" else "Выживание",
                "chivalry": "Chivalry" if current_lang == "en" else "Рыцарское искусство",
            }
            category_text = category_names.get(perk.category.value, "")
            category_surface = self.font_small.render(category_text, True, (150, 150, 150))
            screen.blit(category_surface, (card_x + 10, card_y + 70))

            # Description
            description = perk.get_description(current_lang)
            # Word wrap description
            words = description.split()
            lines = []
            current_line = ""
            for word in words:
                test_line = current_line + (" " if current_line else "") + word
                test_surface = self.font_small.render(test_line, True, (200, 200, 200))
                if test_surface.get_width() <= card_width - 20:
                    current_line = test_line
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)

            desc_y = card_y + 100
            for line in lines[:6]:  # Max 6 lines
                line_surface = self.font_small.render(line, True, (200, 200, 200))
                screen.blit(line_surface, (card_x + 10, desc_y))
                desc_y += 20

            # Selection indicator
            if is_selected:
                select_text = ">>> SELECTED <<<" if current_lang == "en" else ">>> ВЫБРАНО <<<"
                select_surface = self.font_small.render(select_text, True, (255, 255, 0))
                select_rect = select_surface.get_rect(center=(card_x + card_width // 2, card_y + card_height - 30))
                screen.blit(select_surface, select_rect)

            # Number key hint
            num_text = f"[{i + 1}]"
            num_surface = self.font_small.render(num_text, True, (150, 150, 150))
            screen.blit(num_surface, (card_x + card_width - 30, card_y + 10))

        # Instructions
        inst_y = panel_y + panel_height - 60
        instructions = [
            "LEFT/RIGHT or 1/2/3: Select perk",
            "ENTER: Confirm",
            f"R: Reroll ({self.max_free_rerolls - self.reroll_count} free, then {self.reroll_cost} gold)",
        ]
        if current_lang == "ru":
            instructions = [
                "ВЛЕВО/ВПРАВО или 1/2/3: Выбрать перк",
                "ENTER: Подтвердить",
                f"R: Реролл ({self.max_free_rerolls - self.reroll_count} бесплатно, затем {self.reroll_cost} золота)",
            ]

        for i, inst in enumerate(instructions):
            inst_surface = self.font_small.render(inst, True, (150, 150, 150))
            screen.blit(inst_surface, (panel_x + 20, inst_y + i * 20))

    def _get_rarity_color(self, rarity: PerkRarity) -> tuple[int, int, int]:
        """Get color for rarity."""
        colors = {
            PerkRarity.COMMON: (200, 200, 200),  # Gray
            PerkRarity.RARE: (100, 150, 255),  # Blue
            PerkRarity.EPIC: (200, 100, 255),  # Purple
        }
        return colors.get(rarity, (255, 255, 255))

