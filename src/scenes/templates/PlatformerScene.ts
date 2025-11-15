import { VerticalBaseScene } from './VerticalStandardScene';
import Phaser from 'phaser';
import type {
  PlatformerVariantSettings,
  PlatformerObjectiveType,
  PlatformerEnemyArchetype,
  PlatformerBonusRules,
  PlatformerHazardPack,
  PlatformerPowerUp,
} from '@/types';

export class PlatformerScene extends VerticalBaseScene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private stars!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.StaticGroup;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private collectedStars: number = 0;
  private gameSpeed: number = 1;
  private mobileControls: {
    leftPressed: boolean;
    rightPressed: boolean;
    jumpPressed: boolean;
  } = {
    leftPressed: false,
    rightPressed: false,
    jumpPressed: false,
  };
  private timerText!: Phaser.GameObjects.Text;
  private timeLeft: number = 120;
  private timerEvent?: Phaser.Time.TimerEvent;
  private comboMultiplier = 1;
  private comboResetEvent?: Phaser.Time.TimerEvent;
  private comboText!: Phaser.GameObjects.Text;
  private parallaxLayers: Phaser.GameObjects.Rectangle[] = [];
  private readonly defaultPalette: number[] = [0x0a1428, 0x00bfff, 0xffffff, 0x708090, 0xffc107];
  private variantPalette: number[] | null = null;
  private theme = {
    palette: [] as number[],
    background: 0x0a1428,
    midLayer: 0x132347,
    glowLayer: 0x1b2b59,
    platform: 0x1f4068,
    player: 0x4caf50,
    star: 0xffd700,
    enemy: 0xff4c4c,
    hazard: 0xf44336,
    obstacle: 0xff9800,
    mobileButton: 0x666666,
    jumpButton: 0x4caf50,
    combo: 0x4caf50,
  };
  private powerUps!: Phaser.Physics.Arcade.Group;
  private powerUpSpawnEvent?: Phaser.Time.TimerEvent;
  private powerUpText!: Phaser.GameObjects.Text;
  private speedBoostMultiplier: number = 1;
  private speedBoostTimer?: Phaser.Time.TimerEvent;
  private shieldTimer?: Phaser.Time.TimerEvent;
  private shieldCharges: number = 0;
  private scoreBoostTimer?: Phaser.Time.TimerEvent;
  private scoreBoostActive: boolean = false;
  private variantSettings!: PlatformerVariantSettings;
  private objectiveType: PlatformerObjectiveType = 'collect';
  private objectiveDescription: string = 'Собери все звезды';
  private objectiveText!: Phaser.GameObjects.Text;
  private objectiveTargetCount: number = 18;
  private objectiveTargetScore: number = 600;
  private objectiveProgress: number = 0;
  private objectiveCompleted: boolean = false;
  private survivalBonusTime: number = 120;
  private collectibleLabel: string = 'звезды';
  private comboLabel: string = 'Комбо';
  private comboDecayMs: number = 2000;
  private collectibleScoreValue: number = 12;
  private baseCollectibleValue: number = 12;
  private hazardSettings!: PlatformerHazardPack;

  private loadVariantSettings(): void {
    const defaults = this.getDefaultVariantSettings();
    const mechanics = this.gameData?.gameData?.mechanics as Record<string, unknown> | undefined;
    const variantRaw = (mechanics?.platformerVariant ?? mechanics?.variant) as Partial<PlatformerVariantSettings> | undefined;

    this.variantSettings = this.hydrateVariantSettings(defaults, variantRaw);
    this.objectiveType = this.variantSettings.objective.type;
    this.objectiveDescription = this.variantSettings.objective.description;
    this.objectiveTargetCount = this.clampNumber(this.variantSettings.objective.targetCount ?? 18, 6, 60);
    this.objectiveTargetScore = this.clampNumber(this.variantSettings.objective.targetScore ?? 600, 200, 4000);
    this.survivalBonusTime = this.clampNumber(this.variantSettings.objective.survivalTime ?? 120, 30, 420);
    this.collectibleLabel = this.variantSettings.bonusRules.collectibleName;
    this.comboLabel = this.variantSettings.bonusRules.comboName;
    this.comboDecayMs = this.clampNumber(Math.round(this.variantSettings.bonusRules.comboDecaySeconds * 1000), 800, 6000);
    this.collectibleScoreValue = this.variantSettings.bonusRules.pointsPerCollectible;
    this.baseCollectibleValue = this.collectibleScoreValue;
    this.hazardSettings = this.variantSettings.hazardPack;
    const parsedPalette = this.parsePaletteToNumbers(this.variantSettings.palette);
    this.variantPalette = parsedPalette?.length ? parsedPalette : null;

    if (this.objectiveType === 'survive') {
      this.timeLeft = this.survivalBonusTime;
    }
  }

  private hydrateVariantSettings(
    defaults: PlatformerVariantSettings,
    incoming?: Partial<PlatformerVariantSettings>,
  ): PlatformerVariantSettings {
    if (!incoming || typeof incoming !== 'object') {
      return defaults;
    }

    const palette = Array.isArray(incoming.palette) && incoming.palette.length > 0 ? incoming.palette : defaults.palette;
    const objective = this.buildObjective(incoming.objective, defaults.objective);
    const enemyArchetypes = this.buildEnemyArchetypes(incoming.enemyArchetypes, defaults.enemyArchetypes);
    const bonusRules = this.buildBonusRules(incoming.bonusRules, defaults.bonusRules);
    const hazardPack = this.buildHazardPack(incoming.hazardPack, defaults.hazardPack);

    return {
      variantName: this.getString(incoming.variantName, defaults.variantName),
      variantDescription: this.getString(incoming.variantDescription, defaults.variantDescription),
      palette,
      objective,
      enemyArchetypes,
      bonusRules,
      hazardPack,
    };
  }

  private getDefaultVariantSettings(): PlatformerVariantSettings {
    return {
      variantName: 'Классический забег',
      variantDescription: 'Собери все светящиеся кристаллы в ретро-неоне, избегая патрулей.',
      palette: ['#0a1428', '#00bfff', '#4caf50', '#ffc107'],
      objective: {
        type: 'collect',
        description: 'Собери все кристаллы',
        targetCount: 18,
        bonusOnComplete: 200,
      },
      enemyArchetypes: [
        {
          id: 'patrol',
          name: 'Неоновый страж',
          description: 'Патрулирует платформы и отталкивается от стен.',
          behavior: 'patrol',
          ability: 'Изменяет направление при каждом столкновении',
          speedMultiplier: 1,
          jumpStrength: 220,
          aggression: 0.4,
          color: '#ff4c4c',
        },
        {
          id: 'hunter',
          name: 'Ионный охотник',
          description: 'Преследует игрока короткими рывками.',
          behavior: 'chaser',
          ability: 'Каждые пару секунд ускоряется к игроку',
          speedMultiplier: 1.2,
          jumpStrength: 250,
          aggression: 0.7,
          color: '#ff8c00',
        },
      ],
      bonusRules: {
        collectibleName: 'кристаллы',
        pointsPerCollectible: 12,
        comboName: 'Комбо',
        comboDecaySeconds: 2,
        powerUps: [
          {
            id: 'speed',
            name: 'Неоновый рывок',
            effect: 'speed',
            duration: 5,
            description: 'Увеличивает скорость передвижения',
          },
          {
            id: 'shield',
            name: 'Грязевой щит',
            effect: 'shield',
            duration: 6,
            description: 'Поглощает один удар',
          },
        ],
      },
      hazardPack: {
        fallingFrequency: 4,
        fallingSpeed: 140,
        floorHazardCount: 4,
        specialStyle: 'static',
        description: 'Стандартные шипы и периодические падающие блоки',
      },
    };
  }

  private buildObjective(
    source: PlatformerVariantSettings['objective'] | undefined,
    fallback: PlatformerVariantSettings['objective'],
  ): PlatformerVariantSettings['objective'] {
    if (!source || typeof source !== 'object') {
      return fallback;
    }

    const validType: PlatformerObjectiveType = ['collect', 'score', 'survive'].includes(source.type ?? '')
      ? (source.type as PlatformerObjectiveType)
      : fallback.type;

    return {
      type: validType,
      description: this.getString(source.description, fallback.description),
      targetCount: this.clampNumber(source.targetCount ?? fallback.targetCount ?? 18, 6, 60),
      targetScore: this.clampNumber(source.targetScore ?? fallback.targetScore ?? 600, 200, 6000),
      survivalTime: this.clampNumber(source.survivalTime ?? fallback.survivalTime ?? 120, 30, 600),
      bonusOnComplete: this.clampNumber(source.bonusOnComplete ?? fallback.bonusOnComplete ?? 200, 0, 2000),
    };
  }

  private buildEnemyArchetypes(
    source: PlatformerEnemyArchetype[] | undefined,
    fallback: PlatformerEnemyArchetype[],
  ): PlatformerEnemyArchetype[] {
    if (!Array.isArray(source) || source.length === 0) {
      return fallback;
    }

    const sanitized = source
      .map<PlatformerEnemyArchetype | undefined>((item, index) => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const base = fallback[index % fallback.length];
        return {
          id: this.getString(item.id, base.id),
          name: this.getString(item.name, base.name),
          description: this.getString(item.description, base.description),
          behavior: ['patrol', 'chaser', 'hopper'].includes(item.behavior ?? '')
            ? (item.behavior as PlatformerEnemyArchetype['behavior'])
            : base.behavior,
          ability: this.getString(item.ability, base.ability),
          speedMultiplier: this.clampNumber(item.speedMultiplier ?? base.speedMultiplier, 0.5, 2),
          jumpStrength: this.clampNumber(item.jumpStrength ?? base.jumpStrength, 140, 360),
          aggression: this.clampNumber(item.aggression ?? base.aggression, 0, 1),
          color: item.color && typeof item.color === 'string' ? item.color : base.color,
        };
      })
      .filter((item): item is PlatformerEnemyArchetype => Boolean(item));

    return sanitized.length > 0 ? sanitized : fallback;
  }

  private buildBonusRules(
    source: PlatformerBonusRules | undefined,
    fallback: PlatformerBonusRules,
  ): PlatformerBonusRules {
    if (!source || typeof source !== 'object') {
      return fallback;
    }

    const powerUps = Array.isArray(source.powerUps) ? this.buildPowerUps(source.powerUps, fallback.powerUps ?? []) : fallback.powerUps;

    return {
      collectibleName: this.getString(source.collectibleName, fallback.collectibleName),
      pointsPerCollectible: this.clampNumber(source.pointsPerCollectible ?? fallback.pointsPerCollectible, 4, 60),
      comboName: this.getString(source.comboName, fallback.comboName),
      comboDecaySeconds: this.clampNumber(source.comboDecaySeconds ?? fallback.comboDecaySeconds, 0.8, 6),
      powerUps,
    };
  }

  private buildPowerUps(source: PlatformerPowerUp[], fallback: PlatformerPowerUp[]): PlatformerPowerUp[] {
    const sanitized = source
      .map((item, index) => {
        if (!item || typeof item !== 'object') {
          return undefined;
        }
        const base = fallback[index % Math.max(1, fallback.length)];
        const validEffect = ['speed', 'shield', 'scoreBoost'].includes(item.effect ?? '')
          ? (item.effect as PlatformerPowerUp['effect'])
          : base?.effect ?? 'speed';
        return {
          id: this.getString(item.id, base?.id ?? `power${index}`),
          name: this.getString(item.name, base?.name ?? 'Бонус'),
          effect: validEffect,
          duration: this.clampNumber(item.duration ?? base?.duration ?? 4, 2, 10),
          description: this.getString(item.description, base?.description ?? 'Уникальный эффект'),
        };
      })
      .filter((item): item is PlatformerPowerUp => Boolean(item));

    return sanitized.length > 0 ? sanitized : fallback;
  }

  private buildHazardPack(
    source: PlatformerHazardPack | undefined,
    fallback: PlatformerHazardPack,
  ): PlatformerHazardPack {
    if (!source || typeof source !== 'object') {
      return fallback;
    }

    const validStyle: PlatformerHazardPack['specialStyle'] = ['static', 'pulse', 'slide'].includes(source.specialStyle ?? '')
      ? source.specialStyle
      : fallback.specialStyle;

    return {
      fallingFrequency: this.clampNumber(source.fallingFrequency ?? fallback.fallingFrequency, 1.5, 8),
      fallingSpeed: this.clampNumber(source.fallingSpeed ?? fallback.fallingSpeed, 60, 260),
      floorHazardCount: Math.round(this.clampNumber(source.floorHazardCount ?? fallback.floorHazardCount, 2, 10)),
      specialStyle: validStyle,
      description: this.getString(source.description, fallback.description),
    };
  }

  private getString(value: unknown, fallback?: string, defaultValue: string = ''): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof fallback === 'string' && fallback.trim().length > 0) {
      return fallback.trim();
    }
    return defaultValue;
  }

  private parsePaletteToNumbers(palette?: string[] | null): number[] | null {
    if (!Array.isArray(palette) || palette.length === 0) {
      return null;
    }
    const parsed = palette
      .map((color) => this.parseHexColor(color))
      .filter((value): value is number => typeof value === 'number');
    return parsed.length > 0 ? parsed : null;
  }

  private parseHexColor(value?: string | null): number | null {
    if (!value || typeof value !== 'string') {
      return null;
    }
    let normalized = value.trim();
    if (normalized.startsWith('#')) {
      normalized = normalized.slice(1);
    } else if (normalized.startsWith('0x')) {
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
    const parsed = Number.parseInt(normalized, 16);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private clampNumber(value: unknown, min: number, max: number): number {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : min;
    return Phaser.Math.Clamp(num, min, max);
  }

  initGame(): void {
    this.loadVariantSettings();
    this.applyVisualTheme();
    this.initVerticalLayout({
      minSafeWidth: 360,
      maxSafeWidth: 560,
      paddingX: 0.04,
      paddingY: 0.02,
    });
    const config = this.gameData.config;
    const globalTimeScale = this.getGlobalTimeScale(1);
    const rawSpeed = (config.params.speed as number) || 1;
    this.gameSpeed = Phaser.Math.Clamp(rawSpeed * globalTimeScale, 0.5, 2.4);
    this.objectiveProgress = 0;
    this.objectiveCompleted = false;
    this.speedBoostMultiplier = 1;
    this.shieldCharges = 0;
    this.scoreBoostActive = false;

    const viewportWidth = Math.max(this.safeBounds.width, 320);
    const viewportHeight = Math.max(this.safeBounds.height, 560);
    const worldHeight = viewportHeight * 2.2;

    this.physics.world.setBounds(0, 0, viewportWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, viewportWidth, worldHeight);

    // Фон
    this.createBackgroundLayers(viewportWidth, viewportHeight);

    // Создаем платформы
    this.platforms = this.physics.add.staticGroup();
    this.createPlatforms(worldHeight, viewportWidth);

    // Создаем игрока (используем спрайт с временной текстурой)
    const playerX = viewportWidth / 2;
    const startY = Math.max(worldHeight - viewportHeight + 160, viewportHeight * 0.5);
    this.createPlayer(playerX, startY);

    // Создаем звезды
    this.stars = this.physics.add.group();
    this.spawnStars(worldHeight, viewportWidth);

    this.physics.add.collider(this.stars, this.platforms);
    this.physics.add.overlap(this.player, this.stars, this.collectStar as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    // Создаем врагов
    this.enemies = this.physics.add.group();
    this.createEnemies(worldHeight, viewportWidth);

    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);

    // Опасности (шипы и лазеры)
    this.hazards = this.physics.add.staticGroup();
    this.spawnHazards(worldHeight, viewportWidth);
    this.physics.add.collider(this.player, this.hazards, this.hitHazard, undefined, this);

    // Дополнительные препятствия
    this.obstacles = this.physics.add.group({ allowGravity: false });
    this.spawnFallingObstacles(viewportWidth);
    this.physics.add.overlap(this.player, this.obstacles, this.hitHazard, undefined, this);

    this.powerUps = this.physics.add.group();
    this.physics.add.overlap(this.player, this.powerUps, this.collectPowerUp as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.collider(this.powerUps, this.platforms);
    this.schedulePowerUps();

    // Управление
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    } else {
      // Для мобильных устройств создаем виртуальные кнопки или используем касания
      this.setupMobileControls();
    }

    // Камера и HUD
    this.setupCamera(viewportHeight, worldHeight);
    this.createTimerUI();
    this.startLevelTimer();
  }

  private applyVisualTheme(): void {
    const palette = this.getVisualColors(this.variantPalette ?? this.defaultPalette);
    const pick = (index: number, fallback: number): number => {
      if (!palette.length) {
        return fallback;
      }
      const selected = palette[index % palette.length];
      return typeof selected === 'number' ? selected : fallback;
    };

    this.theme.palette = palette;
    const backgroundHint = pick(0, this.theme.background);
    this.theme.background = this.getVisualBackground(backgroundHint);
    this.theme.midLayer = this.adjustColor(this.theme.background, -0.18);
    this.theme.glowLayer = this.adjustColor(this.theme.background, 0.12);
    this.theme.platform = pick(1, this.theme.platform);
    this.theme.player = pick(2, this.theme.player);
    this.theme.star = pick(0, this.theme.star);
    this.theme.enemy = pick(3, this.theme.enemy);
    this.theme.hazard = pick(2, this.theme.hazard);
    this.theme.obstacle = pick(1, this.theme.obstacle);
    this.theme.mobileButton = pick(2, this.theme.mobileButton);
    this.theme.jumpButton = pick(0, this.theme.jumpButton);
    this.theme.combo = pick(0, this.theme.combo);
  }

  private adjustColor(color: number, factor: number): number {
    const apply = (component: number): number => {
      if (factor >= 0) {
        return Math.round(Phaser.Math.Clamp(component + (255 - component) * factor, 0, 255));
      }
      return Math.round(Phaser.Math.Clamp(component * (1 + factor), 0, 255));
    };

    const r = apply((color >> 16) & 0xff);
    const g = apply((color >> 8) & 0xff);
    const b = apply(color & 0xff);
    return (r << 16) | (g << 8) | b;
  }

  private colorToHex(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
  }

  private setupMobileControls(): void {
    // Создаем виртуальные кнопки для мобильных устройств
    const buttonSize = 60;
    const padding = 20;
    
    // Левая кнопка
    const leftButton = this.add
      .rectangle(
        padding + buttonSize / 2,
        this.scale.height - padding - buttonSize / 2,
        buttonSize,
        buttonSize,
        this.theme.mobileButton,
        0.7,
      )
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    
    leftButton.on('pointerdown', () => {
      this.mobileControls.leftPressed = true;
    });
    
    leftButton.on('pointerup', () => {
      this.mobileControls.leftPressed = false;
    });

    leftButton.on('pointerout', () => {
      this.mobileControls.leftPressed = false;
    });

    // Правая кнопка
    const rightButton = this.add
      .rectangle(
        padding + buttonSize * 2.5,
        this.scale.height - padding - buttonSize / 2,
        buttonSize,
        buttonSize,
        this.theme.mobileButton,
        0.7,
      )
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    
    rightButton.on('pointerdown', () => {
      this.mobileControls.rightPressed = true;
    });
    
    rightButton.on('pointerup', () => {
      this.mobileControls.rightPressed = false;
    });

    rightButton.on('pointerout', () => {
      this.mobileControls.rightPressed = false;
    });

    // Кнопка прыжка
    const jumpButton = this.add
      .rectangle(
        this.scale.width - padding - buttonSize / 2,
        this.scale.height - padding - buttonSize / 2,
        buttonSize,
        buttonSize,
        this.theme.jumpButton,
        0.7,
      )
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0);
    
    jumpButton.on('pointerdown', () => {
      this.mobileControls.jumpPressed = true;
      if (this.player.body!.touching.down) {
        this.player.setVelocityY(-330);
      }
    });

    jumpButton.on('pointerup', () => {
      this.mobileControls.jumpPressed = false;
    });

    jumpButton.on('pointerout', () => {
      this.mobileControls.jumpPressed = false;
    });

    // Создаем заглушку для cursors, чтобы избежать ошибок
    this.cursors = {
      left: { isDown: false } as Phaser.Input.Keyboard.Key,
      right: { isDown: false } as Phaser.Input.Keyboard.Key,
      up: { isDown: false } as Phaser.Input.Keyboard.Key,
      down: { isDown: false } as Phaser.Input.Keyboard.Key,
      space: { isDown: false } as Phaser.Input.Keyboard.Key,
      shift: { isDown: false } as Phaser.Input.Keyboard.Key,
    } as Phaser.Types.Input.Keyboard.CursorKeys;
  }

  private createBackgroundLayers(width: number, height: number): void {
    this.cameras.main.setBackgroundColor(this.theme.background);

    const base = this.add.rectangle(width / 2, height / 2, width, height * 3, this.theme.background, 1);
    base.setScrollFactor(0);

    const midLayer = this.add.rectangle(width / 2, height / 2, width, height * 3, this.theme.midLayer, 0.55);
    midLayer.setScrollFactor(0.2);

    const glowLayer = this.add.rectangle(width / 2, height / 2, width, height * 3, this.theme.glowLayer, 0.35);
    glowLayer.setScrollFactor(0.4);

    this.parallaxLayers = [midLayer, glowLayer];
  }

  private ensureTexture(prefix: string, width: number, height: number, color: number): string {
    const key = `${prefix}_${width}x${height}_${color.toString(16)}`;
    if (!this.textures.exists(key)) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false } as Phaser.Types.GameObjects.Graphics.Options);
      graphics.fillStyle(color, 1);
      graphics.fillRoundedRect(0, 0, width, height, Math.min(16, height / 2));
      graphics.generateTexture(key, width, height);
      graphics.destroy();
    }
    return key;
  }

  private createPlayer(x: number, y: number): void {
    const llmTextureById = this.getLlmTextureKey({ id: 'hero-player' });
    const llmTextureByRole = this.getLlmTextureKey({ role: 'hero' });
    const llmTexture = llmTextureById ?? llmTextureByRole;

    // Проверяем, существует ли текстура в Phaser перед использованием
    const textureKey = llmTexture && this.textures.exists(llmTexture) 
      ? llmTexture 
      : this.ensureTexture('player', 36, 36, this.theme.player);

    this.player = this.physics.add.sprite(x, y, textureKey);
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);
    if (llmTexture && this.textures.exists(llmTexture)) {
      this.fitSpriteToLlmMeta(this.player, llmTexture, { bodyWidthRatio: 0.58, bodyHeightRatio: 0.85 });
    } else {
      this.player.setSize(28, 32);
      this.player.setOffset((this.player.width - 28) / 2, (this.player.height - 32) / 2);
    }
    this.physics.add.collider(this.player, this.platforms);
  }

  private createPlatforms(worldHeight: number, width: number): void {
    const platformCount = 14;
    for (let i = 0; i < platformCount; i++) {
      const platformWidth = Phaser.Math.Between(Math.floor(width * 0.35), Math.floor(width * 0.7));
      const x = Phaser.Math.Between(platformWidth / 2 + 16, width - platformWidth / 2 - 16);
      const y = worldHeight - i * (worldHeight / platformCount) - 120;
      const textureKey = this.ensureTexture('platform', platformWidth, 24, this.theme.platform);
      const platform = this.platforms.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
      platform.refreshBody();
    }
  }

  private spawnStars(worldHeight: number, width: number): void {
    const starCount = this.objectiveType === 'collect' ? this.objectiveTargetCount : 18;
    for (let i = 0; i < starCount; i++) {
      const x = Phaser.Math.Between(40, width - 40);
      const y = worldHeight - (i * (worldHeight / starCount)) - 80;
      const llmTexture = this.getLlmTextureKey({ role: 'bonus', random: true });
      const textureKey = llmTexture ?? this.ensureTexture('star', 18, 18, this.theme.star);
      const star = this.stars.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
      if (llmTexture) {
        this.fitSpriteToLlmMeta(star, llmTexture, { bodyWidthRatio: 0.5, bodyHeightRatio: 0.6 });
      } else {
        star.setCircle(9);
      }
      star.setBounceY(Phaser.Math.FloatBetween(0.2, 0.5));
    }
  }

  private createEnemies(worldHeight: number, width: number): void {
    const requested = Number(this.gameData.config.params.enemyCount);
    const baseCount = Number.isFinite(requested) && requested > 0 ? requested : 4 + Math.floor(this.gameSpeed * 2);
    const enemyCount = Math.max(this.variantSettings.enemyArchetypes.length, baseCount);
    for (let i = 0; i < enemyCount; i++) {
      const archetype = this.variantSettings.enemyArchetypes[i % this.variantSettings.enemyArchetypes.length];
      const tint = this.parseHexColor(archetype.color) ?? this.theme.enemy;
      const llmTexture =
        this.getLlmTextureKey({ id: archetype.id }) ?? this.getLlmTextureKey({ role: 'enemy', random: true });
      const textureKey = llmTexture ?? this.ensureTexture(`enemy_${archetype.id}`, 28, 28, tint);
      const x = Phaser.Math.Between(40, width - 40);
      const y = worldHeight - Phaser.Math.Between(200, worldHeight - 200);
      const enemy = this.enemies.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
      if (llmTexture) {
        this.fitSpriteToLlmMeta(enemy, llmTexture, { bodyWidthRatio: 0.58, bodyHeightRatio: 0.8 });
      }
      enemy.setBounce(archetype.behavior === 'hopper' ? 1 : 0.8, archetype.behavior === 'hopper' ? 0.4 : 0);
      enemy.setCollideWorldBounds(true);
      enemy.setVelocityX(Phaser.Math.Between(-80, 80) * archetype.speedMultiplier * this.gameSpeed);
      if (!llmTexture) {
        enemy.setTint(tint);
      }
      enemy.setData('archetype', archetype);
      enemy.setData('baseSpeed', 70 * archetype.speedMultiplier * this.gameSpeed);
      enemy.setData('jumpStrength', archetype.jumpStrength);
      enemy.setData('aggression', archetype.aggression);
      enemy.setData('nextJump', this.time.now + Phaser.Math.Between(1000, 2000));
      enemy.setData('abilityCooldown', this.time.now + Phaser.Math.Between(1500, 2600));
    }
  }

  private spawnHazards(worldHeight: number, width: number): void {
    const hazardWidth = 40;
    const hazardHeight = 16;
    const textureKey = this.ensureTexture('hazard', hazardWidth, hazardHeight, this.theme.hazard);
    const hazardCount = Math.max(2, this.hazardSettings.floorHazardCount);

    for (let i = 0; i < hazardCount; i++) {
      const x = (i + 1) * (width / (hazardCount + 1));
      const y = worldHeight - Phaser.Math.Between(40, 140);
      const hazard = this.hazards.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
      hazard.refreshBody();
      if (this.hazardSettings.specialStyle === 'pulse') {
        this.tweens.add({
          targets: hazard,
          scaleX: { from: 0.8, to: 1.25 },
          duration: 1200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (this.hazardSettings.specialStyle === 'slide') {
        const offset = Phaser.Math.Between(30, 60);
        this.tweens.add({
          targets: hazard,
          x: x + (i % 2 === 0 ? offset : -offset),
          duration: 1800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private spawnFallingObstacles(width: number): void {
    const textureKey = this.ensureTexture('obstacle', 20, 40, this.theme.obstacle);
    this.time.addEvent({
      delay: Phaser.Math.Clamp(this.hazardSettings.fallingFrequency * 1000, 1200, 6000),
      loop: true,
      callback: () => {
        if (this.gameEnded) return;
        const x = Phaser.Math.Between(30, width - 30);
        const obstacle = this.obstacles.create(x, this.cameras.main.worldView.y - 50, textureKey) as Phaser.Physics.Arcade.Sprite;
        const baseVelocity = this.hazardSettings.fallingSpeed + this.gameSpeed * 30;
        obstacle.setVelocityY(baseVelocity);
        obstacle.setImmovable(true);
        obstacle.setData('lifetime', this.time.now + 8000);
      },
    });
  }

  private setupCamera(viewportHeight: number, worldHeight: number): void {
    const offsetY = viewportHeight * 0.25;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.2);
    this.cameras.main.setFollowOffset(0, -offsetY);
    this.cameras.main.setLerp(0.15, 0.2);

    const initialY = Phaser.Math.Clamp(this.player.y - viewportHeight / 2, 0, worldHeight - viewportHeight);
    this.cameras.main.scrollY = initialY;
  }

  private createTimerUI(): void {
    const padding = 16;
    this.timerText = this.add
      .text(this.scale.width - padding, padding, this.formatTime(this.timeLeft), {
        fontSize: '20px',
        color: '#FFFFFF',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0);

    const comboColor = this.colorToHex(this.theme.combo);
    this.comboText = this.add
      .text(padding, padding, `${this.comboLabel} x1`, {
        fontSize: '18px',
        color: comboColor,
        fontFamily: 'Arial',
      })
      .setScrollFactor(0);

    this.objectiveText = this.add
      .text(padding, padding + 26, '', {
        fontSize: '16px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setScrollFactor(0);

    this.powerUpText = this.add
      .text(padding, padding + 46, 'Бонусы: нет', {
        fontSize: '14px',
        color: '#cccccc',
        fontFamily: 'Arial',
      })
      .setScrollFactor(0);

    this.add
      .text(this.scale.width / 2, padding, this.variantSettings.variantName, {
        fontSize: '18px',
        color: '#f0f0f0',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    this.updateObjectiveText();
    this.updatePowerUpText();
  }

  private startLevelTimer(): void {
    const configDuration = Number(this.gameData.config.params.duration);
    const fallbackDuration = Number.isFinite(configDuration) && configDuration > 0 ? configDuration : 120;
    this.timeLeft = this.objectiveType === 'survive' ? this.survivalBonusTime : fallbackDuration;
    this.timerEvent?.remove(false);
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.timeLeft -= 1;
        this.timerText.setText(this.formatTime(Math.max(this.timeLeft, 0)));
        this.updateObjectiveText();
        if (this.timeLeft <= 0) {
          this.timerEvent?.remove(false);
          if (this.objectiveType === 'survive') {
            this.completeObjective();
          } else if (!this.objectiveCompleted) {
            this.showGameOver(this.score);
          }
        }
      },
    });
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  }

  private refreshComboTimer(): void {
    this.comboResetEvent?.remove(false);
    this.comboResetEvent = this.time.addEvent({
      delay: this.comboDecayMs,
      callback: () => {
        this.comboMultiplier = 1;
        this.updateComboText();
      },
    });
  }

  private updateEnemyBehaviorLogic(): void {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || !enemy.body) return;
      const archetype = enemy.getData('archetype') as PlatformerEnemyArchetype | undefined;
      if (!archetype) return;

      const baseSpeed = (enemy.getData('baseSpeed') as number | undefined) ?? 80;
      if (archetype.behavior === 'chaser') {
        const direction = this.player.x < enemy.x ? -1 : 1;
        enemy.setVelocityX(direction * baseSpeed * this.speedBoostMultiplier);
        if (enemy.body.blocked.down && Math.random() < archetype.aggression * 0.02) {
          enemy.setVelocityY(-archetype.jumpStrength);
        }
      } else if (archetype.behavior === 'hopper') {
        const nextJump = (enemy.getData('nextJump') as number | undefined) ?? 0;
        if (enemy.body.blocked.down && this.time.now >= nextJump) {
          enemy.setVelocityY(-archetype.jumpStrength);
          enemy.setData('nextJump', this.time.now + Phaser.Math.Between(700, 1400));
        }
        const drift = Math.sin(this.time.now * 0.001 + enemy.x * 0.01);
        enemy.setVelocityX(drift * baseSpeed);
      } else {
        if (enemy.body.blocked.left) {
          enemy.setVelocityX(baseSpeed);
        } else if (enemy.body.blocked.right) {
          enemy.setVelocityX(-baseSpeed);
        }
      }
    });
  }

  private updateObjectiveText(): void {
    if (!this.objectiveText) return;
    const progress = this.getObjectiveProgressLabel();
    const suffix = progress ? ` (${progress})` : '';
    this.objectiveText.setText(`Цель: ${this.objectiveDescription}${suffix}`);
  }

  private getObjectiveProgressLabel(): string {
    if (this.objectiveType === 'collect') {
      return `${this.objectiveProgress}/${this.objectiveTargetCount} ${this.collectibleLabel}`;
    }
    if (this.objectiveType === 'score') {
      return `${this.score}/${this.objectiveTargetScore}`;
    }
    if (this.objectiveType === 'survive') {
      return `${Math.max(0, Math.ceil(this.timeLeft))} сек`;
    }
    return '';
  }

  private updatePowerUpText(): void {
    if (!this.powerUpText) return;
    const states: string[] = [];
    if (this.speedBoostMultiplier > 1) states.push('Скорость');
    if (this.shieldCharges > 0) states.push('Щит');
    if (this.scoreBoostActive) states.push('Очки');
    this.powerUpText.setText(states.length ? `Бонусы: ${states.join(', ')}` : 'Бонусы: нет');
  }

  private schedulePowerUps(): void {
    this.powerUpSpawnEvent?.remove(false);
    const pool = this.variantSettings.bonusRules.powerUps;
    if (!pool || pool.length === 0) {
      return;
    }
    this.powerUpSpawnEvent = this.time.addEvent({
      delay: Phaser.Math.Between(9000, 14000),
      loop: true,
      callback: () => {
        if (this.gameEnded) return;
        this.spawnPowerUp(pool);
      },
    });
  }

  private spawnPowerUp(pool: PlatformerPowerUp[]): void {
    if (!pool.length) return;
    const powerUp = Phaser.Utils.Array.GetRandom(pool);
    const width = this.physics.world.bounds.width;
    const x = Phaser.Math.Between(40, Math.max(80, width - 40));
    const y = this.cameras.main.worldView.y - 40;
    const color = this.variantPalette?.[1] ?? this.theme.combo;
    const llmTexture =
      this.getLlmTextureKey({ id: powerUp.id }) ?? this.getLlmTextureKey({ role: 'bonus', random: true });
    const textureKey = llmTexture ?? this.ensureTexture(`powerup_${powerUp.id}`, 22, 22, color);
    const sprite = this.powerUps.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
    sprite.setBounce(0.4);
    if (llmTexture) {
      this.fitSpriteToLlmMeta(sprite, llmTexture, { bodyWidthRatio: 0.5, bodyHeightRatio: 0.6 });
    } else {
      sprite.setCircle(11);
    }
    sprite.setData('powerUp', powerUp);
    sprite.setVelocityX(Phaser.Math.Between(-20, 20));
  }

  private collectPowerUp(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    item: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(item instanceof Phaser.Physics.Arcade.Sprite)) return;
    const data = item.getData('powerUp') as PlatformerPowerUp | undefined;
    item.disableBody(true, true);
    if (!data) return;
    this.applyPowerUpEffect(data);
  }

  private applyPowerUpEffect(powerUp: PlatformerPowerUp): void {
    switch (powerUp.effect) {
      case 'speed':
        this.speedBoostTimer?.remove(false);
        this.speedBoostMultiplier = 1.3;
        this.speedBoostTimer = this.time.addEvent({
          delay: powerUp.duration * 1000,
          callback: () => {
            this.speedBoostMultiplier = 1;
            this.updatePowerUpText();
          },
        });
        break;
      case 'shield':
        this.shieldTimer?.remove(false);
        this.shieldCharges = 1;
        this.shieldTimer = this.time.addEvent({
          delay: powerUp.duration * 1000,
          callback: () => {
            this.shieldCharges = 0;
            this.updatePowerUpText();
          },
        });
        break;
      case 'scoreBoost':
        this.scoreBoostTimer?.remove(false);
        this.scoreBoostActive = true;
        this.scoreBoostTimer = this.time.addEvent({
          delay: powerUp.duration * 1000,
          callback: () => {
            this.scoreBoostActive = false;
            this.updatePowerUpText();
          },
        });
        break;
    }
    this.updatePowerUpText();
  }

  private consumeShield(): boolean {
    if (this.shieldCharges <= 0) {
      return false;
    }
    this.shieldCharges -= 1;
    this.cameras.main.flash(120, 120, 220, 255);
    this.updatePowerUpText();
    return true;
  }

  private completeObjective(): void {
    if (this.objectiveCompleted) return;
    this.objectiveCompleted = true;
    this.timerEvent?.remove(false);
    const bonus = this.variantSettings.objective.bonusOnComplete ?? 0;
    if (bonus > 0) {
      super.updateScore(bonus);
    }
    this.showObjectiveCompleteOverlay();
  }

  private showObjectiveCompleteOverlay(): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.82);
    overlay.setScrollFactor(0);

    const title = this.add
      .text(centerX, centerY - 70, 'Миссия выполнена!', {
        fontSize: '34px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5);
    title.setScrollFactor(0);

    const description = this.add
      .text(centerX, centerY - 20, this.objectiveDescription, {
        fontSize: '20px',
        color: '#d0d0d0',
        fontFamily: 'Arial',
        align: 'center',
        wordWrap: { width: this.scale.width * 0.7 },
      })
      .setOrigin(0.5);
    description.setScrollFactor(0);

    const button = this.add
      .text(centerX, centerY + 60, 'Продолжить', {
        fontSize: '24px',
        color: '#4caf50',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    button.setScrollFactor(0);

    button.on('pointerdown', () => this.endGame(true));
  }

  protected override updateScore(points: number): void {
    super.updateScore(points);
    if (this.objectiveType === 'score' && !this.objectiveCompleted && this.score >= this.objectiveTargetScore) {
      this.completeObjective();
    }
    this.updateObjectiveText();
  }

  private updateComboText(): void {
    if (this.comboText) {
      this.comboText.setText(`${this.comboLabel} x${this.comboMultiplier.toFixed(1)}`);
    }
  }

  private hitHazard(): void {
    if (this.consumeShield()) {
      return;
    }
    this.showGameOver(this.score);
  }

  private collectStar(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    star: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(star instanceof Phaser.Physics.Arcade.Sprite)) return;
    star.disableBody(true, true);

    this.collectedStars += 1;
    if (this.objectiveType === 'collect') {
      this.objectiveProgress = Math.min(this.objectiveTargetCount, this.objectiveProgress + 1);
    }
    this.comboMultiplier = Math.min(this.comboMultiplier + 0.2, 3);
    const baseValue = this.collectibleScoreValue * (this.scoreBoostActive ? 1.5 : 1);
    this.updateScore(Math.floor(baseValue * this.comboMultiplier));
    this.updateComboText();
    this.refreshComboTimer();
    this.updateObjectiveText();

    if (this.objectiveType === 'collect' && this.objectiveProgress >= this.objectiveTargetCount) {
      this.completeObjective();
    } else if (this.stars.countActive(true) === 0 && !this.objectiveCompleted) {
      this.updateScore(150);
      this.showGameOver(this.score);
    }
  }

  private hitEnemy(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (this.consumeShield()) {
      return;
    }
    this.showGameOver(this.score);
  }

  protected endGame(force: boolean = false): void {
    this.timerEvent?.remove(false);
    this.comboResetEvent?.remove(false);
    this.powerUpSpawnEvent?.remove(false);
    this.speedBoostTimer?.remove(false);
    this.shieldTimer?.remove(false);
    this.scoreBoostTimer?.remove(false);
    super.endGame(force);
  }

  update(): void {
    if (this.gameEnded) return;

    // Проверяем, что игрок инициализирован
    if (!this.player || !this.player.body) return;

    // Управление игроком
    let moveLeft = false;
    let moveRight = false;

    // Проверяем клавиатуру
    if (this.cursors && this.input.keyboard) {
      moveLeft = this.cursors.left.isDown;
      moveRight = this.cursors.right.isDown;

      if (this.cursors.up.isDown && this.player.body.touching.down) {
        this.player.setVelocityY(-330);
      }
    }

    // Проверяем мобильные кнопки
    if (this.mobileControls.leftPressed) {
      moveLeft = true;
    }
    if (this.mobileControls.rightPressed) {
      moveRight = true;
    }

    // Применяем движение
    const horizontalSpeed = 180 * this.gameSpeed * this.speedBoostMultiplier;
    const invert = this.globalInvertHorizontal ? -1 : 1;
    if (moveLeft && !moveRight) {
      this.player.setVelocityX(-horizontalSpeed * invert);
    } else if (moveRight && !moveLeft) {
      this.player.setVelocityX(horizontalSpeed * invert);
    } else {
      this.player.setVelocityX(0);
    }

    // Актуализируем параллакс
    this.parallaxLayers.forEach((layer, index) => {
      layer.y = this.cameras.main.scrollY * (0.1 * (index + 1));
    });

    this.updateEnemyBehaviorLogic();

    // Очищаем препятствия за пределами экрана
    this.obstacles.getChildren().forEach((obstacle) => {
      const sprite = obstacle as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > this.cameras.main.scrollY + this.scale.height + 80) {
        sprite.destroy();
      }
    });
    this.powerUps.getChildren().forEach((child) => {
      const sprite = child as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > this.cameras.main.scrollY + this.scale.height + 40) {
        sprite.destroy();
      }
    });
  }
}

