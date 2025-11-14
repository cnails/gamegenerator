"""Gameplay scene."""

import random
from typing import Optional

import pygame

from game.core.events import EVENT_ENEMY_KILLED, EVENT_LEVEL_UP, EVENT_PLAYER_DIED, EVENT_VICTORY, event_bus, GameEvent
from game.core.scenes import Scene
from game.core.settings import GameSettings
from game.ecs.components import Collider, Enemy, Experience, Inventory, SkillTree, Transform
from game.ecs.entities import EntityManager
from game.ecs.systems import CollisionSystem, CombatSystem, MovementSystem, ProjectileSystem, RenderSystem
from game.gameplay.boss import BossSystem
from game.gameplay.combat import WeaponAttackSystem
from game.gameplay.effects import EffectsSystem
from game.gameplay.enemies import EnemyAI, create_enemy
from game.gameplay.loot import LootSystem, create_loot_item
from game.gameplay.pathfinding import Pathfinder
from game.gameplay.player import PlayerController, create_player
from game.gameplay.puddles import PuddleSystem
from game.gameplay.telegraphs import TelegraphSystem
from game.ui.hud import HUD
from game.ui.inventory import InventoryUI
from game.ui.perk_selection import PerkSelectionUI
from game.world.dungeon_gen import DungeonGenerator
from game.world.level import Level
from game.world.tiles import TileType


class GameplayScene(Scene):
    """Main gameplay scene."""

    def __init__(self, settings: GameSettings) -> None:
        """Initialize gameplay scene."""
        super().__init__()
        self.settings = settings
        self.entity_manager = EntityManager()
        self.movement_system = MovementSystem(self.entity_manager)
        self.render_system = RenderSystem(self.entity_manager)
        self.collision_system = CollisionSystem(self.entity_manager)
        self.combat_system = CombatSystem(self.entity_manager)
        self.effects_system = EffectsSystem()
        self.telegraph_system = TelegraphSystem()
        self.puddle_system = PuddleSystem()
        self.projectile_system = ProjectileSystem(self.entity_manager, self.effects_system)
        self.weapon_attack_system = WeaponAttackSystem(
            self.entity_manager, self.projectile_system, self.effects_system
        )
        # Pathfinder will be set after level generation
        self.pathfinder: Optional[Pathfinder] = None
        self.enemy_ai = EnemyAI(self.entity_manager, pathfinder=None, puddle_system=self.puddle_system)
        self.boss_system = BossSystem(
            self.entity_manager, self.telegraph_system, self.effects_system, self.puddle_system
        )
        self.loot_system = LootSystem(self.entity_manager)
        self.hud = HUD(self.entity_manager, level=None)  # Will be set after level generation
        self.inventory_ui = InventoryUI(self.entity_manager)
        self.perk_selection_ui = PerkSelectionUI()

        self.level: Optional[Level] = None
        self.player_id: Optional[int] = None
        self.player_controller: Optional[PlayerController] = None
        self.camera_x = 0
        self.camera_y = 0
        self.tile_size = 32
        self.current_time = 0.0

        self._init_level()

        # Subscribe to events
        event_bus.subscribe(EVENT_ENEMY_KILLED, self._on_enemy_killed)
        event_bus.subscribe(EVENT_LEVEL_UP, self._on_level_up)

    def _init_level(self) -> None:
        """Initialize level and entities."""
        # Generate dungeon
        generator = DungeonGenerator(width=80, height=60)
        self.level = generator.generate(seed=random.randint(0, 10000))
        
        # Update HUD and telegraph system with level reference
        self.hud.level = self.level
        self.telegraph_system.level = self.level

        # Create pathfinder
        self.pathfinder = Pathfinder(self.level, self.tile_size)
        self.enemy_ai.pathfinder = self.pathfinder

        # Find starting position (stairs down or first room)
        start_x, start_y = 40, 30
        if self.level.rooms:
            first_room = self.level.rooms[0]
            start_x = first_room.centerx
            start_y = first_room.centery

        # Create player
        self.player_id = create_player(self.entity_manager, start_x * self.tile_size, start_y * self.tile_size)
        self.player_controller = PlayerController(self.entity_manager, self.player_id, self.settings.keybindings)
        
        # Update HUD with player controller for cooldown display
        self.hud.player_controller = self.player_controller

        # Spawn enemies
        for room in self.level.rooms[1:]:  # Skip first room
            num_enemies = random.randint(1, 3)
            for _ in range(num_enemies):
                enemy_x = random.randint(room.left + 1, room.right - 1)
                enemy_y = random.randint(room.top + 1, room.bottom - 1)
                enemy_type = "slime" if random.random() < 0.3 else "goblin"
                create_enemy(
                    self.entity_manager,
                    enemy_x * self.tile_size,
                    enemy_y * self.tile_size,
                    enemy_type,
                )

        # Spawn some loot
        for room in self.level.rooms:
            if random.random() < 0.3:
                loot_x = random.randint(room.left + 1, room.right - 1)
                loot_y = random.randint(room.top + 1, room.bottom - 1)
                create_loot_item(self.entity_manager, loot_x * self.tile_size, loot_y * self.tile_size)

        # Subscribe to events
        event_bus.subscribe(EVENT_PLAYER_DIED, self._on_player_died)
        event_bus.subscribe(EVENT_VICTORY, self._on_victory)

    def _on_player_died(self, event: GameEvent) -> None:
        """Handle player death."""
        self.next_scene = "gameover"

    def _on_victory(self, event: GameEvent) -> None:
        """Handle victory."""
        self.next_scene = "victory"

    def _on_enemy_killed(self, event: GameEvent) -> None:
        """Handle enemy death for special effects."""
        entity_id = event.data.get("entity_id")
        if entity_id:
            entity = self.entity_manager.get_entity(entity_id)
            if entity:
                from game.ecs.components import Enemy, Faction, FactionType
                enemy_comp = entity.get_component(Enemy)
                faction = entity.get_component(Faction)

                # Handle slime split
                if enemy_comp and enemy_comp.enemy_type in ["slime", "slime_small"]:
                    if hasattr(self.enemy_ai, "state_machines") and entity_id in self.enemy_ai.state_machines:
                        state_machine = self.enemy_ai.state_machines[entity_id]
                        if hasattr(state_machine, "on_death"):
                            state_machine.on_death(self.entity_manager)

                # Handle boss death
                if faction and faction.tag == FactionType.BOSS:
                    self.boss_system.on_boss_death()

    def _on_level_up(self, event: GameEvent) -> None:
        """Handle level up - show perk selection."""
        entity_id = event.data.get("entity_id")
        if entity_id == self.player_id:
            # Get unlocked perks to exclude
            player = self.entity_manager.get_entity(self.player_id)
            if player:
                skill_tree = player.get_component(SkillTree)
                exclude = skill_tree.unlocked_nodes if skill_tree else []
                self.perk_selection_ui.show(exclude=exclude)

    def handle_event(self, event: pygame.event.Event) -> None:
        """Handle events."""
        if event.type == pygame.KEYDOWN:
            # Perk selection (priority - blocks other input)
            if self.perk_selection_ui.visible:
                player = self.entity_manager.get_entity(self.player_id) if self.player_id else None
                inventory = player.get_component(Inventory) if player else None
                selected_perk_id = self.perk_selection_ui.handle_event(event, inventory)
                if selected_perk_id:
                    # Apply selected perk
                    self._apply_perk(selected_perk_id)
                return

            # Inventory toggle
            if event.key == self.settings.keybindings.inventory:
                self.inventory_ui.toggle()
                return

            # Pause
            if event.key == self.settings.keybindings.pause:
                # Pause will be handled by scene manager using stack
                self.paused = True
                return

            if self.inventory_ui.visible:
                self.inventory_ui.handle_event(event)
                return

            # Delegate to player controller
            if self.player_controller:
                self.player_controller.handle_event(event, self.current_time)

    def update(self, dt: float) -> None:
        """Update gameplay."""
        self.current_time += dt

        # Process events
        event_bus.process()

        # Update player controller
        if self.player_controller:
            self.player_controller.update(dt, self.current_time)

            # Handle attack (with buffer support)
            if self.player_controller.can_attack(self.current_time):
                mouse_pos = pygame.mouse.get_pos()
                # Convert screen to world coordinates
                world_mouse = (mouse_pos[0] + self.camera_x, mouse_pos[1] + self.camera_y)
                self.weapon_attack_system.perform_attack(self.player_id, self.current_time, world_mouse)

        # Update systems
        self.movement_system.update(dt)
        self.projectile_system.update(dt)
        self.weapon_attack_system.update_attack_frames(dt)
        self.effects_system.update(dt)
        self.telegraph_system.update(dt)
        self.puddle_system.update(dt, self.entity_manager)
        self.enemy_ai.update(dt, self.player_id)
        self.boss_system.update(dt, self.player_id)

        # Update status effects
        from game.ecs.components import StatusEffects
        entities_with_status = self.entity_manager.get_entities_with(StatusEffects)
        for entity in entities_with_status:
            status = entity.get_component(StatusEffects)
            if status:
                status.update(dt)

        # Collision with walls
        if self.player_id:
            player = self.entity_manager.get_entity(self.player_id)
            if player:
                transform = player.get_component(Transform)
                col = player.get_component(Collider)
                if transform and col and self.level:
                    # Check wall collisions
                    tile_x = int(transform.x // self.tile_size)
                    tile_y = int(transform.y // self.tile_size)
                    if not self.level.is_walkable(tile_x, tile_y):
                        # Push back
                        transform.x = max(0, min(self.level.width * self.tile_size - col.width, transform.x))
                        transform.y = max(0, min(self.level.height * self.tile_size - col.height, transform.y))


        # Enemy collisions with walls
        from game.ecs.components import Faction, FactionType
        enemies = self.entity_manager.get_entities_with(Faction, Transform, Collider)
        for enemy in enemies:
            faction = enemy.get_component(Faction)
            # Only process enemies, not player
            if not faction or faction.tag == FactionType.PLAYER:
                continue
            transform = enemy.get_component(Transform)
            col = enemy.get_component(Collider)
            if transform and col and self.level:
                tile_x = int(transform.x // self.tile_size)
                tile_y = int(transform.y // self.tile_size)
                if not self.level.is_walkable(tile_x, tile_y):
                    transform.dx = 0
                    transform.dy = 0

        # Auto pickup loot
        if self.player_id:
            self.loot_system.check_pickup(self.player_id)

        # Update camera (with shake offset)
        shake_offset_x, shake_offset_y = self.effects_system.camera_shake.update(dt)
        if self.player_id:
            player = self.entity_manager.get_entity(self.player_id)
            if player:
                transform = player.get_component(Transform)
                if transform:
                    base_camera_x = int(transform.x - self.settings.screen_width // 2)
                    base_camera_y = int(transform.y - self.settings.screen_height // 2)
                    self.camera_x = base_camera_x + int(shake_offset_x)
                    self.camera_y = base_camera_y + int(shake_offset_y)

    def render(self, screen: pygame.Surface, alpha: float = 0.0) -> None:
        """Render gameplay."""
        screen.fill((0, 0, 0))

        # Render level
        if self.level:
            self.level.render(screen, self.camera_x, self.camera_y, self.tile_size)

        # Render puddles (on floor)
        self.puddle_system.render(screen, self.camera_x, self.camera_y)

        # Render telegraphs (before entities)
        self.telegraph_system.render(screen, self.camera_x, self.camera_y, self.tile_size)

        # Render boss arena gates
        self.boss_system.render(screen, self.camera_x, self.camera_y)

        # Render entities
        self.render_system.render(screen, self.camera_x, self.camera_y)

        # Render effects (damage numbers, particles)
        self.effects_system.render(screen, self.camera_x, self.camera_y)

        # Render HUD
        self.hud.render(screen, self.camera_x, self.camera_y)

        # Render inventory if visible
        self.inventory_ui.render(screen)

        # Render perk selection if visible
        self.perk_selection_ui.render(screen)

    def _apply_perk(self, perk_id: str) -> None:
        """Apply selected perk to player."""
        from game.gameplay.perks import PERKS, apply_perk
        from game.ecs.components import Inventory

        if perk_id not in PERKS:
            return

        player = self.entity_manager.get_entity(self.player_id)
        if not player:
            return

        perk = PERKS[perk_id]
        apply_perk(player, perk)

        # Add to skill tree
        skill_tree = player.get_component(SkillTree)
        if skill_tree:
            skill_tree.unlock_node(perk_id)

        # Save run progress
        self._save_run_progress()

    def _save_run_progress(self) -> None:
        """Save current run progress to save/run.json."""
        import json
        from pathlib import Path
        from game.ecs.components import Inventory, SkillTree

        player = self.entity_manager.get_entity(self.player_id)
        if not player:
            return

        inventory = player.get_component(Inventory)
        experience = player.get_component(Experience)
        skill_tree = player.get_component(SkillTree)

        if not inventory or not experience or not skill_tree:
            return

        # Prepare save data
        save_data = {
            "level": experience.level,
            "xp": experience.xp,
            "next_xp": experience.next_xp,
            "gold": inventory.gold,
            "unlocked_perks": skill_tree.unlocked_nodes,
            "weapon_slots": [
                slot if slot else None for slot in inventory.weapon_slots
            ],
            "consumable_slots": [
                {"item": slot, "count": inventory.consumable_counts[i]}
                if slot else None
                for i, slot in enumerate(inventory.consumable_slots)
            ],
        }

        # Save to file
        save_dir = Path("save")
        save_dir.mkdir(exist_ok=True)
        save_path = save_dir / "run.json"

        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(save_data, f, indent=2)

    def on_exit(self) -> None:
        """Clean up on exit."""
        # Save progress on exit
        self._save_run_progress()

        event_bus.unsubscribe(EVENT_PLAYER_DIED, self._on_player_died)
        event_bus.unsubscribe(EVENT_VICTORY, self._on_victory)
        event_bus.unsubscribe(EVENT_ENEMY_KILLED, self._on_enemy_killed)
        event_bus.unsubscribe(EVENT_LEVEL_UP, self._on_level_up)

