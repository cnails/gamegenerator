"""Internationalization (i18n) system for localization."""

from typing import Dict


class I18n:
    """Localization manager."""

    def __init__(self) -> None:
        """Initialize i18n system."""
        self.current_language = "en"
        self.translations: Dict[str, Dict[str, str]] = {
            "en": {
                # Main menu
                "menu_start": "Start Game",
                "menu_tutorial": "Tutorial",
                "menu_settings": "Settings",
                "menu_quit": "Quit",
                "menu_pause": "PAUSED",
                "menu_resume": "Resume",
                "menu_settings_title": "Settings",
                "menu_exit_to_menu": "Exit to Menu",
                "menu_quit_game": "Quit Game",
                # Settings
                "settings_audio": "Audio",
                "settings_controls": "Controls",
                "settings_language": "Language",
                "settings_master_volume": "Master Volume",
                "settings_sfx_volume": "SFX Volume",
                "settings_music_volume": "Music Volume",
                "settings_back": "Back",
                # HUD
                "hud_hp": "HP",
                "hud_xp": "XP",
                "hud_level": "Lv.",
                "hud_map": "Map",
                "hud_weapon_sword": "Sword",
                "hud_weapon_spear": "Spear",
                "hud_weapon_crossbow": "Crossbow",
                "hud_cooldown": "CD",
                "hud_perks": "Perks",
                # Inventory
                "inventory_title": "INVENTORY",
                "inventory_weapons": "Weapons",
                "inventory_consumables": "Consumables",
                "inventory_close": "Press I to close",
                # Game Over / Victory
                "gameover_title": "GAME OVER",
                "victory_title": "VICTORY!",
                "stats_time": "Time",
                "stats_kills": "Kills",
                "stats_damage_sword": "Sword Damage",
                "stats_damage_spear": "Spear Damage",
                "stats_damage_crossbow": "Crossbow Damage",
                "stats_total_damage": "Total Damage",
                "stats_return_menu": "Press ENTER to return to menu",
                # Confirmation dialog
                "confirm_exit_title": "Exit to Menu?",
                "confirm_exit_message": "Are you sure you want to exit?",
                "confirm_yes": "Yes",
                "confirm_no": "No",
                # Controls
                "controls_move": "Move",
                "controls_attack": "Attack",
                "controls_dodge": "Dodge",
                "controls_inventory": "Inventory",
                "controls_pause": "Pause",
            },
            "ru": {
                # Main menu
                "menu_start": "Начать игру",
                "menu_tutorial": "Обучение",
                "menu_settings": "Настройки",
                "menu_quit": "Выход",
                "menu_pause": "ПАУЗА",
                "menu_resume": "Продолжить",
                "menu_settings_title": "Настройки",
                "menu_exit_to_menu": "Выйти в меню",
                "menu_quit_game": "Выйти из игры",
                # Settings
                "settings_audio": "Звук",
                "settings_controls": "Управление",
                "settings_language": "Язык",
                "settings_master_volume": "Общая громкость",
                "settings_sfx_volume": "Громкость эффектов",
                "settings_music_volume": "Громкость музыки",
                "settings_back": "Назад",
                # HUD
                "hud_hp": "ЗД",
                "hud_xp": "ОП",
                "hud_level": "Ур.",
                "hud_map": "Карта",
                "hud_weapon_sword": "Меч",
                "hud_weapon_spear": "Копьё",
                "hud_weapon_crossbow": "Арбалет",
                "hud_cooldown": "КД",
                "hud_perks": "Перки",
                # Inventory
                "inventory_title": "ИНВЕНТАРЬ",
                "inventory_weapons": "Оружие",
                "inventory_consumables": "Расходники",
                "inventory_close": "Нажмите I для закрытия",
                # Game Over / Victory
                "gameover_title": "ИГРА ОКОНЧЕНА",
                "victory_title": "ПОБЕДА!",
                "stats_time": "Время",
                "stats_kills": "Убийств",
                "stats_damage_sword": "Урон мечом",
                "stats_damage_spear": "Урон копьём",
                "stats_damage_crossbow": "Урон арбалетом",
                "stats_total_damage": "Всего урона",
                "stats_return_menu": "Нажмите ENTER для возврата в меню",
                # Confirmation dialog
                "confirm_exit_title": "Выйти в меню?",
                "confirm_exit_message": "Вы уверены, что хотите выйти?",
                "confirm_yes": "Да",
                "confirm_no": "Нет",
                # Controls
                "controls_move": "Движение",
                "controls_attack": "Атака",
                "controls_dodge": "Уклонение",
                "controls_inventory": "Инвентарь",
                "controls_pause": "Пауза",
            },
        }

    def set_language(self, lang: str) -> None:
        """Set current language."""
        if lang in self.translations:
            self.current_language = lang

    def get(self, key: str, default: str | None = None) -> str:
        """Get translated string."""
        if self.current_language in self.translations:
            return self.translations[self.current_language].get(key, default or key)
        return default or key

    def t(self, key: str, default: str | None = None) -> str:
        """Shortcut for get()."""
        return self.get(key, default)


# Global i18n instance
i18n = I18n()

