# Шаблон Vertical 9:16

Файл `src/scenes/templates/VerticalStandardScene.ts` теперь содержит два класса:

- `VerticalBaseScene` — чистый каркас поверх `BaseGameScene`, который решает только задачи портретного левелаута (safe-area, resize, указатели).
- `VerticalStandardScene` — минимальная сцена-пример, чтобы можно было запустить шаблон как самостоятельную игру.

Все игровые механики вынесены в наследников (`ArcadeScene`, `PlatformerScene`, `PuzzleScene` уже используют этот базовый слой).

## Быстрый старт
1. Наследуйтесь от `VerticalBaseScene` вместо прямого `BaseGameScene`.
2. В `initGame()` первым делом вызовите `this.initVerticalLayout(options?)`.
3. Создавайте свою механику как обычно (спрайты, физика, HUD).
4. В `update()` при необходимости реагируйте на safe-area через `onSafeAreaChanged`.
5. При ручном финальном очистке можно вызвать `this.destroyVerticalLayout()`, но базовый класс сделает это автоматически на `SHUTDOWN`.

```ts
export class MyScene extends VerticalBaseScene {
  initGame(): void {
    this.initVerticalLayout({ enablePointer: true, extraPointers: 1 });
    // ...дальше обычная логика
  }

  protected onPointerDown(pointer: Phaser.Input.Pointer): void {
    // Реакция на касания
  }

  protected onSafeAreaChanged(): void {
    // Перелэйаутить фон/ HUD если нужно
  }
}
```

## Основные API

| Метод/свойство | Назначение |
| --- | --- |
| `initVerticalLayout(options)` | Настройка портретного поля. Параметры: `minSafeWidth`, `maxSafeWidth`, `paddingX/Y`, `enablePointer`, `extraPointers`. |
| `safeBounds` | Итоговая прямоугольная область (безопасное поле), автоматически пересчитывается при `resize`. |
| `playBounds` | Safe-area с учётом внутренних отступов (`paddingX/Y`). |
| `clampXWithinSafeArea(value, padding?)` / `clampYWithinSafeArea` | Быстрый кламп координат. |
| `onSafeAreaChanged(safe, play)` | Хук для перелэйаута UI/механик при изменении размеров. |
| `onPointerDown/Move/Up` | Хуки для ввода; активируются, если в `initVerticalLayout` включён `enablePointer`. |
| `destroyVerticalLayout()` | Снимает обработчики `resize` и `pointer`. Обычно вызывается автоматически. |

## Как используют каркас текущие сцены
- **ArcadeScene** — задействует pointer-хуки для управления кораблём и опирается на `safeBounds` при отрисовке параллакса и HUD.
- **PlatformerScene** — вычисляет размеры мира, отступы параллакса и HUD, отталкиваясь от `safeBounds`, сохраняя общий вертикальный лайаут.
- **PuzzleScene** — размещает сетку, прогресс-бар и текстовую панель внутри `safeBounds`, что гарантирует корректный вид на устройствах 9:16.

## Рекомендации
- Старайтесь, чтобы координаты HUD базировались на `safeBounds`, тогда никакого ручного `resize` не понадобится.
- Для input’а на мобильных устройствах включайте `enablePointer` и переопределяйте `onPointerDown/Move/Up`, чтобы не плодить однотипный код.
- Если сцене нужен собственный cleanup (таймеры, tweens), в конце просто добавьте `this.destroyVerticalLayout()` — каркас аккуратно освободит обработчики.

