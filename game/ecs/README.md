# ECS System Documentation

## Обзор

Легкая Entity Component System (ECS) архитектура для игры. Система разделяет данные (компоненты) и логику (системы).

## Компоненты

### Transform
Объединяет позицию и скорость.
```python
transform = Transform(x=100.0, y=200.0, dx=0.0, dy=0.0)
```

### Render
Отвечает за отрисовку сущности.
```python
render = Render(sprite_id="player", z=0, scale=1.0)
```

### Health
Хранит здоровье сущности.
```python
health = Health(max_hp=100, hp=100)
```

### Damage
Хранит параметры урона (базовый урон, шанс крита, множитель крита).
```python
damage = Damage(base=15, crit_chance=0.1, crit_multiplier=2.0)
```

### Faction
Определяет принадлежность сущности (player/enemy/boss).
```python
faction = Faction(tag=FactionType.PLAYER)
```

### Weapon
Хранит параметры оружия.
```python
weapon = Weapon(
    weapon_type=WeaponType.SWORD,
    attack_delay=0.67,
    range=60.0
)
```

### Inventory
Инвентарь с предметами и золотом.
```python
inventory = Inventory(items=[], gold=0, max_size=20)
```

### Experience
Опыт и уровень.
```python
exp = Experience(level=1, xp=0, next_xp=50)
```

### SkillTree
Дерево навыков.
```python
skill_tree = SkillTree(unlocked_nodes=[], available_points=0)
```

### AI
Параметры ИИ.
```python
ai = AI(
    state=AIState.IDLE,
    agro_radius=200.0,
    attack_range=60.0
)
```

### Collider
Коллайдер для физики.
```python
collider = Collider(width=32, height=32, solid=True)
```

### StatusEffects
Список активных эффектов статуса.
```python
status_effects = StatusEffects(effects=[])
```

### Projectile
Компонент для снарядов.
```python
projectile = Projectile(damage=25, owner_id=player_id, lifetime=5.0)
```

## Системы

### InputSystem
Обрабатывает ввод игрока.
```python
input_system = InputSystem(entity_manager, keybindings)
input_system.handle_event(event)
input_system.update(current_time)
```

### MovementSystem
Обновляет движение сущностей.
```python
movement_system = MovementSystem(entity_manager)
movement_system.update(dt)
```

### CombatSystem
Обрабатывает боевую механику.
```python
combat_system = CombatSystem(entity_manager)
hit_entities = combat_system.perform_attack(attacker_id, target_pos, current_time)
damage = combat_system.apply_damage(target_id, damage_amount, attacker_id)
```

### ProjectileSystem
Управляет снарядами.
```python
projectile_system = ProjectileSystem(entity_manager)
projectile_id = projectile_system.create_projectile(x, y, target_x, target_y, speed, damage, owner_id)
projectile_system.update(dt)
```

### AISystem
Управляет ИИ врагов и боссов.
```python
ai_system = AISystem(entity_manager)
ai_system.update(dt)
```

### SkillSystem
Применяет навыки.
```python
skill_system = SkillSystem(entity_manager)
skill_system.apply_skill(entity_id, skill_id)
```

### LootSystem
Управляет лутом.
```python
loot_system = LootSystem(entity_manager)
loot_id = loot_system.drop_loot(x, y, "gold", value=10)
loot_system.check_pickup(player_id)
```

### UISystem
Отрисовывает UI элементы.
```python
ui_system = UISystem(entity_manager)
ui_system.add_damage_number(x, y, damage, is_crit=True)
ui_system.update(dt)
ui_system.render(screen, camera_x, camera_y)
```

### SaveLoadSystem
Сохранение и загрузка.
```python
save_system = SaveLoadSystem(entity_manager, "save/game.json")
save_system.save()
save_system.load()
```

## Пример использования

```python
from game.ecs.entities import EntityManager
from game.ecs.components import *
from game.ecs.systems import *

# Создание менеджера сущностей
entity_manager = EntityManager()

# Создание игрока
player = entity_manager.create_entity()
player.add_component(Transform(x=100.0, y=100.0))
player.add_component(Render(sprite_id="player", z=0))
player.add_component(Health(max_hp=100, hp=100))
player.add_component(Damage(base=15, crit_chance=0.1))
player.add_component(Faction(tag=FactionType.PLAYER))
player.add_component(Weapon(weapon_type=WeaponType.SWORD))
player.add_component(Inventory())
player.add_component(Experience())
player.add_component(Collider(width=32, height=32))

# Создание систем
movement_system = MovementSystem(entity_manager)
combat_system = CombatSystem(entity_manager)
input_system = InputSystem(entity_manager, keybindings)

# Обновление в игровом цикле
def game_loop():
    dt = clock.tick(60) / 1000.0
    current_time = pygame.time.get_ticks() / 1000.0
    
    # Обработка ввода
    for event in pygame.event.get():
        input_system.handle_event(event)
    
    input_system.update(current_time)
    movement_system.update(dt)
    combat_system.update(dt)
```

## Примечания

- Все компоненты используют dataclasses для удобства
- Системы получают EntityManager для доступа к сущностям
- Компоненты могут быть опциональными (проверка через `get_component()`)
- Для обратной совместимости сохранены алиасы: `Position = Transform`, `Velocity = Transform`, `Sprite = Render`

