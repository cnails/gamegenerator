"""Heads-up display with HP, XP, weapon, potion slots, cooldowns, perks, and minimap."""

import pygame

from game.core.assets import assets
from game.core.i18n import i18n
from game.ecs.components import (
    Experience,
    Faction,
    FactionType,
    Health,
    Inventory,
    SkillTree,
    StatusEffects,
    Transform,
    Weapon,
    WeaponType,
)
from game.ecs.entities import EntityManager
from game.world.level import Level


class HUD:
    """Heads-up display for gameplay."""

    def __init__(
        self,
        entity_manager: EntityManager,
        level: Level | None = None,
        player_controller=None,
    ) -> None:
        """Initialize HUD.

        Args:
            entity_manager: Entity manager
            level: Current level
            player_controller: Player controller for cooldown info
        """
        self.entity_manager = entity_manager
        self.level = level
        self.player_controller = player_controller
        self.font = None
        self.small_font = None
        self.tiny_font = None

    def _get_fonts(self) -> None:
        """Load fonts if not already loaded."""
        if self.font is None:
            self.font = assets.load_font("default", 24)
            self.small_font = assets.load_font("default", 18)
            self.tiny_font = assets.load_font("default", 14)

    def render(self, screen: pygame.Surface, camera_x: int = 0, camera_y: int = 0) -> None:
        """Render HUD."""
        self._get_fonts()

        # Find player
        players = self.entity_manager.get_entities_with(Faction, Health, Experience)
        player = None
        for p in players:
            faction = p.get_component(Faction)
            if faction and faction.tag == FactionType.PLAYER:
                player = p
                break

        if not player:
            return

        health = player.get_component(Health)
        exp = player.get_component(Experience)
        weapon = player.get_component(Weapon)
        inventory = player.get_component(Inventory)
        transform = player.get_component(Transform)
        skill_tree = player.get_component(SkillTree)

        if not health or not exp:
            return

        screen_width = screen.get_width()
        screen_height = screen.get_height()

        # Health bar (top left)
        self._render_health_bar(screen, health, 10, 10)

        # XP bar (below health)
        self._render_xp_bar(screen, exp, 10, 50)

        # Active weapon (top right)
        if weapon:
            self._render_weapon_info(screen, weapon, screen_width - 200, 10)

        # Consumable slots (below weapon)
        if inventory:
            self._render_consumable_slots(screen, inventory, screen_width - 200, 60)

        # Cooldown indicators (below consumables)
        if self.player_controller:
            self._render_cooldowns(screen, screen_width - 200, 120)

        # Perks (left side, below XP)
        if skill_tree:
            self._render_perks(screen, skill_tree, 10, 80)

        # Minimap (bottom right)
        if self.level and transform:
            self._render_minimap(screen, self.level, transform, screen_width - 150, screen_height - 150)

    def _render_health_bar(self, screen: pygame.Surface, health: Health, x: int, y: int) -> None:
        """Render health bar."""
        bar_width = 200
        bar_height = 24

        # Background
        pygame.draw.rect(screen, (50, 50, 50), (x, y, bar_width, bar_height))
        pygame.draw.rect(screen, (100, 100, 100), (x, y, bar_width, bar_height), 2)

        # Health fill
        health_percent = health.get_percentage()
        fill_width = int(bar_width * health_percent)

        # Color based on health percentage
        if health_percent < 0.3:
            color = (200, 0, 0)  # Red
        elif health_percent < 0.6:
            color = (255, 200, 0)  # Yellow
        else:
            color = (0, 200, 0)  # Green

        if fill_width > 0:
            pygame.draw.rect(screen, color, (x + 2, y + 2, fill_width - 4, bar_height - 4))

        # Health text
        hp_label = i18n.get("hud_hp", "HP")
        health_text = f"{health.hp}/{health.max_hp} {hp_label}"
        text_surface = self.font.render(health_text, True, (255, 255, 255))
        text_rect = text_surface.get_rect(center=(x + bar_width // 2, y + bar_height // 2))
        screen.blit(text_surface, text_rect)

    def _render_xp_bar(self, screen: pygame.Surface, exp: Experience, x: int, y: int) -> None:
        """Render XP bar."""
        bar_width = 200
        bar_height = 20

        # Background
        pygame.draw.rect(screen, (30, 30, 50), (x, y, bar_width, bar_height))
        pygame.draw.rect(screen, (80, 80, 120), (x, y, bar_width, bar_height), 2)

        # XP fill
        xp_percent = exp.get_xp_percentage()
        fill_width = int(bar_width * xp_percent)

        if fill_width > 0:
            pygame.draw.rect(screen, (100, 50, 200), (x + 2, y + 2, fill_width - 4, bar_height - 4))

        # XP text
        level_label = i18n.get("hud_level", "Lv.")
        xp_label = i18n.get("hud_xp", "XP")
        xp_text = f"{level_label}{exp.level} | {exp.xp}/{exp.next_xp} {xp_label}"
        text_surface = self.small_font.render(xp_text, True, (255, 255, 255))
        screen.blit(text_surface, (x + 5, y + 2))

    def _render_weapon_info(self, screen: pygame.Surface, weapon: Weapon, x: int, y: int) -> None:
        """Render active weapon info."""
        panel_width = 180
        panel_height = 50

        # Panel background
        pygame.draw.rect(screen, (40, 40, 60), (x, y, panel_width, panel_height))
        pygame.draw.rect(screen, (100, 100, 120), (x, y, panel_width, panel_height), 2)

        # Weapon icon placeholder
        icon_size = 32
        icon_x = x + 5
        icon_y = y + (panel_height - icon_size) // 2
        pygame.draw.rect(screen, (150, 150, 150), (icon_x, icon_y, icon_size, icon_size))
        pygame.draw.rect(screen, (200, 200, 200), (icon_x, icon_y, icon_size, icon_size), 2)

        # Weapon name
        weapon_names = {
            WeaponType.SWORD: i18n.get("hud_weapon_sword", "Sword"),
            WeaponType.SPEAR: i18n.get("hud_weapon_spear", "Spear"),
            WeaponType.CROSSBOW: i18n.get("hud_weapon_crossbow", "Crossbow"),
        }
        weapon_name = weapon_names.get(weapon.weapon_type, "Weapon")
        name_surface = self.small_font.render(weapon_name, True, (255, 255, 255))
        screen.blit(name_surface, (icon_x + icon_size + 10, icon_y))

        # Attack delay indicator
        cd_label = i18n.get("hud_cooldown", "CD")
        cooldown_text = f"{cd_label}: {weapon.attack_delay:.1f}s"
        cooldown_surface = self.tiny_font.render(cooldown_text, True, (200, 200, 200))
        screen.blit(cooldown_surface, (icon_x + icon_size + 10, icon_y + 18))

    def _render_consumable_slots(self, screen: pygame.Surface, inventory: Inventory, x: int, y: int) -> None:
        """Render consumable slots."""
        slot_size = 40
        slot_spacing = 10

        for i in range(2):
            slot_x = x + i * (slot_size + slot_spacing)
            slot_y = y

            # Slot background
            pygame.draw.rect(screen, (40, 40, 60), (slot_x, slot_y, slot_size, slot_size))
            pygame.draw.rect(screen, (100, 100, 120), (slot_x, slot_y, slot_size, slot_size), 2)

            # Get consumable
            consumable, count = inventory.get_consumable(i)

            if consumable and count > 0:
                # Potion icon (red flask)
                center_x = slot_x + slot_size // 2
                center_y = slot_y + slot_size // 2
                pygame.draw.circle(screen, (200, 0, 0), (center_x, center_y), 12)
                pygame.draw.circle(screen, (255, 100, 100), (center_x, center_y), 10)

                # Count
                if count > 1:
                    count_surface = self.tiny_font.render(str(count), True, (255, 255, 255))
                    count_rect = count_surface.get_rect(bottomright=(slot_x + slot_size - 2, slot_y + slot_size - 2))
                    screen.blit(count_surface, count_rect)
            else:
                # Empty slot indicator
                pygame.draw.line(
                    screen,
                    (100, 100, 100),
                    (slot_x + 5, slot_y + 5),
                    (slot_x + slot_size - 5, slot_y + slot_size - 5),
                    2,
                )

            # Key hint (1, 2)
            key_text = str(i + 1)
            key_surface = self.tiny_font.render(key_text, True, (150, 150, 150))
            screen.blit(key_surface, (slot_x + 5, slot_y + slot_size - 15))

    def _render_cooldowns(self, screen: pygame.Surface, x: int, y: int) -> None:
        """Render cooldown indicators."""
        if not self.player_controller or not self.player_controller.timer_manager:
            return

        cooldown_y = y
        cooldown_height = 20

        # Dash cooldown
        dash_cooldown = self.player_controller.timer_manager.get_cooldown("dodge")
        if dash_cooldown:
            self._render_cooldown_bar(
                screen, "Dash", dash_cooldown, x, cooldown_y, 180, cooldown_height, (100, 150, 255)
            )

        # Potion cooldown
        potion_cooldown = self.player_controller.timer_manager.get_cooldown("potion")
        if potion_cooldown:
            self._render_cooldown_bar(
                screen,
                "Potion",
                potion_cooldown,
                x,
                cooldown_y + cooldown_height + 5,
                180,
                cooldown_height,
                (255, 100, 100),
            )

    def _render_cooldown_bar(
        self,
        screen: pygame.Surface,
        name: str,
        cooldown,
        x: int,
        y: int,
        width: int,
        height: int,
        color: tuple[int, int, int],
    ) -> None:
        """Render a single cooldown bar."""
        # Background
        pygame.draw.rect(screen, (30, 30, 40), (x, y, width, height))
        pygame.draw.rect(screen, (80, 80, 100), (x, y, width, height), 1)

        # Cooldown fill
        progress = cooldown.get_progress()
        fill_width = int(width * progress)

        if fill_width > 0:
            pygame.draw.rect(screen, color, (x + 1, y + 1, fill_width - 2, height - 2))

        # Text
        remaining = cooldown.get_remaining()
        if remaining > 0:
            text = f"{name}: {remaining:.1f}s"
        else:
            text = f"{name}: Ready"
        text_surface = self.tiny_font.render(text, True, (255, 255, 255))
        screen.blit(text_surface, (x + 5, y + 2))

    def _render_perks(self, screen: pygame.Surface, skill_tree: SkillTree, x: int, y: int) -> None:
        """Render active perks."""
        if not skill_tree.unlocked_nodes:
            return

        # Perks label
        perks_label = i18n.get("hud_perks", "Perks")
        label_surface = self.small_font.render(perks_label, True, (200, 200, 200))
        screen.blit(label_surface, (x, y))

        # Perk icons/list
        perk_y = y + 25
        max_perks_to_show = 5
        for i, perk_id in enumerate(skill_tree.unlocked_nodes[:max_perks_to_show]):
            # Simple perk icon (colored square)
            icon_size = 24
            icon_x = x + i * (icon_size + 5)
            icon_y = perk_y

            # Color based on perk type
            color = (100, 200, 255) if "attack" in perk_id.lower() else (200, 100, 255)
            pygame.draw.rect(screen, color, (icon_x, icon_y, icon_size, icon_size))
            pygame.draw.rect(screen, (255, 255, 255), (icon_x, icon_y, icon_size, icon_size), 1)

            # Perk name (shortened)
            perk_name = perk_id[:3].upper()
            name_surface = self.tiny_font.render(perk_name, True, (255, 255, 255))
            name_rect = name_surface.get_rect(center=(icon_x + icon_size // 2, icon_y + icon_size // 2))
            screen.blit(name_surface, name_rect)

        # Show "+N more" if there are more perks
        if len(skill_tree.unlocked_nodes) > max_perks_to_show:
            more_text = f"+{len(skill_tree.unlocked_nodes) - max_perks_to_show}"
            more_surface = self.tiny_font.render(more_text, True, (150, 150, 150))
            screen.blit(more_surface, (x + max_perks_to_show * (icon_size + 5), perk_y))

    def _render_minimap(
        self, screen: pygame.Surface, level: Level, player_transform: Transform, x: int, y: int
    ) -> None:
        """Render minimap showing room layout, enemies, and player."""
        map_width = 140
        map_height = 140

        # Minimap background
        pygame.draw.rect(screen, (20, 20, 30), (x, y, map_width, map_height))
        pygame.draw.rect(screen, (80, 80, 100), (x, y, map_width, map_height), 2)

        # Scale factor
        scale_x = map_width / level.width if level.width > 0 else 1.0
        scale_y = map_height / level.height if level.height > 0 else 1.0

        # Draw rooms
        if level.rooms:
            for room in level.rooms:
                room_x = int(x + room.x * scale_x)
                room_y = int(y + room.y * scale_y)
                room_w = max(1, int(room.width * scale_x))
                room_h = max(1, int(room.height * scale_y))

                # Room fill
                pygame.draw.rect(screen, (50, 50, 70), (room_x, room_y, room_w, room_h))
                # Room border
                pygame.draw.rect(screen, (100, 100, 120), (room_x, room_y, room_w, room_h), 1)

        # Draw enemies (red dots)
        enemies = self.entity_manager.get_entities_with(Faction, Transform)
        for enemy in enemies:
            faction = enemy.get_component(Faction)
            transform = enemy.get_component(Transform)
            if faction and transform and faction.tag in (FactionType.ENEMY, FactionType.BOSS):
                enemy_tile_x = int(transform.x // 32)
                enemy_tile_y = int(transform.y // 32)
                enemy_map_x = int(x + enemy_tile_x * scale_x)
                enemy_map_y = int(y + enemy_tile_y * scale_y)
                color = (255, 0, 0) if faction.tag == FactionType.BOSS else (200, 50, 50)
                pygame.draw.circle(screen, color, (enemy_map_x, enemy_map_y), 2)

        # Draw player position (green dot)
        player_tile_x = int(player_transform.x // 32)
        player_tile_y = int(player_transform.y // 32)
        player_map_x = int(x + player_tile_x * scale_x)
        player_map_y = int(y + player_tile_y * scale_y)

        pygame.draw.circle(screen, (0, 255, 0), (player_map_x, player_map_y), 3)
        pygame.draw.circle(screen, (100, 255, 100), (player_map_x, player_map_y), 2)

        # Minimap label
        map_label = i18n.get("hud_map", "Map")
        label_surface = self.tiny_font.render(map_label, True, (200, 200, 200))
        screen.blit(label_surface, (x + 5, y - 15))
