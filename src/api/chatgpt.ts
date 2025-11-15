import type {
  GameConfig,
  GeneratedGameData,
  SpriteAnimationCue,
  SpriteAsset,
  SpritePlanEntry,
  SpriteStyleGuide,
} from '@/types';
import { GameTemplate } from '@/types';

interface ChatCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: {
    type: 'json_object';
  };
}

interface SpritePlanResponse {
  styleGuide: SpriteStyleGuide;
  animationNotes?: string[];
  sprites: SpritePlanEntry[];
}

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

export class ChatGPTAPI {
  private apiKey: string;
  private baseUrl: string = 'https://api.openai.com/v1/chat/completions';
  private readonly defaultModel = 'gpt-4o';

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

    try {
      const prompt = this.buildPrompt(config);
      const content = await this.callChatCompletion(
        [
          {
            role: 'system',
            content:
              'Ты эксперт по созданию 2D-игр. Генерируй JSON с данными игры: title, description, mechanics, visuals (colors, style), levels. Игры должны быть короткими (2-3 минуты) и подходить для мобильных устройств в портретной ориентации.',
          },
          { role: 'user', content: prompt },
        ],
        { temperature: 0.8, maxTokens: 2000 },
      );

      const jsonPayload = this.extractJsonBlock(content);
      if (!jsonPayload) {
        throw new Error('Не удалось найти JSON в ответе');
      }

      const gameData = JSON.parse(jsonPayload) as GeneratedGameData;
      await this.enrichGameWithSprites(config, gameData);
      return gameData;
    } catch (error) {
      console.error('ChatGPT API Error:', error);
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
- mechanics: объект с игровой механикой (скорость, количество врагов, сложность и т.д.). ВНУТРИ mechanics ОБЯЗАТЕЛЬНО добавь объект gameVariation со схемой:
  {
    "codename": "уникальное кодовое имя режима (коротко)",
    "mood": "краткое настроение варианта (например: chaotic, calm, tactical)",
    "pace": "slow | normal | fast",
    "risk": число от 0 до 1,
    "mutators": [
      {
        "id": "строковый id мутатора",
        "name": "краткое название мутатора",
        "description": "1–2 предложения, что он делает",
        "type": "scoreMultiplier | timeScale | oneHitDeath | invertHorizontalControls",
        "intensity": число
      }
    ]
  }
- visuals: { colors: массив цветов, style: стиль визуализации }
- levels: массив уровней или конфигурация уровней

Игра должна быть интересной, но короткой (2-3 минуты).

Важно:
- intensity для scoreMultiplier обычно 1.2–3 (множитель очков),
- intensity для timeScale обычно 0.7–1.8 (0.7 — медленнее, 1.5 — быстрее),
- для oneHitDeath и invertHorizontalControls intensity >= 0.5 означает «мутатор включён», < 0.5 — «выключен».
Если не знаешь, что поставить, используй 1 для scoreMultiplier и timeScale, и 0 для остальных.
${extra}`;
    if (userPrompt) {
      prompt += `

Дополнительные пожелания пользователя (учти обязательно и отрази в генерации):
${userPrompt}`;
    }

    return prompt;
  }

  private async callChatCompletion(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    if (!this.apiKey) {
      throw new Error('API ключ не установлен');
    }

    const modelName = options.model ?? this.defaultModel;
    const canUseResponseFormat = Boolean(
      options.responseFormat && this.supportsResponseFormat(modelName),
    );

    const payload: Record<string, unknown> = {
      model: modelName,
      messages,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens ?? 2000,
    };

    if (canUseResponseFormat && options.responseFormat) {
      payload.response_format = options.responseFormat;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let message = 'Unknown error';
      try {
        const error = await response.json();
        message = error.error?.message || message;
        if (canUseResponseFormat &&
          options.responseFormat &&
          typeof message === 'string' &&
          message.toLowerCase().includes('response_format')
        ) {
          console.warn('Модель не поддерживает response_format, повторяем запрос без него.');
          const { responseFormat, ...rest } = options;
          return this.callChatCompletion(messages, rest);
        }
      } catch {
        // no-op
      }
      throw new Error(`API Error: ${message}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    const finishReason = choice?.finish_reason as string | undefined;

    if (finishReason === 'length') {
      console.warn('[ChatGPTAPI] Ответ модели был обрезан по длине (finish_reason=length).', {
        model: modelName,
        maxTokens: payload.max_tokens,
        usage: data.usage,
      });
    }
    if (!content) {
      throw new Error('Пустой ответ от API');
    }

    return content;
  }

  private extractJsonBlock(text: string): string | null {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }

  private extractSvg(text: string): string | null {
    const match = text.match(/<svg[\s\S]*<\/svg>/i);
    return match ? match[0].trim() : null;
  }

  private extractViewBox(svg: string, fallbackSize: number): string {
    const match = svg.match(/viewBox="([^"]+)"/i);
    if (match?.[1]) {
      return match[1];
    }
    const widthMatch = svg.match(/width="([\d.]+)"/i);
    const heightMatch = svg.match(/height="([\d.]+)"/i);
    const width = Number(widthMatch?.[1]) || fallbackSize;
    const height = Number(heightMatch?.[1]) || fallbackSize;
    return `0 0 ${width} ${height}`;
  }

  private async enrichGameWithSprites(config: GameConfig, gameData: GeneratedGameData): Promise<void> {
    try {
      const plan = await this.generateSpritePlan(config, gameData);
      if (!plan || !plan.sprites?.length) {
        console.info(
          '[SpriteGen] План спрайтов отсутствует или пустой, спрайты LLM не будут использованы.',
          {
            title: gameData.title,
            template: config.template,
            hasPlan: Boolean(plan),
            spriteCount: plan?.sprites?.length ?? 0,
          },
        );
        return;
      }

      const spriteSheets: SpriteAsset[] = [];
      for (const entry of plan.sprites) {
        const svg = await this.generateSpriteSvg(entry, plan.styleGuide, gameData);
        if (!svg) continue;

        spriteSheets.push({
          meta: entry,
          svg,
          viewBox: this.extractViewBox(svg, entry.size),
        });
      }

      if (!spriteSheets.length) {
        console.warn('[SpriteGen] План спрайтов получен, но ни один SVG не был успешно сгенерирован.', {
          title: gameData.title,
          template: config.template,
          plannedSprites: plan.sprites.length,
        });
        return;
      }

      console.info('[SpriteGen] Успешно сгенерирован набор спрайтов из LLM.', {
        title: gameData.title,
        template: config.template,
        spriteCount: spriteSheets.length,
        plannedSprites: plan.sprites.length,
      });

      gameData.assets = {
        artPipeline: 'llm-svg-16bit',
        generatedAt: new Date().toISOString(),
        spriteKit: {
          styleGuide: plan.styleGuide,
          spritePlan: plan.sprites,
          spriteSheets,
          animationNotes: plan.animationNotes ?? [],
        },
      };
    } catch (error) {
      console.warn('Ошибка генерации спрайтов, этап пропущен:', error);
    }
  }

  private async generateSpritePlan(
    config: GameConfig,
    gameData: GeneratedGameData,
  ): Promise<SpritePlanResponse | null> {
    const prompt = this.buildSpritePlanPrompt(config, gameData);

    try {
      const content = await this.callChatCompletion(
        [
          {
            role: 'system',
            content:
              'Ты арт-директор 16-битных игр. Планируй стили и опиши, какие спрайты нужны, обязательно отмечай необходимость анимации.',
          },
          { role: 'user', content: prompt },
        ],
        {
          temperature: 0.65,
          maxTokens: 2200,
          responseFormat: { type: 'json_object' },
        },
      );

      const jsonPayload = this.extractJsonBlock(content);
      if (!jsonPayload) {
        console.warn('План спрайтов: JSON блок не найден, см. превью в debug логах.');
        this.debugSpritePayload('plan.no-json', content);
        return null;
      }

      try {
        const plan = JSON.parse(jsonPayload) as SpritePlanResponse;

        console.info('[SpriteGen] План спрайтов получен от LLM.', {
          styleGuideHasPalette: Array.isArray(plan.styleGuide?.palette),
          spriteCount: plan.sprites?.length ?? 0,
        });

        // Проверяем наличие hero спрайта для шаблонов, где он обязателен
        const requiresHero = config.template === GameTemplate.ARCADE || config.template === GameTemplate.PLATFORMER;
        const hasHero = plan.sprites?.some((s) => s.role === 'hero');
        
        if (requiresHero && !hasHero) {
          console.warn(`[SpritePlan] Hero спрайт отсутствует для шаблона ${config.template}! Добавляю базовый hero спрайт.`);
          if (!plan.sprites) {
            plan.sprites = [];
          }
          
          // Определяем описание hero в зависимости от шаблона
          let heroDescription = 'Управляемый игроком персонаж';
          let heroName = 'Главный герой';
          if (config.template === GameTemplate.ARCADE) {
            heroDescription = 'Космический корабль игрока, управляемый снизу экрана';
            heroName = 'Корабль игрока';
          } else if (config.template === GameTemplate.PLATFORMER) {
            heroDescription = 'Персонаж игрока, который может прыгать и бегать';
            heroName = 'Игрок';
          }
          
          // Добавляем базовый hero спрайт
          plan.sprites.unshift({
            id: 'hero-player',
            role: 'hero',
            name: heroName,
            description: heroDescription,
            palette: plan.styleGuide?.palette?.slice(0, 3) || ['#4caf50', '#ffffff', '#000000'],
            size: 48,
            usage: 'Основной управляемый объект игры',
            requiresAnimation: true,
            animations: [
              {
                id: 'idle',
                name: 'Idle',
                type: 'idle',
                frames: 2,
                frameDurationMs: 120,
                loop: true,
                description: 'Легкое покачивание или мерцание в покое',
              },
              {
                id: 'move',
                name: 'Move',
                type: 'move',
                frames: 2,
                frameDurationMs: 100,
                loop: true,
                description: 'Движение при перемещении',
              },
              ...(config.template === GameTemplate.ARCADE
                ? [
                    {
                      id: 'attack',
                      name: 'Attack',
                      type: 'attack' as const,
                      frames: 1,
                      frameDurationMs: 50,
                      loop: false,
                      description: 'Вспышка при выстреле',
                    },
                  ]
                : []),
            ],
          });
        }
        
        return plan;
      } catch (parseError) {
        console.warn('План спрайтов: ошибка парсинга JSON, см. превью в debug логах.');
        this.debugSpritePayload('plan.invalid-json', jsonPayload);
        throw parseError;
      }
    } catch (error) {
      console.warn('Не удалось построить план спрайтов:', error);
      return null;
    }
  }

  private buildSpritePlanPrompt(config: GameConfig, gameData: GeneratedGameData): string {
    const mechanicsCloned = { ...(gameData.mechanics ?? {}) } as Record<string, unknown>;
    if (mechanicsCloned && typeof mechanicsCloned === 'object') {
      // Убираем громоздкий блок вариаций, чтобы не засорять промпт для художника
      delete (mechanicsCloned as Record<string, unknown>)['gameVariation'];
    }
    const mechanicsSummary = JSON.stringify(mechanicsCloned, null, 2);
    const visualsSummary = JSON.stringify(gameData.visuals ?? {}, null, 2);
    const paramsSummary = JSON.stringify(config.params ?? {}, null, 2);

    return `Нужно продумать 16-битный SVG набор спрайтов для мобильной игры.

Данные игры:
- Title: ${gameData.title}
- Description: ${gameData.description}
- Mechanics: ${mechanicsSummary}
- Visuals: ${visualsSummary}
- Template: ${config.template}
- Difficulty: ${config.difficulty}
- User params: ${paramsSummary}

Сгенерируй JSON следующего вида:
{
  "styleGuide": {
    "artDirection": "краткое описание 16-битного стиля",
    "palette": ["#hex", ...],
    "lighting": "как вести свет",
    "shading": "как имитировать глубину",
    "strokeStyle": "как рисовать контур",
    "background": "опционально",
    "textureNotes": "опционально"
  },
  "animationNotes": [
    "Общие рекомендации по анимации и где она обязательна"
  ],
  "sprites": [
    {
      "id": "string",
      "role": "hero|enemy|boss|bonus|projectile|effect|environment|ui",
      "name": "краткое название",
      "description": "что изображено",
      "palette": ["#hex"],
      "size": 48,
      "usage": "где применяется",
      "requiresAnimation": true,
      "animations": [
        {
          "id": "idle",
          "name": "Idle",
          "type": "idle|move|attack|cast|hit|death|effect|spawn",
          "frames": 2,
          "frameDurationMs": 120,
          "loop": true,
          "description": "что должно двигаться"
        }
      ],
      "fxNotes": "опционально"
    }
  ]
}

ОБЯЗАТЕЛЬНЫЕ роли и количества (все должны быть включены в массив sprites):
- ОБЯЗАТЕЛЬНО: 1 главный герой (role=hero) — это управляемый игроком персонаж/корабль/объект. Должен иметь минимум анимации idle и move, для боевых игр также attack. Без этого спрайта игра не будет работать!
- минимум 3 уникальных врага (role=enemy) с описанием поведения
- 1 босс или элитный враг (role=boss)
- минимум 2 бонуса/пауэрап (role=bonus) с анимацией мерцания
- минимум 2 эффекта атаки / снаряда (role=projectile или effect)
- минимум 1 объект окружения или декоративный элемент (role=environment)

КРИТИЧЕСКИ ВАЖНО: Спрайт с role=hero должен быть первым в списке или явно помечен как главный герой. Без него игра не сможет отобразить управляемый объект!

Шаблон-специфичные требования:
${this.getTemplateSpecificSpriteRequirements(config)}

Все размеры (size) выбирай из множества [48, 56, 64, 80], придерживайся кратности 8px.
Поле requiresAnimation = true, если указано больше 1 кадра или визуал должен пульсировать.
Каждое описание анимации должно явно говорить, что именно движется, чтобы разработчик понимал, что анимировать.
`;
  }

  private async generateSpriteSvg(
    entry: SpritePlanEntry,
    styleGuide: SpriteStyleGuide,
    gameData: GeneratedGameData,
  ): Promise<string | null> {
    const prompt = this.buildSpriteSvgPrompt(entry, styleGuide, gameData);

    try {
      const content = await this.callChatCompletion(
        [
          {
            role: 'system',
            content:
              'Ты художник-спрайтер 16-битных игр. Возвращай только чистый SVG без пояснений и markdown. Соблюдай пиксельную сетку.',
          },
          { role: 'user', content: prompt },
        ],
        {
          temperature: 0.35,
          // SVG легко разрастается, даём больше лимит, чтобы не было обрезки по длине
          maxTokens: 2200,
        },
      );

      const svg = this.extractSvg(content);
      if (!svg) {
        console.warn(`SVG для спрайта ${entry.id}: блок <svg> не найден, см. превью в debug логах.`);
        this.debugSpritePayload(`svg.${entry.id}.no-svg`, content);
      }
      return svg;
    } catch (error) {
      console.warn(`SVG для спрайта ${entry.id} не создан:`, error);
      return null;
    }
  }

  private buildSpriteSvgPrompt(
    entry: SpritePlanEntry,
    styleGuide: SpriteStyleGuide,
    gameData: GeneratedGameData,
  ): string {
    const fallbackAnimations: SpriteAnimationCue[] = [
      {
        id: 'idle-static',
        name: 'Idle',
        type: 'idle',
        frames: 1,
        frameDurationMs: 160,
        loop: true,
        description: 'Легкое мерцание силуэта для статичной позы.',
      },
    ];

    const animations: SpriteAnimationCue[] =
      entry.animations && entry.animations.length > 0 ? entry.animations : fallbackAnimations;

    const animationDetails = animations
      .map(
        (anim) =>
          `- ${anim.id} (${anim.type}): ${anim.frames} кадр(ов) по ${anim.frameDurationMs}мс, loop=${anim.loop}. ${anim.description}`,
      )
      .join('\n');

    const palette = entry.palette.join(', ');
    const globalPalette = styleGuide.palette.join(', ');

    return `Сгенерируй один inline SVG c viewBox="0 0 ${entry.size} ${entry.size}" и width/height=${entry.size} для спрайта "${entry.name}" (${entry.role}).
Стиль: ${styleGuide.artDirection}. Свет: ${styleGuide.lighting}. Тени: ${styleGuide.shading}. Контур: ${styleGuide.strokeStyle}.
Дополнительно: ${styleGuide.textureNotes || 'текстуры сдержанные'}.
Описание объекта: ${entry.description}.
Использование: ${entry.usage}.
Контекст игры: ${gameData.title} — ${gameData.description}.
Основная палитра: ${palette || globalPalette}. Доп. палитра (при необходимости): ${globalPalette}.

Анимации/кадры:
${animationDetails}

Требования:
1. Используй только базовые фигуры (<rect>, <path>, <polygon>, <g>) чтобы имитировать пиксель-арт.
2. Каждый анимационный кадр помести в группу <g data-animation="ID" data-frame="N">.
3. Если frames > 1, создай соответствующее количество групп для указанного animation id.
4. Для эффектов используй полутонированные градиенты или дублированные контуры, избегай blur.
5. Весь SVG должен быть компактным: не более примерно 1200–1500 символов. Избегай дублирования похожих path и лишних групп.
6. Никаких комментариев, markdown и CDATA — только сам <svg>.
7. Фон оставь прозрачным, но если нужно дать силуэт, используй отдельный слой <g data-layer="shadow">.
8. Все координаты кратны 1px, избегай дробных значений.
`;
  }

  private supportsResponseFormat(model: string): boolean {
    return /(gpt-4o|gpt-4\.1|o1|o3)/i.test(model);
  }

  private debugSpritePayload(label: string, payload: string): void {
    const trimmed = (payload || '').trim();
    const previewLimit = 800;
    const preview = trimmed.length > previewLimit ? `${trimmed.slice(0, previewLimit)}…` : trimmed;
    console.debug(`[SpriteGen][${label}] preview (${trimmed.length} chars):\n${preview}`);
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

  private getTemplateSpecificSpriteRequirements(config: GameConfig): string {
    switch (config.template) {
      case GameTemplate.ARCADE:
        return `- Для аркады (вертикальный шутер): hero должен быть космическим кораблем или летательным аппаратом, который управляется игроком снизу экрана. Должен иметь анимации idle (покачивание/мерцание), move (движение), и attack (выстрел/вспышка при стрельбе).`;
      case GameTemplate.PLATFORMER:
        return `- Для платформера: hero должен быть персонажем (человек, робот, существо), который может прыгать и бегать. Должен иметь анимации idle, move (бег/ходьба), и jump (прыжок).`;
      case GameTemplate.TOWER_DEFENSE:
        return `- Для башенной обороны: hero может отсутствовать (игра без управляемого персонажа), но если нужен, то это может быть база или защищаемый объект (role=environment).`;
      case GameTemplate.PUZZLE:
        return `- Для головоломки: hero может отсутствовать, так как игра обычно без управляемого персонажа.`;
      default:
        return `- Hero должен соответствовать тематике игры и быть управляемым объектом.`;
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

