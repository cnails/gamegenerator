# World Generation System

## Обзор

Система генерации подземелий с поддержкой BSP и алгоритма "комнаты + коридоры", типами комнат, проверкой связности через A* и системой волн.

## Использование

### Базовое использование

```python
from game.world.dungeon_gen import DungeonGenerator, RoomType

# Создание генератора
generator = DungeonGenerator(
    width=80,      # Ширина уровня в тайлах
    height=60,     # Высота уровня в тайлах
    tile_size=64,  # Размер тайла в пикселях
    min_rooms=6,   # Минимум комнат
    max_rooms=12,  # Максимум комнат
    use_bsp=True   # Использовать BSP (False = комнаты+коридоры)
)

# Генерация уровня
level = generator.generate(seed=42, floor_number=1)

# Доступ к комнатам
for room in generator.rooms:
    print(f"Room {room.room_id}: {room.room_type}")
    print(f"  Position: {room.rect}")
    print(f"  Connections: {room.connections}")
```

### Типы комнат

- `RoomType.START` - Стартовая комната
- `RoomType.COMBAT` - Боевая комната с волнами
- `RoomType.TREASURE` - Сокровищница
- `RoomType.SHOP` - Магазин
- `RoomType.MINI_BOSS` - Мини-босс
- `RoomType.BOSS` - Финальный босс

### Система волн

```python
# Получение позиций спавна для волны
spawns = generator.get_wave_spawns(room_id=0, floor_number=1)

# Плотность увеличивается с этажом
spawns_floor_1 = generator.get_wave_spawns(room_id=0, floor_number=1)
spawns_floor_3 = generator.get_wave_spawns(room_id=0, floor_number=3)
# len(spawns_floor_3) > len(spawns_floor_1)
```

### Проверка связности

Генератор автоматически гарантирует, что все комнаты достижимы:
- Использует BFS для проверки связности графа комнат
- Автоматически добавляет коридоры для изолированных комнат
- Граф комнат хранится в `generator.room_graph`

### Мини-карта

```python
# Получение комнаты по координатам
room = generator.get_room_at(x=10, y=15)

# Доступ к данным комнат через level
level.room_data  # Список объектов Room
level.current_room_id  # ID текущей комнаты
```

## Алгоритмы генерации

### BSP (Binary Space Partitioning)

Разделяет пространство рекурсивно, создавая естественные комнаты:
- Более органичная структура
- Лучше для больших уровней
- Меньше контроля над количеством комнат

### Комнаты + Коридоры

Размещает комнаты случайно и соединяет их:
- Больше контроля над количеством комнат
- Использует MST (Minimum Spanning Tree) для связности
- Добавляет дополнительные связи для циклов

## Тестирование

Запуск тестов:

```bash
pytest tests/test_dungeon_gen.py -v
```

Тесты проверяют:
- Генерацию BSP и комнат+коридоров
- Связность всех комнат
- Отсутствие пересечений
- Корректность типов комнат
- Симметричность графа комнат
- Существование проходимых путей
- Систему волн

## Структура данных

### Room

```python
@dataclass
class Room:
    rect: pygame.Rect          # Прямоугольник комнаты
    room_type: RoomType        # Тип комнаты
    room_id: int               # Уникальный ID
    connections: List[int]     # ID связанных комнат
    doors: List[Tuple[int, int]]  # Позиции дверей
```

### Level

```python
class Level:
    width: int                 # Ширина в тайлах
    height: int                # Высота в тайлах
    tiles: List[List[Tile]]    # Сетка тайлов
    rooms: List[pygame.Rect]   # Список прямоугольников комнат
    room_data: List[Room]      # Полные данные комнат
    current_room_id: int       # ID текущей комнаты
```

