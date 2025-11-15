import Phaser from 'phaser';
import type {
  GeneratedGame,
  GeneratedGameData,
  GameVisualSettings,
  GameVariationProfile,
  GlobalMutator,
  SpriteAssetPack,
  SpritePlanEntry,
  SpriteRole,
} from '@/types';

export abstract class BaseGameScene extends Phaser.Scene {
  protected gameData!: GeneratedGame;
  protected score: number = 0;
  protected scoreText!: Phaser.GameObjects.Text;
  protected gameEnded: boolean = false;
  private endEventDispatched: boolean = false;
  protected variationProfile?: GameVariationProfile;
  protected globalScoreMultiplier: number = 1;
  protected globalTimeScale: number = 1;
  protected globalOneHitDeath: boolean = false;
  protected globalInvertHorizontal: boolean = false;
  private llmSpriteKit?: SpriteAssetPack;
  private llmTexturesById = new Map<string, string>();
  private llmTexturesByRole = new Map<SpriteRole, string[]>();
  private llmMetaByTextureKey = new Map<string, SpritePlanEntry>();
  private llmMissingTextureDebug = new Set<string>();

  constructor(config: string | Phaser.Types.Scenes.SettingsConfig = 'game') {
    super(config);
  }

  init(data?: { gameData: GeneratedGame }): void {
    // Приоритет: данные из параметра, затем из внутреннего хранилища
    if (data?.gameData) {
      this.gameData = data.gameData;
      // Также сохраняем в хранилище для надежности
      (this as unknown as { _gameData?: GeneratedGame })._gameData = data.gameData;
    } else {
      // Пытаемся получить из внутреннего хранилища
      const stored = (this as unknown as { _gameData?: GeneratedGame })._gameData;
      if (stored) {
        this.gameData = stored;
      }
    }
  }

  preload(): void {
    this.prepareLlmSprites();
  }

  create(): void {
    // Если gameData еще не установлен, пытаемся получить из внутреннего хранилища
    if (!this.gameData) {
      const stored = (this as unknown as { _gameData?: GeneratedGame })._gameData;
      if (stored) {
        this.gameData = stored;
      }
    }

    // Проверяем, что gameData установлен
    if (!this.gameData) {
      console.error('gameData is not set! Make sure to pass gameData in scene.start()');
      return;
    }

    this.score = 0;
    this.gameEnded = false;
    this.endEventDispatched = false;

    // Загружаем вариации правил игры (генеративный профиль)
    this.loadGameVariationProfile();

    // Создаем UI для счета
    this.scoreText = this.add.text(20, 20, `Очки: ${this.score}`, {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Arial',
    });
    this.scoreText.setScrollFactor(0);

    // Кнопка выхода
    const exitButton = this.add
      .text(this.scale.width - 20, 20, '✕', {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);

    exitButton.on('pointerdown', () => {
      this.endGame(true);
    });

    this.renderVariationBadge();

    this.cameras.main.setBackgroundColor(this.getVisualBackground());

    // Вызываем метод инициализации конкретной игры
    this.initGame();
  }

  protected abstract initGame(): void;

  protected hasLlmSpriteKit(): boolean {
    return Boolean(this.llmSpriteKit);
  }

  protected getLlmTextureKey(options: { id?: string; role?: SpriteRole; random?: boolean } = {}): string | undefined {
    if (!this.llmSpriteKit) {
      return undefined;
    }

    if (options.id) {
      const direct = this.llmTexturesById.get(options.id);
      if (direct) {
        return direct;
      }
    }

    if (options.role) {
      const pool = this.llmTexturesByRole.get(options.role);
      if (pool?.length) {
        return options.random ? Phaser.Utils.Array.GetRandom(pool) : pool[0];
      }
    }

    const iterator = this.llmTexturesById.values().next();
    const fallback = iterator.value as string | undefined;

    if (!fallback) {
      const key = `${options.id ?? 'no-id'}|${options.role ?? 'no-role'}`;
      if (!this.llmMissingTextureDebug.has(key)) {
        this.llmMissingTextureDebug.add(key);
        console.info('[SpriteKit] LLM-спрайт не найден, используется заглушка.', {
          request: { id: options.id, role: options.role, random: options.random },
          hasSpriteKit: Boolean(this.llmSpriteKit),
          availableIds: Array.from(this.llmTexturesById.keys()),
          roles: Array.from(this.llmTexturesByRole.keys()),
        });
      }
    }

    return fallback;
  }

  protected getLlmSpriteMetaByTexture(textureKey: string): SpritePlanEntry | undefined {
    return this.llmMetaByTextureKey.get(textureKey);
  }

  protected fitSpriteToLlmMeta(
    sprite: Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image,
    textureKey: string,
    options: { bodyWidthRatio?: number; bodyHeightRatio?: number } = {},
  ): void {
    const meta = this.llmMetaByTextureKey.get(textureKey);
    if (!meta) {
      return;
    }

    const targetSize = meta.size ?? sprite.displayWidth ?? 48;
    sprite.setDisplaySize(targetSize, targetSize);

    const body = sprite.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | undefined;
    if (body) {
      const widthRatio = Phaser.Math.Clamp(options.bodyWidthRatio ?? 0.65, 0.2, 1);
      const heightRatio = Phaser.Math.Clamp(options.bodyHeightRatio ?? 0.85, 0.2, 1);
      const bodyWidth = targetSize * widthRatio;
      const bodyHeight = targetSize * heightRatio;
      body.setSize(bodyWidth, bodyHeight);
      body.setOffset((targetSize - bodyWidth) / 2, (targetSize - bodyHeight) / 2);
    }
  }

  protected updateScore(points: number): void {
    const multiplier = Number.isFinite(this.globalScoreMultiplier)
      ? Phaser.Math.Clamp(this.globalScoreMultiplier, 0.25, 8)
      : 1;
    const delta = Math.round(points * multiplier);
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }
    this.score += delta;
    this.scoreText.setText(`Очки: ${this.score}`);
  }

  protected endGame(force: boolean = false): void {
    if (this.endEventDispatched && !force) {
      return;
    }

    if (!this.gameEnded) {
      this.gameEnded = true;
    } else if (!force) {
      return;
    }

    if (this.endEventDispatched) {
      return;
    }

    this.endEventDispatched = true;
    this.events.emit('gameEnd', this.score);
    this.scene.stop();
  }

  protected showGameOver(score: number): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.8);
    overlay.setScrollFactor(0);

    const gameOverText = this.add.text(centerX, centerY - 60, 'Игра окончена!', {
      fontSize: '36px',
      color: '#ffffff',
      fontFamily: 'Arial',
    });
    gameOverText.setOrigin(0.5);
    gameOverText.setScrollFactor(0);

    const scoreText = this.add.text(centerX, centerY, `Ваш счет: ${score}`, {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Arial',
    });
    scoreText.setOrigin(0.5);
    scoreText.setScrollFactor(0);

    const continueButton = this.add
      .text(centerX, centerY + 60, 'Продолжить', {
        fontSize: '24px',
        color: '#4CAF50',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);

    continueButton.on('pointerdown', () => {
      this.endGame(true);
    });
  }

  protected getVisualStyle(): GameVisualSettings | undefined {
    const payload = this.gameData?.gameData as GeneratedGameData | undefined;
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }

    const visuals = payload.visuals;
    if (!visuals || typeof visuals !== 'object') {
      return undefined;
    }

    return visuals;
  }

  protected getVisualColors(fallback: number[]): number[] {
    const visuals = this.getVisualStyle();
    const palette = visuals?.colors;

    if (!Array.isArray(palette) || palette.length === 0) {
      return fallback;
    }

    const parsed = palette
      .map((hex) => this.parseColorToNumber(hex))
      .filter((value): value is number => typeof value === 'number');

    return parsed.length > 0 ? parsed : fallback;
  }

  protected getVisualBackground(fallback: number = 0x1a1a2e): number {
    const visuals = this.getVisualStyle();
    if (!visuals) {
      return fallback;
    }

    const background = this.parseColorToNumber(visuals.background ?? visuals.colors?.[0]);
    if (background !== null) {
      return background;
    }

    return fallback;
  }

  protected getGameVariationProfile(): GameVariationProfile | undefined {
    return this.variationProfile;
  }

  protected getGlobalTimeScale(defaultValue: number = 1): number {
    if (!Number.isFinite(this.globalTimeScale)) {
      return defaultValue;
    }
    return Phaser.Math.Clamp(this.globalTimeScale, 0.5, 2);
  }

  private loadGameVariationProfile(): void {
    this.variationProfile = undefined;
    this.globalScoreMultiplier = 1;
    this.globalTimeScale = 1;
    this.globalOneHitDeath = false;
    this.globalInvertHorizontal = false;

    const payload = this.gameData?.gameData as GeneratedGameData | undefined;
    const mechanics = payload?.mechanics as Record<string, unknown> | undefined;
    const rawVariation =
      (mechanics?.gameVariation as GameVariationProfile | undefined) ??
      (payload?.variationProfile as GameVariationProfile | undefined);

    if (!rawVariation || typeof rawVariation !== 'object') {
      return;
    }

    const normalized = this.normalizeGameVariationProfile(rawVariation);
    this.variationProfile = normalized;

    // Маппим мутаторы в конкретные числовые флаги
    const mutators = normalized.mutators ?? [];
    const getIntensity = (predicate: (m: GlobalMutator) => boolean, fallback: number): number => {
      const match = mutators.find(predicate);
      if (!match || typeof match.intensity !== 'number' || !Number.isFinite(match.intensity)) {
        return fallback;
      }
      return match.intensity;
    };

    const scoreMul = getIntensity((m) => m.type === 'scoreMultiplier', 1);
    this.globalScoreMultiplier = Phaser.Math.Clamp(scoreMul || 1, 0.5, 6);

    const timeScale = getIntensity((m) => m.type === 'timeScale', 1);
    this.globalTimeScale = Phaser.Math.Clamp(timeScale || 1, 0.5, 2);

    const oneHitIntensity = getIntensity((m) => m.type === 'oneHitDeath', 0);
    this.globalOneHitDeath = oneHitIntensity >= 0.5;

    const invertIntensity = getIntensity((m) => m.type === 'invertHorizontalControls', 0);
    this.globalInvertHorizontal = invertIntensity >= 0.5;
  }

  private normalizeGameVariationProfile(source: GameVariationProfile): GameVariationProfile {
    const safeCodename =
      typeof source.codename === 'string' && source.codename.trim().length > 0
        ? source.codename.trim()
        : 'LLM Variant';
    const safeMood =
      typeof source.mood === 'string' && source.mood.trim().length > 0 ? source.mood.trim() : undefined;

    const allowedPace = new Set(['slow', 'normal', 'fast']);
    const hasValidPace =
      typeof source.pace === 'string' && allowedPace.has(source.pace);
    const pace = (hasValidPace ? source.pace : 'normal') as GameVariationProfile['pace'];

    const riskRaw =
      typeof source.risk === 'number' && Number.isFinite(source.risk) ? source.risk : 0.5;
    const risk = Phaser.Math.Clamp(riskRaw, 0, 1);

    const mutators: GlobalMutator[] = Array.isArray(source.mutators)
      ? source.mutators
          .filter((m): m is GlobalMutator => !!m && typeof m === 'object')
          .map((m, index) => {
            const id =
              typeof m.id === 'string' && m.id.trim().length > 0
                ? m.id.trim()
                : `mutator-${index}`;
            const name =
              typeof m.name === 'string' && m.name.trim().length > 0
                ? m.name.trim()
                : id;
            const description =
              typeof m.description === 'string' && m.description.trim().length > 0
                ? m.description.trim()
                : name;
            const type = m.type;
            const allowedTypes: GlobalMutator['type'][] = [
              'scoreMultiplier',
              'timeScale',
              'oneHitDeath',
              'invertHorizontalControls',
            ];
            const isValidType = allowedTypes.includes(type);
            if (!isValidType) {
              return undefined;
            }
            let intensity: number | undefined;
            if (typeof m.intensity === 'number' && Number.isFinite(m.intensity)) {
              intensity = m.intensity;
            }
            return { id, name, description, type, intensity };
          })
          .filter((m): m is GlobalMutator => !!m)
      : [];

    return {
      codename: safeCodename,
      mood: safeMood,
      pace,
      risk,
      mutators,
    };
  }

  private renderVariationBadge(): void {
    const variation = this.variationProfile;
    if (!variation || !variation.mutators || variation.mutators.length === 0) {
      return;
    }

    const names = variation.mutators.map((m) => m.name).filter((name) => !!name);
    if (!names.length) {
      return;
    }

    const label = `${variation.codename} · ${names.join(', ')}`;
    const text = this.add.text(this.scale.width / 2, this.scale.height - 24, label, {
      fontSize: '14px',
      color: '#ffe082',
      fontFamily: 'Arial',
    });
    text.setOrigin(0.5, 1);
    text.setScrollFactor(0);
  }

  private prepareLlmSprites(): void {
    this.llmSpriteKit = undefined;
    this.llmTexturesById.clear();
    this.llmTexturesByRole.clear();
    this.llmMetaByTextureKey.clear();
    this.llmMissingTextureDebug.clear();

    const payload = this.gameData?.gameData as GeneratedGameData | undefined;
    const kit = payload?.assets?.spriteKit;
    if (!kit || !kit.spriteSheets?.length) {
      console.info('[SpriteKit] Набор LLM-спрайтов отсутствует или пустой.', {
        hasAssets: Boolean(payload?.assets),
        spriteSheets: kit?.spriteSheets?.length ?? 0,
      });
      return;
    }

    this.llmSpriteKit = kit;

    kit.spriteSheets.forEach((sheet) => {
      if (!sheet?.svg || !sheet.meta?.id) {
        return;
      }

      const textureKey = `llm-${this.gameData.id}-${sheet.meta.id}`;
      if (this.textures.exists(textureKey)) {
        this.textures.remove(textureKey);
      }

      try {
        this.textures.addBase64(textureKey, this.svgToDataUrl(sheet.svg));
        this.llmTexturesById.set(sheet.meta.id, textureKey);
        this.llmMetaByTextureKey.set(textureKey, sheet.meta);

        const roleList = this.llmTexturesByRole.get(sheet.meta.role) ?? [];
        roleList.push(textureKey);
        this.llmTexturesByRole.set(sheet.meta.role, roleList);
      } catch (error) {
        console.warn('[SpriteKit] Не удалось загрузить SVG текстуру', sheet.meta?.id, error);
      }
    });

    console.info('[SpriteKit] Набор LLM-спрайтов загружен.', {
      gameId: this.gameData.id,
      title: this.gameData.title,
      totalTextures: this.llmTexturesById.size,
      roles: Array.from(this.llmTexturesByRole.entries()).map(([role, list]) => ({
        role,
        count: list.length,
      })),
    });
  }

  private svgToDataUrl(svg: string): string {
    const trimmed = svg.trim();
    const globalWithEnc = globalThis as typeof globalThis & {
      btoa?: typeof btoa;
      Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } };
    };

    if (typeof globalWithEnc.btoa === 'function') {
      const encoded = globalWithEnc.btoa(unescape(encodeURIComponent(trimmed)));
      return `data:image/svg+xml;base64,${encoded}`;
    }

    const bufferCtor = globalWithEnc.Buffer;
    if (bufferCtor) {
      const encoded = bufferCtor.from(trimmed, 'utf-8').toString('base64');
      return `data:image/svg+xml;base64,${encoded}`;
    }

    throw new Error('Нет доступного способа кодировать SVG в base64');
  }

  private parseColorToNumber(input?: string | null): number | null {
    if (!input || typeof input !== 'string') {
      return null;
    }

    let normalized = input.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.startsWith('#')) {
      normalized = normalized.slice(1);
    } else if (normalized.toLowerCase().startsWith('0x')) {
      normalized = normalized.slice(2);
    }

    normalized = normalized.replace(/[^a-f0-9]/gi, '');

    if (normalized.length === 3) {
      normalized = normalized
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }

    if (normalized.length !== 6) {
      return null;
    }

    const value = Number.parseInt(normalized, 16);
    return Number.isNaN(value) ? null : value;
  }
}

