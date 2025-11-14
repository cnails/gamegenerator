import type { GameTemplateDefinition } from '@/types';
import { GameTemplate } from '@/types';

export const gameTemplates: GameTemplateDefinition[] = [
  {
    id: GameTemplate.PLATFORMER,
    name: 'Платформер',
    description: 'Прыгай по платформам, собирай звезды, избегай врагов',
    defaultParams: {
      speed: 1,
      enemyCount: 3,
      platformCount: 5,
    },
    paramFields: [
      {
        key: 'speed',
        label: 'Скорость',
        type: 'number',
        defaultValue: 1,
        min: 0.5,
        max: 2,
      },
      {
        key: 'enemyCount',
        label: 'Количество врагов',
        type: 'number',
        defaultValue: 3,
        min: 1,
        max: 10,
      },
    ],
  },
  {
    id: GameTemplate.ARCADE,
    name: 'Аркада',
    description: 'Мобильный вертикальный шутер с волнами врагов и усилениями',
    defaultParams: {
      speed: 1,
      enemySpawnRate: 1,
      duration: 90,
    },
    paramFields: [
      {
        key: 'speed',
        label: 'Скорость',
        type: 'number',
        defaultValue: 1,
        min: 0.5,
        max: 2,
      },
      {
        key: 'enemySpawnRate',
        label: 'Скорость появления врагов',
        type: 'number',
        defaultValue: 1,
        min: 0.5,
        max: 2,
      },
      {
        key: 'duration',
        label: 'Длительность раунда (сек)',
        type: 'number',
        defaultValue: 90,
        min: 45,
        max: 240,
      },
    ],
  },
  {
    id: GameTemplate.VERTICAL_STANDARD,
    name: 'Вертикальный каркас',
    description: 'Чистая портретная сцена 9:16 для быстрых прототипов (safe-area, resize, pointer)',
    defaultParams: {},
    paramFields: [],
  },
  {
    id: GameTemplate.PUZZLE,
    name: 'Головоломка',
    description: 'Собери 3+ одинаковых блока подряд',
    defaultParams: {
      gridSize: 6,
      targetMatches: 10,
    },
    paramFields: [
      {
        key: 'gridSize',
        label: 'Размер сетки',
        type: 'number',
        defaultValue: 6,
        min: 4,
        max: 8,
      },
      {
        key: 'targetMatches',
        label: 'Целевое количество совпадений',
        type: 'number',
        defaultValue: 10,
        min: 5,
        max: 20,
      },
    ],
  },
  {
    id: GameTemplate.TOWER_DEFENSE,
    name: 'Башенная оборона',
    description: 'Строй уникальные башни и отражай волны разнообразных врагов',
    defaultParams: {
      waveCount: 5,
      towerSlots: 6,
      towerVariety: 3,
    },
    paramFields: [
      {
        key: 'waveCount',
        label: 'Количество волн',
        type: 'number',
        defaultValue: 5,
        min: 3,
        max: 12,
      },
      {
        key: 'towerSlots',
        label: 'Позиции для башен',
        type: 'number',
        defaultValue: 6,
        min: 3,
        max: 10,
      },
      {
        key: 'towerVariety',
        label: 'Уникальные башни',
        type: 'number',
        defaultValue: 3,
        min: 2,
        max: 5,
      },
    ],
  },
];

export function getTemplateById(id: GameTemplate): GameTemplateDefinition | undefined {
  return gameTemplates.find((t) => t.id === id);
}

