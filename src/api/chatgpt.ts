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
    };

    const difficultyNames: Record<string, string> = {
      easy: 'легкая',
      medium: 'средняя',
      hard: 'сложная',
    };

    const extra = this.getTemplateSpecificInstructions(config);

    return `Создай игру типа "${templateNames[config.template]}" со сложностью "${difficultyNames[config.difficulty]}".

Параметры: ${JSON.stringify(config.params, null, 2)}

Сгенерируй JSON с полями:
- title: название игры
- description: краткое описание
- mechanics: объект с игровой механикой (скорость, количество врагов, сложность и т.д.)
- visuals: { colors: массив цветов, style: стиль визуализации }
- levels: массив уровней или конфигурация уровней

Игра должна быть интересной, но короткой (2-3 минуты).${extra}`;
  }

  private getTemplateSpecificInstructions(config: GameConfig): string {
    if (config.template !== GameTemplate.TOWER_DEFENSE) {
      return '';
    }
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

  private getDefaultGameData(config: GameConfig): GeneratedGameData {
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

