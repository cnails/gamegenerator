"""Inventory UI with weapon and consumable slots."""

from typing import Optional

import pygame

from game.core.assets import assets
from game.core.i18n import i18n
from game.ecs.components import Inventory, WeaponType
from game.ecs.entities import EntityManager


class InventoryUI:
    """Inventory display UI with weapon and consumable slots."""

    def __init__(self, entity_manager: EntityManager) -> None:
        """Initialize inventory UI."""
        self.entity_manager = entity_manager
        self.visible = False
        self.selected_section = "weapons"  # "weapons" or "consumables"
        self.selected_index = 0
        self.font = None
        self.font_small = None
        self.font_tiny = None

    def _get_fonts(self) -> None:
        """Load fonts."""
        if self.font is None:
            self.font = assets.load_font("default", 24)
            self.font_small = assets.load_font("default", 18)
            self.font_tiny = assets.load_font("default", 14)

    def toggle(self) -> None:
        """Toggle inventory visibility."""
        self.visible = not self.visible
        if self.visible:
            self.selected_section = "weapons"
            self.selected_index = 0

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if not self.visible:
            return

        if event.type == pygame.KEYDOWN:
            # Find player
            from game.ecs.components import Faction, FactionType
            players = self.entity_manager.get_entities_with(Faction, Inventory)
            players = [p for p in players if p.get_component(Faction).tag == FactionType.PLAYER]
            if not players:
                return

            inventory = players[0].get_component(Inventory)
            if not inventory:
                return

            if event.key == pygame.K_TAB:
                # Switch between sections
                self.selected_section = "consumables" if self.selected_section == "weapons" else "weapons"
                self.selected_index = 0
            elif event.key == pygame.K_UP or event.key == pygame.K_w:
                max_items = 3 if self.selected_section == "weapons" else 2
                self.selected_index = (self.selected_index - 1) % max_items
            elif event.key == pygame.K_DOWN or event.key == pygame.K_s:
                max_items = 3 if self.selected_section == "weapons" else 2
                self.selected_index = (self.selected_index + 1) % max_items
            elif event.key == pygame.K_RETURN or event.key == pygame.K_SPACE:
                if self.selected_section == "weapons":
                    # Switch active weapon
                    inventory.switch_weapon_slot(self.selected_index)
                elif self.selected_section == "consumables":
                    # Use consumable (handled by player controller)
                    pass

    def render(self, screen: pygame.Surface) -> None:
        """Render inventory."""
        if not self.visible:
            return

        self._get_fonts()

        # Find player
        from game.ecs.components import Faction, FactionType
        players = self.entity_manager.get_entities_with(Faction, Inventory)
        players = [p for p in players if p.get_component(Faction).tag == FactionType.PLAYER]
        if not players:
            return

        inventory = players[0].get_component(Inventory)
        if not inventory:
            return

        # Semi-transparent overlay
        overlay = pygame.Surface(screen.get_size())
        overlay.set_alpha(200)
        overlay.fill((0, 0, 0))
        screen.blit(overlay, (0, 0))

        # Inventory panel
        panel_width = 600
        panel_height = 500
        panel_x = (screen.get_width() - panel_width) // 2
        panel_y = (screen.get_height() - panel_height) // 2

        # Panel background
        pygame.draw.rect(screen, (40, 40, 60), (panel_x, panel_y, panel_width, panel_height))
        pygame.draw.rect(screen, (100, 100, 120), (panel_x, panel_y, panel_width, panel_height), 3)

        # Title
        title_text = i18n.get("inventory_title", "INVENTORY")
        title_surface = self.font.render(title_text, True, (255, 255, 255))
        title_rect = title_surface.get_rect(center=(panel_x + panel_width // 2, panel_y + 30))
        screen.blit(title_surface, title_rect)

        # Weapon slots section
        weapons_y = panel_y + 80
        weapons_label = i18n.get("inventory_weapons", "Weapons")
        label_surface = self.font_small.render(weapons_label, True, (200, 200, 200))
        screen.blit(label_surface, (panel_x + 20, weapons_y))

        slot_size = 80
        slot_spacing = 20
        start_x = panel_x + 20
        start_y = weapons_y + 35

        for i in range(3):
            slot_x = start_x + i * (slot_size + slot_spacing)
            slot_y = start_y

            # Slot background
            is_active = inventory.active_weapon_slot == i
            is_selected = self.selected_section == "weapons" and self.selected_index == i
            bg_color = (80, 80, 100) if is_active else (50, 50, 70)
            border_color = (255, 255, 0) if is_selected else ((100, 200, 100) if is_active else (100, 100, 120))

            pygame.draw.rect(screen, bg_color, (slot_x, slot_y, slot_size, slot_size))
            pygame.draw.rect(screen, border_color, (slot_x, slot_y, slot_size, slot_size), 3)

            # Weapon icon/name
            weapon = inventory.weapon_slots[i]
            if weapon:
                weapon_type = weapon.get("weapon_type", WeaponType.SWORD)
                weapon_names = {
                    WeaponType.SWORD: i18n.get("hud_weapon_sword", "Sword"),
                    WeaponType.SPEAR: i18n.get("hud_weapon_spear", "Spear"),
                    WeaponType.CROSSBOW: i18n.get("hud_weapon_crossbow", "Crossbow"),
                }
                weapon_name = weapon_names.get(weapon_type, "Weapon")
                name_surface = self.font_tiny.render(weapon_name, True, (255, 255, 255))
                name_rect = name_surface.get_rect(center=(slot_x + slot_size // 2, slot_y + slot_size // 2))
                screen.blit(name_surface, name_rect)

                # Active indicator
                if is_active:
                    active_text = "ACTIVE"
                    active_surface = self.font_tiny.render(active_text, True, (100, 255, 100))
                    active_rect = active_surface.get_rect(center=(slot_x + slot_size // 2, slot_y + slot_size - 12))
                    screen.blit(active_surface, active_rect)
            else:
                # Empty slot
                empty_text = "Empty"
                empty_surface = self.font_tiny.render(empty_text, True, (150, 150, 150))
                empty_rect = empty_surface.get_rect(center=(slot_x + slot_size // 2, slot_y + slot_size // 2))
                screen.blit(empty_surface, empty_rect)

            # Slot number
            num_text = str(i + 1)
            num_surface = self.font_tiny.render(num_text, True, (200, 200, 200))
            screen.blit(num_surface, (slot_x + 5, slot_y + 5))

        # Consumable slots section
        consumables_y = start_y + slot_size + 50
        consumables_label = i18n.get("inventory_consumables", "Consumables")
        label_surface = self.font_small.render(consumables_label, True, (200, 200, 200))
        screen.blit(label_surface, (panel_x + 20, consumables_y))

        consumable_start_y = consumables_y + 35
        for i in range(2):
            slot_x = start_x + i * (slot_size + slot_spacing)
            slot_y = consumable_start_y

            # Slot background
            is_selected = self.selected_section == "consumables" and self.selected_index == i
            bg_color = (50, 50, 70)
            border_color = (255, 255, 0) if is_selected else (100, 100, 120)

            pygame.draw.rect(screen, bg_color, (slot_x, slot_y, slot_size, slot_size))
            pygame.draw.rect(screen, border_color, (slot_x, slot_y, slot_size, slot_size), 3)

            # Consumable icon/name
            consumable, count = inventory.get_consumable(i)
            if consumable:
                # Potion icon (red flask)
                center_x = slot_x + slot_size // 2
                center_y = slot_y + slot_size // 2
                pygame.draw.circle(screen, (200, 0, 0), (center_x, center_y - 5), 15)
                pygame.draw.circle(screen, (255, 100, 100), (center_x, center_y - 5), 12)

                # Count
                if count > 0:
                    count_text = str(count)
                    count_surface = self.font_small.render(count_text, True, (255, 255, 255))
                    count_rect = count_surface.get_rect(center=(center_x, center_y + 15))
                    screen.blit(count_surface, count_rect)

                # Name
                consumable_name = consumable.get("name", "Potion")
                name_surface = self.font_tiny.render(consumable_name[:8], True, (255, 255, 255))
                name_rect = name_surface.get_rect(center=(center_x, slot_y + slot_size - 10))
                screen.blit(name_surface, name_rect)
            else:
                # Empty slot
                empty_text = "Empty"
                empty_surface = self.font_tiny.render(empty_text, True, (150, 150, 150))
                empty_rect = empty_surface.get_rect(center=(slot_x + slot_size // 2, slot_y + slot_size // 2))
                screen.blit(empty_surface, empty_rect)

            # Slot number/key hint
            key_text = f"{i + 1}" if i == 0 else f"{i + 1}"
            key_surface = self.font_tiny.render(key_text, True, (200, 200, 200))
            screen.blit(key_surface, (slot_x + 5, slot_y + 5))

        # Instructions
        inst_text = i18n.get("inventory_close", "Press I to close")
        inst_surface = self.font_small.render(inst_text, True, (150, 150, 150))
        screen.blit(inst_surface, (panel_x + 20, panel_y + panel_height - 30))

        # Section switch hint
        switch_text = "TAB: Switch sections"
        switch_surface = self.font_tiny.render(switch_text, True, (150, 150, 150))
        screen.blit(switch_surface, (panel_x + panel_width - 150, panel_y + panel_height - 30))
