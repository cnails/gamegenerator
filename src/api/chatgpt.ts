import type { GameConfig, GeneratedGameData } from '@/types';
import { GameTemplate } from '@/types';

export class ChatGPTAPI {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1/chat/completions';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || '';
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async generateGame(config: GameConfig): Promise<GeneratedGameData> {
    if (!this.apiKey) {
      throw new Error('API ключ не установлен');
    }

    const prompt = this.buildPrompt(config);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content:
                'Ты эксперт по созданию 2D-игр. Генерируй JSON с данными игры: title, description, mechanics, visuals (colors, style), levels. Игры должны быть короткими (2-3 минуты) и подходить для мобильных устройств в портретной ориентации.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.8,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`API Error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Пустой ответ от API');
      }

      // Пытаемся извлечь JSON из ответа
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Не удалось найти JSON в ответе');
      }

      const gameData = JSON.parse(jsonMatch[0]) as GeneratedGameData;
      return gameData;
    } catch (error) {
      console.error('ChatGPT API Error:', error);
      // Возвращаем данные по умолчанию в случае ошибки
      return this.getDefaultGameData(config);
    }
  }

  private buildPrompt(config: GameConfig): string {
    const templateNames: Record<GameTemplate, string> = {
      [GameTemplate.PLATFORMER]: 'платформер',
      [GameTemplate.ARCADE]: 'аркада',
      [GameTemplate.PUZZLE]: 'головоломка',
      [GameTemplate.TOWER_DEFENSE]: 'башенная оборона',
      [GameTemplate.VERTICAL_STANDARD]: 'вертикальный каркас',
    };

    const difficultyNames: Record<string, string> = {
      easy: 'легкая',
      medium: 'средняя',
      hard: 'сложная',
    };

    const extra = this.getTemplateSpecificInstructions(config);
    const userPromptRaw = config.params?.['variantPrompt'];
    const userPrompt =
      typeof userPromptRaw === 'string' ? userPromptRaw.trim().slice(0, 1200) : '';

    let prompt = `Создай игру типа "${templateNames[config.template]}" со сложностью "${difficultyNames[config.difficulty]}".

Параметры: ${JSON.stringify(config.params, null, 2)}

Сгенерируй JSON с полями:
- title: название игры
- description: краткое описание
- mechanics: объект с игровой механикой (скорость, количество врагов, сложность и т.д.)
- visuals: { colors: массив цветов, style: стиль визуализации }
- levels: массив уровней или конфигурация уровней

Игра должна быть интересной, но короткой (2-3 минуты).${extra}`;
    if (userPrompt) {
      prompt += `

Дополнительные пожелания пользователя (учти обязательно и отрази в генерации):
${userPrompt}`;
    }

    return prompt;
  }

  private getTemplateSpecificInstructions(config: GameConfig): string {
    switch (config.template) {
      case GameTemplate.TOWER_DEFENSE: {
        const requestedWaves = typeof config.params.waveCount === 'number' ? config.params.waveCount : 5;
        const waveCount = Math.max(3, Math.min(12, Number.isFinite(requestedWaves) ? requestedWaves : 5));

        return `

Дополнительно для башенной обороны обязательно добавь:
- mechanics.towerTypes — минимум 3 башни с полями { id, name, element, effect, damage (6-25), fireRate (0.5-3), range (140-280), projectileSpeed (200-420), color в hex }.
- mechanics.enemyTypes — минимум 3 врага с полями { id, name, description, speed (60-140), health (80-240), reward (8-35), color, resistance/effect }.
- mechanics.waves — ${waveCount} конфигураций волн, каждая с полями { name, description, rewardMultiplier, enemies: [{ enemyId, count }] }.
- levels — опиши план карты (количество поворотов пути, особые события) в свободной форме.
`;
      }
      case GameTemplate.PLATFORMER:
        return `

Чтобы каждая версия платформера ощущалась уникальной, добавь объект mechanics.platformerVariant со следующими полями:
- variantName и variantDescription — придуманные названия и краткий сеттинг раунда. Не повторяй названия между генерациями.
- palette — 3-6 hex-цветов (строки вида "#1f2a44"), отражающих эстетику варианта.
- objective — { type: 'collect' | 'score' | 'survive', description, targetCount?, targetScore?, survivalTime?, bonusOnComplete } и описание цели.
- enemyArchetypes — минимум 2 элементов { id, name, description, behavior ('patrol'|'chaser'|'hopper'), ability, speedMultiplier (0.6-1.6), jumpStrength (160-360), aggression (0-1), color }.
- bonusRules — { collectibleName, pointsPerCollectible (8-25), comboName, comboDecaySeconds (1.2-4), powerUps: [{ id, name, effect ('speed'|'shield'|'scoreBoost'), duration (3-8), description }] }.
- hazardPack — { fallingFrequency (2-6 секунд), fallingSpeed (80-220), floorHazardCount (3-8), specialStyle ('static'|'pulse'|'slide'), description }.

Если подходящих данных нет, выдумай их.`;
      case GameTemplate.ARCADE:
        return `

Для аркадного режима добавь объект mechanics.arcadeVariant со структурой:
- codename и briefing — короткое кодовое имя операции и описание ситуации (2-3 предложения).
- comboName и comboDecaySeconds (1.2-4.5) — как называется множитель и через сколько секунд он обнуляется.
- objective — { type: 'survive' | 'score', description, survivalTime (60-240)?, targetScore (400-2400)?, bonusOnComplete }.
- enemyProfiles — минимум 3 профиля { id, name, description, pattern ('basic'|'zigzag'|'tank'), hp (1-5), speedMultiplier (0.7-1.6), fireRateMultiplier (0.6-1.5), dropsPowerUpChance (0.1-0.6) }.
- enemyProfiles — минимум 3 профиля { id, name, description, pattern ('basic'|'zigzag'|'tank'), hp (1-5), speedMultiplier (0.7-1.6), fireRateMultiplier (0.6-1.5), dropsPowerUpChance (0.1-0.6), weapon: { type ('laser'|'burst'|'spread'), projectileSpeed (180-360), cooldownModifier (0.7-1.5), burstCount?, spreadAngle? }, ability?: { type ('dash'|'shieldPulse'|'drone'), description, cooldown (2-6), duration? } }.
- waves — минимум 2 волны { id, name, description, durationSeconds (15-45), spawnRate (0.6-2.4), speedMultiplier (0.8-1.5), fireRateMultiplier (0.7-1.4), enemyMix: [{ enemyId, weight (1-6) }] }.
- powerUps — минимум 2 усиления { id, name, effect ('shield'|'rapid'|'spread'), duration (4-9), description, dropChance (0.1-0.45) }.

Цветовые поля пока не нужны — сосредоточься на поведении и параметрах.`;
      case GameTemplate.PUZZLE:
        return `

Для головоломки обязательно добавь объект mechanics.puzzleVariant со структурой:
- codename и flavorText — уникальное имя варианта и краткий сеттинг (не повторяй название между генерациями).
- baseGridSize (5-8) — если не указан, используй значение из params.
- targetMatchesModifier (0.8-1.4) и moveBudgetModifier (0.7-1.3) — коэффициенты для цели и количества ходов.
- blockTypes — минимум 4 элемента { id, name, description, color (#rrggbb), power ('bomb'|'lineHorizontal'|'lineVertical'|'colorClear'|'scoreBoost'|'none'), spawnWeight (1-5), bonusScore (5-30) }.
- bonusRules — минимум 2 объекта { id, name, description, triggerType ('totalMatches'|'combo'|'cascade'), threshold (целое число), reward: { extraMoves?, score?, spawnSpecialBlockId? } }.
- boardModifiers — { presetName, description, blockedCells?: [{ row, col }] } где row и col нумеруются с 0 и находятся в пределах сетки.

Каждая генерация должна отличаться наборами блоков, бонусами и конфигурацией blockedCells.`;
      default:
        return '';
    }
  }

  private getDefaultGameData(config: GameConfig): GeneratedGameData {
    if (config.template === GameTemplate.PUZZLE) {
      return {
        title: 'Обсидиановая голова',
        description: 'Комбинируй кристаллы артефакта, чтобы пробудить древний механизм.',
        mechanics: {
          puzzleVariant: {
            codename: 'Obsidian Bloom',
            flavorText: 'Руины живут энергией: нестабильные ядра образуют ловушки и бонусы.',
            baseGridSize: 6,
            targetMatchesModifier: 1.1,
            moveBudgetModifier: 0.95,
            blockTypes: [
              {
                id: 'ember',
                name: 'Пылающий яд',
                description: 'Сжигает весь ряд, когда входит в комбо.',
                color: '#ff6b6b',
                power: 'lineHorizontal',
                spawnWeight: 3,
                bonusScore: 8,
              },
              {
                id: 'spire',
                name: 'Кристалл шпиля',
                description: 'Пронзает колонну энергии и очищает столб.',
                color: '#4ecdc4',
                power: 'lineVertical',
                spawnWeight: 2,
                bonusScore: 10,
              },
              {
                id: 'pulse',
                name: 'Импульсный узел',
                description: 'Взрыв очищает соседние клетки.',
                color: '#ffe66d',
                power: 'bomb',
                spawnWeight: 2,
                bonusScore: 12,
              },
              {
                id: 'core',
                name: 'Сердцевина',
                description: 'Дает дополнительные очки при разрушении.',
                color: '#5f27cd',
                power: 'scoreBoost',
                spawnWeight: 3,
                bonusScore: 20,
              },
            ],
            bonusRules: [
              {
                id: 'combo-charge',
                name: 'Заряд комбо',
                description: 'Комбо от x3 дает дополнительный ход.',
                triggerType: 'combo',
                threshold: 3,
                reward: {
                  extraMoves: 1,
                },
              },
              {
                id: 'cascade-havoc',
                name: 'Каскадный выброс',
                description: 'После двух каскадов подряд появляется импульсный узел.',
                triggerType: 'cascade',
                threshold: 2,
                reward: {
                  spawnSpecialBlockId: 'pulse',
                },
              },
            ],
            boardModifiers: {
              presetName: 'Central Rift',
              description: 'Крест из разрушенных плит в центре мешает прямым линиям.',
              blockedCells: [
                { row: 2, col: 2 },
                { row: 2, col: 3 },
                { row: 3, col: 2 },
                { row: 3, col: 3 },
              ],
            },
          },
        },
        visuals: {
          colors: ['#0b132b', '#ff6b6b', '#ffe66d', '#4ecdc4'],
          style: 'ancient neon ruins',
          background: '#050914',
        },
        levels: [],
      };
    }

    if (config.template === GameTemplate.TOWER_DEFENSE) {
      return {
        title: 'Последний бастион',
        description: 'Противники движутся по извилистой тропе, а ты управляя разными башнями защищаешь энергоядро.',
        mechanics: {
          towerTypes: [
            {
              id: 'rapid',
              name: 'Скоростная турель',
              damage: 9,
              fireRate: 2.4,
              range: 160,
              projectileSpeed: 340,
              element: 'кинетический',
              effect: 'Стабильно снимает быстрых врагов',
              color: '#4CAF50',
            },
            {
              id: 'siege',
              name: 'Осадная башня',
              damage: 20,
              fireRate: 0.9,
              range: 250,
              projectileSpeed: 400,
              element: 'взрывной',
              effect: 'Пробивает броню и наносит урон по площади',
              color: '#FFB347',
            },
            {
              id: 'tesla',
              name: 'Тесла-узел',
              damage: 12,
              fireRate: 1.4,
              range: 190,
              projectileSpeed: 300,
              element: 'электрический',
              effect: 'Замедляет врагов дугами молний',
              color: '#7E57C2',
            },
          ],
          enemyTypes: [
            {
              id: 'scout',
              name: 'Разведчик-скаут',
              description: 'Небронированный, но очень быстрый враг, идет в первых волнах.',
              speed: 110,
              health: 70,
              reward: 10,
              resistance: 'низкая броня',
              color: '#FF8C42',
            },
            {
              id: 'brute',
              name: 'Осадный громила',
              description: 'Медленный бронированный юнит, выдерживает много урона.',
              speed: 70,
              health: 210,
              reward: 24,
              resistance: 'сниженный урон от взрывов',
              color: '#FF5E57',
            },
            {
              id: 'swarm',
              name: 'Рой дронов',
              description: 'Средняя скорость, выходит группами и давит числом.',
              speed: 90,
              health: 120,
              reward: 14,
              resistance: 'устойчивость к замедлению',
              color: '#4ECDC4',
            },
          ],
          waves: [
            {
              name: 'Разведка границ',
              description: 'Небольшие группы быстрых разведчиков.',
              rewardMultiplier: 1,
              enemies: [
                { enemyId: 'scout', count: 8 },
                { enemyId: 'swarm', count: 4 },
              ],
            },
            {
              name: 'Первые дроны',
              description: 'Разведчики ведут рои для прощупывания обороны.',
              rewardMultiplier: 1.2,
              enemies: [
                { enemyId: 'swarm', count: 8 },
                { enemyId: 'scout', count: 4 },
              ],
            },
            {
              name: 'Осадные тесты',
              description: 'Тяжелые юниты под прикрытием легких волн.',
              rewardMultiplier: 1.3,
              enemies: [
                { enemyId: 'brute', count: 3 },
                { enemyId: 'swarm', count: 6 },
              ],
            },
          ],
        },
        visuals: {
          colors: ['#10182B', '#4CAF50', '#FFC048', '#7E57C2'],
          style: 'futuristic neon defense',
          background: '#0B1220',
        },
        levels: [
          {
            name: 'Змеиная тропа',
            description: 'Путь делает три резких поворота вокруг энергетического купола.',
          },
        ],
      };
    }

    return {
      title: `Игра ${config.template}`,
      description: 'Сгенерированная игра',
      mechanics: {
        speed: 1,
        difficulty: config.difficulty,
      },
      visuals: {
        colors: ['#4CAF50', '#2196F3', '#FF9800'],
        style: 'modern',
      },
      levels: [],
    };
  }
}

