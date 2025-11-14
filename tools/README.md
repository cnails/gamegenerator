# Balance Tools

Инструменты для работы с файлами баланса игры.

## json_to_csv.py

Конвертирует JSON файлы баланса в CSV для удобного редактирования в Excel/Google Sheets, и обратно.

### Использование

#### JSON → CSV
```bash
python tools/json_to_csv.py data/balance/weapons.json
# Создаст data/balance/weapons.csv

python tools/json_to_csv.py data/balance/enemies.json -o enemies_edited.csv
# Указать выходной файл
```

#### CSV → JSON
```bash
python tools/json_to_csv.py data/balance/weapons.csv
# Создаст data/balance/weapons.json

python tools/json_to_csv.py enemies_edited.csv -o data/balance/enemies.json
# Указать выходной файл
```

### Поддерживаемые файлы

- `data/balance/weapons.json` - Параметры оружия и модификаторы
- `data/balance/enemies.json` - Параметры врагов
- `data/balance/skills.json` - Перки и их формулы

### Формат CSV

CSV файлы используют первую колонку как ID элемента, остальные колонки - это вложенные поля, разделённые точками.

Например:
```csv
id,name,health,damage,states.patrol.speed_multiplier
goblin,Goblin,30,5,0.5
```

### Примеры

1. Редактирование параметров врага:
   ```bash
   # Конвертируем в CSV
   python tools/json_to_csv.py data/balance/enemies.json
   
   # Редактируем data/balance/enemies.csv в Excel
   # Изменяем HP гоблина с 30 на 40
   
   # Конвертируем обратно в JSON
   python tools/json_to_csv.py data/balance/enemies.csv
   ```

2. Добавление нового перка:
   ```bash
   # Конвертируем skills.json в CSV
   python tools/json_to_csv.py data/balance/skills.json
   
   # Добавляем новую строку в skills_perks.csv
   # id,name,name_ru,category,rarity,effects.damage_multiplier
   # new_perk,New Perk,Новый перк,weapon,common,1.25
   
   # Конвертируем обратно
   python tools/json_to_csv.py data/balance/skills_perks.csv -o data/balance/skills_new.json
   ```

### Особенности

- Автоматически определяет направление конвертации по расширению файла
- Сохраняет вложенную структуру JSON через точки в именах колонок
- Поддерживает массивы и объекты (сериализуются как JSON строки)
- Автоматически парсит числа и булевы значения при обратной конвертации
- Поддерживает UTF-8 (русские названия)

