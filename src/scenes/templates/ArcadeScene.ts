import { VerticalBaseScene } from './VerticalStandardScene';
import Phaser from 'phaser';
import type {
  ArcadeVariantSettings,
  ArcadeObjectiveType,
  ArcadeObjective,
  ArcadeEnemyProfile,
  ArcadePowerUpProfile,
  ArcadeWaveDefinition,
  ArcadeWeaponProfile,
  ArcadeEnemyAbility,
} from '@/types';

type EnemyType = 'basic' | 'zigzag' | 'tank';
type PowerUpType = 'shield' | 'rapid' | 'spread';

export class ArcadeScene extends VerticalBaseScene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyLasers!: Phaser.Physics.Arcade.Group;
  private powerUps!: Phaser.Physics.Arcade.Group;
  private parallaxLayers: Phaser.GameObjects.Rectangle[] = [];
  private starEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private keyboardControls?: Phaser.Types.Input.Keyboard.CursorKeys;

  private gameSpeed: number = 1;
  private enemySpawnRate: number = 2000;
  private nextAutoShot: number = 0;
  private nextEnemySpawn: number = 0;
  private spawnAcceleration: number = 0;

  private rapidFireUntil: number = 0;
  private spreadShotUntil: number = 0;
  private shieldUntil: number = 0;
  private shieldSprite?: Phaser.GameObjects.Arc;

  private maxHealth: number = 3;
  private health: number = 3;
  private healthText!: Phaser.GameObjects.Text;

  private timerText!: Phaser.GameObjects.Text;
  private timeLeft: number = 90;
  private timerEvent?: Phaser.Time.TimerEvent;

  private comboMultiplier: number = 1;
  private comboText!: Phaser.GameObjects.Text;
  private comboResetEvent?: Phaser.Time.TimerEvent;

  private touchTargetX?: number;
  private activePointerId?: number;
  private damageCooldownUntil: number = 0;

  private cleanedUp: boolean = false;
  private variantSettings!: ArcadeVariantSettings;
  private comboLabel: string = 'Комбо';
  private comboDecayMs: number = 2000;
  private objectiveType: ArcadeObjectiveType = 'survive';
  private objectiveDescription: string = 'Выживи до конца таймера';
  private objectiveTargetScore: number = 800;
  private objectiveCompleted: boolean = false;
  private codenameText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private currentWaveIndex: number = 0;
  private waveEndsAt: number = Number.POSITIVE_INFINITY;
  private currentWaveSpawnDelay: number = 1200;
  private currentSpeedMultiplier: number = 1;
  private currentFireRateMultiplier: number = 1;
  private enemyProfilesMap: Map<string, ArcadeEnemyProfile> = new Map();
  private powerUpPool: ArcadePowerUpProfile[] = [];
  private spawnRateFactor: number = 1;
  private maxEnemiesOnScreen: number = 8;

  private loadVariantSettings(): void {
    const defaults = this.getDefaultVariantSettings();
    const mechanics = this.gameData?.gameData?.mechanics as Record<string, unknown> | undefined;
    const rawVariant = mechanics?.arcadeVariant as Partial<ArcadeVariantSettings> | undefined;
    this.variantSettings = this.hydrateVariantSettings(defaults, rawVariant);
    this.comboLabel = this.variantSettings.comboName;
    this.comboDecayMs = Math.round(this.clampNumber(this.variantSettings.comboDecaySeconds, 0.8, 6) * 1000);
    this.objectiveType = this.variantSettings.objective.type;
    this.objectiveDescription = this.variantSettings.objective.description;
    this.objectiveTargetScore = this.clampNumber(this.variantSettings.objective.targetScore ?? 800, 200, 6000);
    if (this.objectiveType === 'survive' && this.variantSettings.objective.survivalTime) {
      this.timeLeft = this.variantSettings.objective.survivalTime;
    }
    this.enemyProfilesMap = new Map(this.variantSettings.enemyProfiles.map((profile) => [profile.id, profile]));
    this.powerUpPool = this.variantSettings.powerUps;
    this.currentWaveIndex = 0;
    this.objectiveCompleted = false;
  }

  private hydrateVariantSettings(
    defaults: ArcadeVariantSettings,
    incoming?: Partial<ArcadeVariantSettings>,
  ): ArcadeVariantSettings {
    if (!incoming || typeof incoming !== 'object') {
      return defaults;
    }

    const enemyProfiles = this.buildEnemyProfiles(incoming.enemyProfiles, defaults.enemyProfiles);
    return {
      codename: this.getString(incoming.codename, defaults.codename),
      briefing: this.getString(incoming.briefing, defaults.briefing),
      comboName: this.getString(incoming.comboName, defaults.comboName),
      comboDecaySeconds: this.clampNumber(incoming.comboDecaySeconds ?? defaults.comboDecaySeconds, 0.8, 6),
      objective: this.buildArcadeObjective(incoming.objective, defaults.objective),
      waves: this.buildArcadeWaves(incoming.waves, defaults.waves, enemyProfiles),
      enemyProfiles,
      powerUps: this.buildPowerUps(incoming.powerUps, defaults.powerUps),
    };
  }

  private buildArcadeObjective(
    source: ArcadeObjective | undefined,
    fallback: ArcadeObjective,
  ): ArcadeObjective {
    if (!source || typeof source !== 'object') {
      return fallback;
    }

    const type: ArcadeObjectiveType = source.type === 'score' ? 'score' : 'survive';
    return {
      type,
      description: this.getString(source.description, fallback.description),
      survivalTime: this.clampNumber(source.survivalTime ?? fallback.survivalTime ?? 90, 45, 300),
      targetScore: this.clampNumber(source.targetScore ?? fallback.targetScore ?? 900, 200, 6000),
      bonusOnComplete: this.clampNumber(source.bonusOnComplete ?? fallback.bonusOnComplete ?? 200, 0, 4000),
    };
  }

  private buildEnemyProfiles(
    source: ArcadeEnemyProfile[] | undefined,
    fallback: ArcadeEnemyProfile[],
  ): ArcadeEnemyProfile[] {
    if (!Array.isArray(source) || source.length === 0) {
      return fallback;
    }

    const patterns: EnemyType[] = ['basic', 'zigzag', 'tank'];
    const sanitized = source
      .map<ArcadeEnemyProfile | undefined>((profile, index) => {
        if (!profile || typeof profile !== 'object') return undefined;
        const base = fallback[index % fallback.length];
        const pattern = patterns.includes(profile.pattern as EnemyType) ? (profile.pattern as EnemyType) : base.pattern;
        const weapon = this.buildWeaponProfile(
          profile.weapon as ArcadeWeaponProfile | undefined,
          base.weapon as ArcadeWeaponProfile,
        );
        const ability = this.buildAbilityProfile(
          profile.ability as ArcadeEnemyAbility | undefined,
          base.ability,
        );
        return {
          id: this.getString(profile.id, base.id),
          name: this.getString(profile.name, base.name),
          description: this.getString(profile.description, base.description),
          pattern,
          hp: Math.round(this.clampNumber(profile.hp ?? base.hp, 1, 5)),
          speedMultiplier: this.clampNumber(profile.speedMultiplier ?? base.speedMultiplier, 0.6, 1.8),
          fireRateMultiplier: this.clampNumber(profile.fireRateMultiplier ?? base.fireRateMultiplier, 0.6, 1.6),
          dropsPowerUpChance: this.clampNumber(profile.dropsPowerUpChance ?? base.dropsPowerUpChance, 0, 1),
          weapon,
          ability,
        };
      })
      .filter((profile): profile is ArcadeEnemyProfile => Boolean(profile));

    return sanitized.length > 0 ? sanitized : fallback;
  }

  private buildWeaponProfile(
    source: ArcadeWeaponProfile | undefined,
    fallback: ArcadeWeaponProfile,
  ): ArcadeWeaponProfile {
    const base =
      fallback ||
      ({
        type: 'laser',
        projectileSpeed: 220,
        cooldownModifier: 1,
      } as ArcadeWeaponProfile);
    if (!source || typeof source !== 'object') {
      return { ...base };
    }

    const weaponTypes: ArcadeWeaponProfile['type'][] = ['laser', 'burst', 'spread'];
    const type = weaponTypes.includes(source.type ?? '') ? source.type : base.type;
    return {
      type,
      projectileSpeed: this.clampNumber(source.projectileSpeed ?? base.projectileSpeed, 140, 420),
      cooldownModifier: this.clampNumber(source.cooldownModifier ?? base.cooldownModifier ?? 1, 0.4, 2.5),
      burstCount: Math.round(this.clampNumber(source.burstCount ?? base.burstCount ?? 1, 1, 5)),
      spreadAngle: this.clampNumber(source.spreadAngle ?? base.spreadAngle ?? 18, 6, 60),
    };
  }

  private buildAbilityProfile(
    source: ArcadeEnemyAbility | undefined,
    fallback?: ArcadeEnemyAbility,
  ): ArcadeEnemyAbility | undefined {
    if (!source || typeof source !== 'object') {
      return fallback ? { ...fallback } : undefined;
    }

    const abilityTypes: ArcadeEnemyAbility['type'][] = ['dash', 'shieldPulse', 'drone'];
    const type = abilityTypes.includes(source.type ?? '')
      ? source.type
      : fallback?.type;
    if (!type) {
      return undefined;
    }

    return {
      type,
      description: this.getString(source.description, fallback?.description ?? ''),
      cooldown: this.clampNumber(source.cooldown ?? fallback?.cooldown ?? 3, 1, 8),
      duration: this.clampNumber(source.duration ?? fallback?.duration ?? 1, 0.3, 4),
      intensity: this.clampNumber(source.intensity ?? fallback?.intensity ?? 1, 0.2, 3),
    };
  }

  private buildArcadeWaves(
    source: ArcadeWaveDefinition[] | undefined,
    fallback: ArcadeWaveDefinition[],
    profiles: ArcadeEnemyProfile[],
  ): ArcadeWaveDefinition[] {
    if (!Array.isArray(source) || source.length === 0) {
      return fallback;
    }
    const profileIds = new Set(profiles.map((p) => p.id));
    const sanitized = source
      .map<ArcadeWaveDefinition | undefined>((wave, index) => {
        if (!wave || typeof wave !== 'object') return undefined;
        const base = fallback[index % fallback.length];
        const mixSource = Array.isArray(wave.enemyMix) ? wave.enemyMix : base.enemyMix;
        const enemyMix = mixSource
          .map((mix, mixIndex) => {
            if (!mix || typeof mix !== 'object') return undefined;
            const baseMix = base.enemyMix[mixIndex % base.enemyMix.length];
            const enemyId = profileIds.has(mix.enemyId) ? mix.enemyId : baseMix.enemyId;
            const weight = this.clampNumber(mix.weight ?? baseMix.weight, 0.5, 8);
            return { enemyId, weight };
          })
          .filter((entry): entry is ArcadeWaveDefinition['enemyMix'][number] => Boolean(entry));

        return {
          id: this.getString(wave.id, base.id),
          name: this.getString(wave.name, base.name),
          description: this.getString(wave.description, base.description ?? ''),
          durationSeconds: Math.round(this.clampNumber(wave.durationSeconds ?? base.durationSeconds, 10, 60)),
          spawnRate: this.clampNumber(wave.spawnRate ?? base.spawnRate, 0.4, 3),
          speedMultiplier: this.clampNumber(wave.speedMultiplier ?? base.speedMultiplier, 0.6, 1.8),
          fireRateMultiplier: this.clampNumber(wave.fireRateMultiplier ?? base.fireRateMultiplier, 0.6, 1.8),
          enemyMix: enemyMix.length > 0 ? enemyMix : base.enemyMix,
        };
      })
      .filter((wave): wave is ArcadeWaveDefinition => Boolean(wave));

    return sanitized.length > 0 ? sanitized : fallback;
  }

  private buildPowerUps(
    source: ArcadePowerUpProfile[] | undefined,
    fallback: ArcadePowerUpProfile[],
  ): ArcadePowerUpProfile[] {
    if (!Array.isArray(source) || source.length === 0) {
      return fallback;
    }
    const effects: PowerUpType[] = ['shield', 'rapid', 'spread'];
    const sanitized = source
      .map((item, index) => {
        if (!item || typeof item !== 'object') return undefined;
        const base = fallback[index % fallback.length];
        const effect = effects.includes(item.effect as PowerUpType) ? (item.effect as PowerUpType) : base.effect;
        return {
          id: this.getString(item.id, base.id),
          name: this.getString(item.name, base.name),
          effect,
          duration: Math.round(this.clampNumber(item.duration ?? base.duration, 3, 10)),
          description: this.getString(item.description, base.description),
          dropChance: this.clampNumber(item.dropChance ?? base.dropChance, 0.05, 0.8),
        };
      })
      .filter((item): item is ArcadePowerUpProfile => Boolean(item));
    return sanitized.length > 0 ? sanitized : fallback;
  }

  private getDefaultVariantSettings(): ArcadeVariantSettings {
    return {
      codename: 'Pulse Shield',
      briefing: 'Дроновая армия штурмует орбитальную станцию. Держись на траектории снабжения и сбивай всё, что пролезает сквозь щит.',
      comboName: 'Оверклок',
      comboDecaySeconds: 2.4,
      objective: {
        type: 'survive',
        description: 'Продержись 90 секунд под обстрелом',
        survivalTime: 90,
        bonusOnComplete: 250,
      },
      enemyProfiles: [
        {
          id: 'scout',
          name: 'Искровой разведчик',
          description: 'Лёгкий кораблик, идёт кучно и быстро.',
          pattern: 'basic',
          hp: 1,
          speedMultiplier: 1.1,
          fireRateMultiplier: 1,
          dropsPowerUpChance: 0.25,
          weapon: {
            type: 'laser',
            projectileSpeed: 260,
            cooldownModifier: 1,
          },
          ability: {
            type: 'dash',
            description: 'Совершает резкий боковой рывок, чтобы уклониться.',
            cooldown: 4,
            duration: 0.6,
          },
        },
        {
          id: 'zig',
          name: 'Волновой резак',
          description: 'Маневрирует по синусоиде и стреляет веером.',
          pattern: 'zigzag',
          hp: 1,
          speedMultiplier: 1,
          fireRateMultiplier: 0.85,
          dropsPowerUpChance: 0.2,
          weapon: {
            type: 'spread',
            projectileSpeed: 220,
            burstCount: 3,
            spreadAngle: 24,
            cooldownModifier: 1.1,
          },
          ability: {
            type: 'drone',
            description: 'Сбрасывает дополнительный микро-дрон вниз.',
            cooldown: 5,
            intensity: 1,
          },
        },
        {
          id: 'tank',
          name: 'Брутер-щит',
          description: 'Медленный, но бронированный и стреляет залпами.',
          pattern: 'tank',
          hp: 3,
          speedMultiplier: 0.8,
          fireRateMultiplier: 1.3,
          dropsPowerUpChance: 0.35,
          weapon: {
            type: 'burst',
            projectileSpeed: 260,
            burstCount: 2,
            cooldownModifier: 1.3,
          },
          ability: {
            type: 'shieldPulse',
            description: 'Кратко активирует щит, отражающий урон.',
            cooldown: 6,
            duration: 1.4,
          },
        },
      ],
      waves: [
        {
          id: 'alpha',
          name: 'Разминка',
          description: 'Скауты и пара резаков проверяют реакцию пилота.',
          durationSeconds: 25,
          spawnRate: 1.1,
          speedMultiplier: 1,
          fireRateMultiplier: 1,
          enemyMix: [
            { enemyId: 'scout', weight: 3 },
            { enemyId: 'zig', weight: 1 },
          ],
        },
        {
          id: 'pressure',
          name: 'Давление',
          description: 'Резкие диагональные манёвры в сопровождении тяжёлых кораблей.',
          durationSeconds: 30,
          spawnRate: 1.4,
          speedMultiplier: 1.1,
          fireRateMultiplier: 0.9,
          enemyMix: [
            { enemyId: 'zig', weight: 2 },
            { enemyId: 'scout', weight: 1 },
            { enemyId: 'tank', weight: 1 },
          ],
        },
        {
          id: 'siege',
          name: 'Осадный коридор',
          description: 'Тяжёлые корабли закрывают экран, нужно пережить плотный огонь.',
          durationSeconds: 35,
          spawnRate: 0.9,
          speedMultiplier: 0.9,
          fireRateMultiplier: 1.2,
          enemyMix: [
            { enemyId: 'tank', weight: 2 },
            { enemyId: 'scout', weight: 1 },
          ],
        },
      ],
      powerUps: [
        {
          id: 'pulse_shield',
          name: 'Пульс-щит',
          effect: 'shield',
          duration: 6,
          description: 'Поглощает одно попадание и немного подсвечивает корабль.',
          dropChance: 0.35,
        },
        {
          id: 'ion_burst',
          name: 'Ионный шквал',
          effect: 'rapid',
          duration: 6,
          description: 'Удваивает скорострельность корабля.',
          dropChance: 0.3,
        },
        {
          id: 'tri_spread',
          name: 'Тройной веер',
          effect: 'spread',
          duration: 5,
          description: 'Добавляет два дополнительных луча при стрельбе.',
          dropChance: 0.25,
        },
      ],
    };
  }

  private clampNumber(value: unknown, min: number, max: number): number {
    const num = typeof value === 'number' && Number.isFinite(value) ? value : min;
    return Phaser.Math.Clamp(num, min, max);
  }

  private getString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
  }

  initGame(): void {
    this.loadVariantSettings();
    const params = this.gameData.config.params || {};
    const speedParam = Number(params.speed ?? 1);
    const spawnParam = Number(params.enemySpawnRate ?? 1);
    const durationParam = Number(params.duration ?? 90);

    this.gameSpeed = Phaser.Math.Clamp(speedParam, 0.5, 2);
    this.spawnRateFactor = Phaser.Math.Clamp(spawnParam || 1, 0.5, 1.8);
    this.enemySpawnRate = Phaser.Math.Clamp(1800 / this.gameSpeed / this.spawnRateFactor, 500, 2600);
    const durationBase = Number.isFinite(durationParam) ? durationParam : this.variantSettings.objective.survivalTime ?? 90;
    const resolvedDuration =
      this.objectiveType === 'survive'
        ? this.variantSettings.objective.survivalTime ?? durationBase
        : durationBase;
    this.timeLeft = Phaser.Math.Clamp(resolvedDuration, 45, 240);
    this.health = this.maxHealth = 3;
    this.comboMultiplier = 1;
    this.spawnAcceleration = 0;
    this.nextAutoShot = 0;
    this.nextEnemySpawn = 0;

    this.physics.world.gravity.y = 0;
    this.initVerticalLayout({
      minSafeWidth: 360,
      maxSafeWidth: 520,
      paddingX: 0.04,
      paddingY: 0.02,
      enablePointer: true,
      extraPointers: 2,
    });

    this.cameras.main.setBackgroundColor('#050b18');
    this.createBackgroundLayers();
    this.createGroups();
    this.createPlayerShip();
    this.registerCollisions();
    this.keyboardControls = this.input.keyboard?.createCursorKeys();

    this.createHud();
    this.applyWaveSettings(0);
    this.startRoundTimer();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup();
    });
  }

  update(time: number, delta: number): void {
    if (this.gameEnded || !this.player) {
      return;
    }

    this.updatePlayerMovement(delta);
    this.handleAutoFire(time);
    this.handleEnemySpawns(time);
    this.updateEnemies(delta);
    this.recycleObjects();
    this.updateShieldVisual();
    this.animateBackground(delta);
    this.updateWaveState();
  }

  protected endGame(force: boolean = false): void {
    this.cleanup();
    super.endGame(force);
  }

  protected onSafeAreaChanged(_safe?: Phaser.Geom.Rectangle, _play?: Phaser.Geom.Rectangle): void {
    this.refreshHudPositions();
    this.updateBackgroundLayout();
    if (this.touchTargetX !== undefined) {
      this.touchTargetX = this.clampToSafeBounds(this.touchTargetX);
    }
    if (this.player) {
      this.player.x = this.clampToSafeBounds(this.player.x);
    }
  }

  private createBackgroundLayers(): void {
    this.parallaxLayers.forEach((layer) => layer.destroy());
    this.parallaxLayers = [];
    this.starEmitter?.destroy();
    this.starEmitter = undefined;

    const fullBg = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x030711, 1);
    fullBg.setDepth(-5).setScrollFactor(0);

    const safeBg = this.add.rectangle(this.safeBounds.centerX, this.scale.height / 2, this.safeBounds.width, this.scale.height, 0x0b1c36, 0.95);
    safeBg.setDepth(-4).setScrollFactor(0);
    this.parallaxLayers.push(safeBg);

    const glow = this.add.rectangle(this.safeBounds.centerX, this.scale.height / 2, this.safeBounds.width * 0.85, this.scale.height * 1.1, 0x12345a, 0.4);
    glow.setDepth(-3).setScrollFactor(0);
    this.parallaxLayers.push(glow);

    const accent = this.add.rectangle(this.safeBounds.centerX, this.scale.height / 2, this.safeBounds.width * 0.35, this.scale.height * 1.3, 0x1f4d7a, 0.25);
    accent.setDepth(-2).setScrollFactor(0);
    this.parallaxLayers.push(accent);

    this.createStarEmitter();
  }

  private updateBackgroundLayout(): void {
    const centersY = this.scale.height / 2;
    this.parallaxLayers.forEach((layer, index) => {
      layer.x = this.safeBounds.centerX;
      layer.y = centersY;
      if (index === 0) {
        layer.setSize(this.safeBounds.width, this.scale.height);
      } else {
        layer.setSize(this.safeBounds.width * (index === 1 ? 0.85 : 0.35), this.scale.height * (index === 1 ? 1.1 : 1.3));
      }
    });
    if (this.starEmitter) {
      this.starEmitter.destroy();
      this.starEmitter = undefined;
      this.createStarEmitter();
    }
  }

  private animateBackground(delta: number): void {
    const drift = delta * 0.003;
    this.parallaxLayers.forEach((layer, index) => {
      layer.rotation += 0.0003 * (index + 1);
      layer.y = this.scale.height / 2 + Math.sin(this.time.now * 0.0002 + index) * 5 * (index + 1) * drift;
    });
  }

  private createGroups(): void {
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.enemies = this.physics.add.group({ allowGravity: false });
    this.enemyLasers = this.physics.add.group({ allowGravity: false });
    this.powerUps = this.physics.add.group({ allowGravity: false });
  }

  private createPlayerShip(): void {
    const llmTexture = this.getLlmTextureKey({ role: 'hero' });
    const playerTexture = llmTexture ?? this.ensureTriangleTexture('player_ship', 46, 46, 0x4caf50);
    this.player = this.physics.add.sprite(this.safeBounds.centerX, this.scale.height - 90, playerTexture);
    this.player.setDepth(2);
    this.player.setCollideWorldBounds(true);
    this.player.setDamping(true);
    this.player.setDragX(0.9);
    this.disableGravity(this.player);
    if (llmTexture) {
      this.fitSpriteToLlmMeta(this.player, llmTexture, { bodyWidthRatio: 0.62, bodyHeightRatio: 0.8 });
    } else {
      this.player.body?.setSize(24, 32);
    }
  }

  protected onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.gameEnded) return;
    this.activePointerId = pointer.id;
    this.touchTargetX = this.clampToSafeBounds(pointer.x);
  }

  protected onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.gameEnded) return;
    if (this.activePointerId === pointer.id) {
      this.touchTargetX = this.clampToSafeBounds(pointer.x);
    }
  }

  protected onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId === pointer.id) {
      this.activePointerId = undefined;
      this.touchTargetX = undefined;
    }
  }

  private registerCollisions(): void {
    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      this.onBulletHitsEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.onPlayerCollidesEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.enemyLasers,
      this.onPlayerHitByLaser as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.powerUps,
      this.collectPowerUp as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
  }

  private createHud(): void {
    this.refreshHudPositions(true);
    this.healthText = this.add
      .text(this.safeBounds.right - 16, 16, this.healthLabel(), {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(5);

    this.timerText = this.add
      .text(this.safeBounds.right - 16, 44, this.formatTime(this.timeLeft), {
        fontSize: '20px',
        color: '#80d4ff',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(5);

    this.comboText = this.add
      .text(this.safeBounds.left + 16, 44, `${this.comboLabel} x1.0`, {
        fontSize: '18px',
        color: '#4caf50',
        fontFamily: 'Arial',
      })
      .setScrollFactor(0)
      .setDepth(5);

    this.codenameText = this.add
      .text(this.safeBounds.centerX, 16, this.variantSettings.codename, {
        fontSize: '18px',
        color: '#f2f8ff',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5);

    this.waveText = this.add
      .text(this.safeBounds.centerX, 44, '', {
        fontSize: '16px',
        color: '#80d4ff',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5);

  }

  private refreshHudPositions(force = false): void {
    if (this.scoreText && (force || !this.gameEnded)) {
      this.scoreText.setPosition(this.safeBounds.left + 16, 16);
      this.scoreText.setScrollFactor(0);
      this.scoreText.setDepth(5);
    }
    if (this.healthText) {
      this.healthText.setPosition(this.safeBounds.right - 16, 16);
    }
    if (this.timerText) {
      this.timerText.setPosition(this.safeBounds.right - 16, 44);
    }
    if (this.comboText) {
      this.comboText.setPosition(this.safeBounds.left + 16, 44);
    }
    if (this.codenameText) {
      this.codenameText.setPosition(this.safeBounds.centerX, 16);
    }
    if (this.waveText) {
      this.waveText.setPosition(this.safeBounds.centerX, 44);
    }
  }

  private startRoundTimer(): void {
    this.timerEvent?.remove(false);
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: this.tickTimer,
      callbackScope: this,
    });
  }

  private tickTimer(): void {
    if (this.gameEnded) return;
    this.timeLeft = Math.max(0, this.timeLeft - 1);
    this.timerText.setText(this.formatTime(this.timeLeft));
    if (this.timeLeft === 0) {
      if (this.objectiveType === 'survive') {
        this.completeObjective();
      } else {
        this.updateScore(150);
        this.finishRound();
      }
    }
  }

  private updatePlayerMovement(delta: number): void {
    const clampX = (value: number) => this.clampToSafeBounds(value);
    if (this.touchTargetX !== undefined) {
      this.player.x = Phaser.Math.Linear(this.player.x, this.touchTargetX, 0.18);
    } else if (this.keyboardControls) {
      const move = (this.keyboardControls.left?.isDown ? -1 : 0) + (this.keyboardControls.right?.isDown ? 1 : 0);
      if (move !== 0) {
        const speed = (260 * this.gameSpeed * delta) / 1000;
        this.player.x = clampX(this.player.x + move * speed);
      }
    }

    this.player.x = clampX(this.player.x);
  }

  private handleAutoFire(time: number): void {
    if (time < this.nextAutoShot) return;
    this.firePlayerWeapons();
    this.nextAutoShot = time + this.getFireDelay();
  }

  private getFireDelay(): number {
    const rapid = this.isRapidFireActive();
    const baseDelay = rapid ? 140 : 260;
    return baseDelay / this.gameSpeed;
  }

  private firePlayerWeapons(): void {
    const offsets = this.isSpreadActive() ? [-22, 0, 22] : [0];
    offsets.forEach((offset) => this.createBullet(offset));
  }

  private createBullet(offsetX: number): void {
    const bulletTexture = this.ensureRoundedRectTexture('player_bullet', 8, 24, 0xfff176, 4);
    const bullet = this.bullets.create(this.player.x + offsetX, this.player.y - 30, bulletTexture) as Phaser.Physics.Arcade.Sprite;
    this.disableGravity(bullet);
    bullet.setVelocityY(-460 * this.gameSpeed);
    bullet.setDepth(1);
  }

  private handleEnemySpawns(time: number): void {
    if (time < this.nextEnemySpawn) return;
    const activeEnemies = this.enemies.countActive(true);
    if (activeEnemies >= this.maxEnemiesOnScreen) {
      this.nextEnemySpawn = time + 220;
      return;
    }
    this.spawnEnemy();
    const targetDelay = this.currentWaveSpawnDelay || this.enemySpawnRate;
    const dynamicDelay = Math.max(280, targetDelay - this.spawnAcceleration);
    this.nextEnemySpawn = time + dynamicDelay;
    const maxAcceleration = Math.max(0, targetDelay - 320);
    this.spawnAcceleration = Math.min(this.spawnAcceleration + 25, maxAcceleration);
  }

  private spawnEnemy(): void {
    const wave = this.getCurrentWave();
    const profile = wave ? this.pickEnemyProfileForWave(wave) : this.variantSettings.enemyProfiles[0];
    const pattern = (profile?.pattern as EnemyType) ?? 'basic';
    const x = Phaser.Math.Between(Math.floor(this.safeBounds.left + 30), Math.floor(this.safeBounds.right - 30));
    const enemyTexture = this.getEnemyTexture(pattern);
    const enemy = this.enemies.create(x, -40, enemyTexture) as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(1);
    this.disableGravity(enemy);
    if (this.getLlmSpriteMetaByTexture(enemyTexture)) {
      this.fitSpriteToLlmMeta(enemy, enemyTexture, { bodyWidthRatio: 0.6, bodyHeightRatio: 0.85 });
    }
    const speedMultiplier = (profile?.speedMultiplier ?? 1) * this.currentSpeedMultiplier;
    const fireModifier = (profile?.fireRateMultiplier ?? 1) * this.currentFireRateMultiplier;
    enemy.setVelocityY((70 + Phaser.Math.Between(0, 40)) * this.gameSpeed * speedMultiplier);
    enemy.setData('pattern', pattern);
    enemy.setData('hp', profile?.hp ?? 1);
    const weapon = profile?.weapon;
    const ability = profile?.ability;
    if (weapon) {
      enemy.setData('weapon', { ...weapon });
    }
    if (ability) {
      enemy.setData('ability', { ...ability });
      const initialDelay = (ability.cooldown ?? 3) * 1000 * Phaser.Math.FloatBetween(0.4, 0.9);
      enemy.setData('abilityNext', this.time.now + initialDelay);
    }
    const baseDelay = weapon?.cooldownModifier ? weapon.cooldownModifier * 900 : Phaser.Math.Between(900, 1700);
    const shootDelay = baseDelay / fireModifier;
    enemy.setData('shootDelay', shootDelay);
    enemy.setData('nextShot', this.time.now + shootDelay);
    enemy.setData('zigzagAmplitude', Phaser.Math.Between(16, 28));
    enemy.setData('zigzagSpeed', Phaser.Math.FloatBetween(0.002, 0.004));
    enemy.setData('zigzagSeed', Math.random() * Math.PI * 2);
    enemy.setData('dropsPowerUpChance', profile?.dropsPowerUpChance ?? 0.25);
  }

  private getEnemyTexture(type: EnemyType): string {
    const llmTexture = this.getLlmTextureKey({ role: 'enemy', random: true });
    if (llmTexture) {
      return llmTexture;
    }

    switch (type) {
      case 'zigzag':
        return this.ensureRoundedRectTexture('enemy_zigzag', 34, 26, 0xffc107, 6);
      case 'tank':
        return this.ensureRoundedRectTexture('enemy_tank', 40, 34, 0xff5252, 4);
      default:
        return this.ensureRoundedRectTexture('enemy_basic', 30, 28, 0x29b6f6, 4);
    }
  }

  private updateEnemies(delta: number): void {
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return;
      this.updateEnemyBehavior(enemy, delta);
    });
  }

  private updateEnemyBehavior(enemy: Phaser.Physics.Arcade.Sprite, delta: number): void {
    const pattern = (enemy.getData('pattern') as EnemyType | undefined) ?? 'basic';
    if (pattern === 'zigzag') {
      const amplitude = (enemy.getData('zigzagAmplitude') as number | undefined) ?? 20;
      const speed = (enemy.getData('zigzagSpeed') as number | undefined) ?? 0.003;
      const seed = (enemy.getData('zigzagSeed') as number | undefined) ?? 0;
      const offset = Math.sin(this.time.now * speed + seed) * amplitude * (delta / 16.6);
      enemy.x = this.clampToSafeBounds(enemy.x + offset);
    }

    if (enemy.y > this.scale.height + 50) {
      enemy.destroy();
      this.applyDamage(1);
      return;
    }

    this.handleEnemyAbility(enemy);

    const nextShot = enemy.getData('nextShot') as number | undefined;
    const shootDelay = (enemy.getData('shootDelay') as number | undefined) ?? 1200;
    if (nextShot && this.time.now >= nextShot) {
      this.enemyShoot(enemy);
      enemy.setData('nextShot', this.time.now + shootDelay);
    }
  }

  private handleEnemyAbility(enemy: Phaser.Physics.Arcade.Sprite): void {
    const ability = enemy.getData('ability') as ArcadeEnemyAbility | undefined;
    if (ability) {
      const next = (enemy.getData('abilityNext') as number | undefined) ?? 0;
      if (this.time.now >= next) {
        this.triggerEnemyAbility(enemy, ability);
        const cooldown = Math.max(ability.cooldown ?? 3, 0.5) * 1000;
        enemy.setData('abilityNext', this.time.now + cooldown);
      }
    }

    const shieldUntil = enemy.getData('shieldUntil') as number | undefined;
    if (shieldUntil && this.time.now >= shieldUntil) {
      enemy.setData('shieldUntil', undefined);
      if (enemy.active) {
        enemy.clearTint();
      }
    }

    const dashResetAt = enemy.getData('dashResetAt') as number | undefined;
    if (dashResetAt && this.time.now >= dashResetAt) {
      enemy.setData('dashResetAt', undefined);
      enemy.setVelocityX(0);
    }
  }

  private triggerEnemyAbility(enemy: Phaser.Physics.Arcade.Sprite, ability: ArcadeEnemyAbility): void {
    switch (ability.type) {
      case 'dash': {
        const direction = Math.random() < 0.5 ? -1 : 1;
        const force = 140 * (ability.intensity ?? 1);
        enemy.setVelocityX(direction * force);
        const duration = Math.max(ability.duration ?? 0.6, 0.2) * 1000;
        enemy.setData('dashResetAt', this.time.now + duration);
        break;
      }
      case 'shieldPulse': {
        const duration = Math.max(ability.duration ?? 1.2, 0.2) * 1000;
        enemy.setData('shieldUntil', this.time.now + duration);
        enemy.setTintFill(0xa0faff);
        break;
      }
      case 'drone': {
        this.spawnAbilityDrones(enemy, ability);
        break;
      }
      default:
        break;
    }
  }

  private spawnAbilityDrones(enemy: Phaser.Physics.Arcade.Sprite, ability: ArcadeEnemyAbility): void {
    const drones = Math.max(2, Math.round((ability.intensity ?? 1) * 2));
    const startAngle = 60;
    const step = drones > 1 ? (60 / (drones - 1)) : 0;
    for (let i = 0; i < drones; i++) {
      if (!this.canSpawnEnemyProjectile()) {
        break;
      }
      const angle = startAngle + i * step;
      this.createEnemyProjectile(enemy.x, enemy.y + 10, angle, 180, 0xffc107);
    }
  }

  private enemyShoot(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!this.canSpawnEnemyProjectile()) {
      return;
    }
    const weapon = enemy.getData('weapon') as ArcadeWeaponProfile | undefined;
    const projectileSpeed =
      (weapon?.projectileSpeed ?? 220) * Phaser.Math.Clamp(this.gameSpeed, 0.75, 1.3);
    const burstCount = Math.max(weapon?.burstCount ?? 1, 1);

    if (weapon?.type === 'spread') {
      const spread = weapon.spreadAngle ?? 18;
      const total = Math.max(burstCount, 2);
      const startAngle = 90 - spread;
      const step = total > 1 ? (spread * 2) / (total - 1) : 0;
      for (let i = 0; i < total; i++) {
        const angle = startAngle + i * step;
        this.createEnemyProjectile(enemy.x, enemy.y + 20, angle, projectileSpeed);
      }
      return;
    }

    if (weapon?.type === 'burst') {
      for (let i = 0; i < burstCount; i++) {
        const offset = (i - (burstCount - 1) / 2) * 10;
        this.createEnemyProjectile(enemy.x + offset, enemy.y + 20, 90, projectileSpeed);
      }
      return;
    }

    this.createEnemyProjectile(enemy.x, enemy.y + 20, 90, projectileSpeed);
  }

  private recycleObjects(): void {
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.y < -40) {
        bullet.destroy();
      }
    });

    this.enemyLasers.getChildren().forEach((child) => {
      const laser = child as Phaser.Physics.Arcade.Sprite;
      if (laser.y > this.scale.height + 40) {
        laser.destroy();
      }
    });

    this.powerUps.getChildren().forEach((child) => {
      const power = child as Phaser.Physics.Arcade.Sprite;
      if (power.y > this.scale.height + 40) {
        power.destroy();
      }
    });
  }

  private createEnemyProjectile(x: number, y: number, angleDeg: number, speed: number, color: number = 0xff6f61): Phaser.Physics.Arcade.Sprite | undefined {
    if (!this.canSpawnEnemyProjectile()) {
      return undefined;
    }
    const texture = this.ensureRoundedRectTexture(`enemy_laser_${color.toString(16)}`, 6, 22, color, 3);
    const projectile = this.enemyLasers.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    this.disableGravity(projectile);
    const angleRad = Phaser.Math.DegToRad(angleDeg);
    projectile.setVelocity(Math.cos(angleRad) * speed, Math.sin(angleRad) * speed);
    projectile.setDepth(1);
    return projectile;
  }

  private canSpawnEnemyProjectile(): boolean {
    return this.enemyLasers.countActive(true) < 45;
  }

  private onBulletHitsEnemy(
    bullet: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(bullet instanceof Phaser.Physics.Arcade.Sprite) || !(enemy instanceof Phaser.Physics.Arcade.Sprite)) {
      return;
    }

    bullet.destroy();
    const shieldUntil = enemy.getData('shieldUntil') as number | undefined;
    if (shieldUntil && this.time.now < shieldUntil) {
      return;
    }
    let hp = (enemy.getData('hp') as number | undefined) ?? 1;
    hp -= 1;
    if (hp <= 0) {
      const dropChance = (enemy.getData('dropsPowerUpChance') as number | undefined) ?? 0.25;
      this.updateScore(Math.round(25 * this.comboMultiplier));
      this.registerComboHit();
      const { x, y } = enemy;
      enemy.destroy();
      this.maybeDropPowerUp(x, y, dropChance);
    } else {
      enemy.setData('hp', hp);
      enemy.setTintFill(0xffffff);
      this.time.delayedCall(120, () => enemy.clearTint());
    }
  }

  private onPlayerCollidesEnemy(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(enemy instanceof Phaser.Physics.Arcade.Sprite)) return;
    enemy.destroy();
    this.applyDamage(2);
  }

  private onPlayerHitByLaser(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    laser: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(laser instanceof Phaser.Physics.Arcade.Sprite)) return;
    laser.destroy();
    this.applyDamage(1);
  }

  protected override updateScore(points: number): void {
    super.updateScore(points);
    if (!this.objectiveCompleted && this.objectiveType === 'score' && this.score >= this.objectiveTargetScore) {
      this.completeObjective();
    }
  }

  private collectPowerUp(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    powerUp: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(powerUp instanceof Phaser.Physics.Arcade.Sprite)) return;
    const profile = powerUp.getData('profile') as ArcadePowerUpProfile | undefined;
    powerUp.destroy();
    const effect = (profile?.effect as PowerUpType) ?? 'shield';
    const durationMs = (profile?.duration ?? 6) * 1000;
    this.applyPowerUpEffect(effect, durationMs);
  }

  private applyPowerUpEffect(effect: PowerUpType, durationMs: number): void {
    const duration = Math.max(1000, durationMs);
    switch (effect) {
      case 'rapid':
        this.rapidFireUntil = this.time.now + duration;
        break;
      case 'spread':
        this.spreadShotUntil = this.time.now + duration;
        break;
      default:
        this.activateShield(duration);
        break;
    }
  }

  private maybeDropPowerUp(x: number, y: number, enemyChance: number): void {
    if (!this.powerUpPool.length) return;
    if (Math.random() > Phaser.Math.Clamp(enemyChance, 0, 1)) {
      return;
    }
    const profile = this.pickPowerUpProfile();
    if (!profile) return;
    const llmTexture =
      this.getLlmTextureKey({ id: profile.id }) ?? this.getLlmTextureKey({ role: 'bonus', random: true });
    const texture = llmTexture ?? this.ensureCircleTexture(`power_${profile.id}`, 10, this.getPowerUpColor(profile.effect));
    const power = this.powerUps.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    this.disableGravity(power);
    power.setVelocityY(50);
    if (llmTexture) {
      this.fitSpriteToLlmMeta(power, llmTexture, { bodyWidthRatio: 0.55, bodyHeightRatio: 0.65 });
    } else {
      power.setCircle(10);
    }
    power.setData('profile', profile);
    power.setDepth(1);
  }

  private pickPowerUpProfile(): ArcadePowerUpProfile | undefined {
    if (this.powerUpPool.length === 0) {
      return undefined;
    }
    const total = this.powerUpPool.reduce((sum, item) => sum + item.dropChance, 0);
    let roll = Math.random() * (total > 0 ? total : this.powerUpPool.length);
    for (const profile of this.powerUpPool) {
      roll -= profile.dropChance > 0 ? profile.dropChance : 1;
      if (roll <= 0) {
        return profile;
      }
    }
    return this.powerUpPool[0];
  }

  private activateShield(durationMs: number): void {
    this.shieldUntil = this.time.now + durationMs;
    if (!this.shieldSprite) {
      this.shieldSprite = this.add.circle(this.player.x, this.player.y, 34, 0x4caf50, 0.2);
      this.shieldSprite.setStrokeStyle(2, 0x7fffd4);
      this.shieldSprite.setDepth(1);
    }
  }

  private updateShieldVisual(): void {
    if (this.shieldSprite) {
      if (!this.isShieldActive()) {
        this.shieldSprite.destroy();
        this.shieldSprite = undefined;
      } else {
        this.shieldSprite.x = this.player.x;
        this.shieldSprite.y = this.player.y;
        const remaining = this.shieldUntil - this.time.now;
        const alpha = Phaser.Math.Clamp(remaining / 6000, 0.18, 0.35);
        this.shieldSprite.setAlpha(alpha);
      }
    }
  }

  private applyDamage(amount: number): void {
    if (this.gameEnded) return;
    if (this.isShieldActive()) return;
    if (this.time.now < this.damageCooldownUntil) return;
    this.damageCooldownUntil = this.time.now + 700;

    this.health = Math.max(0, this.health - amount);
    this.updateHealthText();
    this.cameras.main.shake(160, 0.0025);
    this.player.setTintFill(0xff9e80);
    this.time.delayedCall(150, () => this.player.clearTint());

    if (this.health <= 0) {
      this.finishRound();
    }
  }

  private finishRound(): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.cleanup();
    this.showGameOver(this.score);
  }

  private updateHealthText(): void {
    if (this.healthText) {
      this.healthText.setText(this.healthLabel());
    }
  }

  private healthLabel(): string {
    return `Жизни: ${this.health}/${this.maxHealth}`;
  }

  private registerComboHit(): void {
    this.comboMultiplier = Phaser.Math.Clamp(this.comboMultiplier + 0.2, 1, 4);
    this.updateComboText();
    this.comboResetEvent?.remove(false);
    this.comboResetEvent = this.time.addEvent({
      delay: this.comboDecayMs,
      callback: () => {
        this.comboMultiplier = 1;
        this.updateComboText();
      },
    });
  }

  private updateComboText(): void {
    if (this.comboText) {
      this.comboText.setText(`${this.comboLabel} x${this.comboMultiplier.toFixed(1)}`);
    }
  }

  private ensureTriangleTexture(key: string, width: number, height: number, color: number): string {
    const textureKey = `${key}_${width}x${height}_${color.toString(16)}`;
    if (!this.textures.exists(textureKey)) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false } as Phaser.Types.GameObjects.Graphics.Options);
      graphics.fillStyle(color, 1);
      graphics.fillTriangle(width / 2, 0, 0, height, width, height);
      graphics.generateTexture(textureKey, width, height);
      graphics.destroy();
    }
    return textureKey;
  }

  private ensureRoundedRectTexture(key: string, width: number, height: number, color: number, radius: number): string {
    const textureKey = `${key}_${width}x${height}_${color.toString(16)}_${radius}`;
    if (!this.textures.exists(textureKey)) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false } as Phaser.Types.GameObjects.Graphics.Options);
      graphics.fillStyle(color, 1);
      graphics.fillRoundedRect(0, 0, width, height, radius);
      graphics.generateTexture(textureKey, width, height);
      graphics.destroy();
    }
    return textureKey;
  }

  private ensureCircleTexture(key: string, radius: number, color: number): string {
    const textureKey = `${key}_${radius}_${color.toString(16)}`;
    if (!this.textures.exists(textureKey)) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false } as Phaser.Types.GameObjects.Graphics.Options);
      graphics.fillStyle(color, 1);
      graphics.fillCircle(radius, radius, radius);
      graphics.generateTexture(textureKey, radius * 2, radius * 2);
      graphics.destroy();
    }
    return textureKey;
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  }

  private createStarEmitter(): void {
    const starTexture = this.ensureCircleTexture('arcade_star', 2, 0xffffff);
    const emitterConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      x: { min: this.safeBounds.left, max: this.safeBounds.right },
      y: -10,
      lifespan: 5000,
      speedY: { min: 40, max: 90 },
      quantity: 1,
      frequency: 70,
      scale: { start: 1, end: 0 },
      alpha: { start: 0.5, end: 0 },
    };
    const emitter = this.add.particles(this.safeBounds.centerX, -10, starTexture, emitterConfig);
    emitter.setDepth(-1).setScrollFactor(0);
    this.starEmitter = emitter;
  }

  private disableGravity(target?: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.GameObject): void {
    const body = (target as Phaser.Physics.Arcade.Sprite | undefined)?.body;
    if (body instanceof Phaser.Physics.Arcade.Body) {
      body.setAllowGravity(false);
    }
  }

  private clampToSafeBounds(x: number): number {
    return Phaser.Math.Clamp(x, this.safeBounds.left + 24, this.safeBounds.right - 24);
  }

  private getPowerUpColor(type: PowerUpType): number {
    switch (type) {
      case 'rapid':
        return 0xffeb3b;
      case 'spread':
        return 0x7c4dff;
      default:
        return 0x4caf50;
    }
  }

  private getCurrentWave(): ArcadeWaveDefinition | undefined {
    if (!this.variantSettings?.waves.length) {
      return undefined;
    }
    const length = this.variantSettings.waves.length;
    const normalized = ((this.currentWaveIndex % length) + length) % length;
    return this.variantSettings.waves[normalized];
  }

  private applyWaveSettings(index: number): void {
    if (!this.variantSettings?.waves.length) {
      this.currentWaveSpawnDelay = this.enemySpawnRate;
      this.waveEndsAt = Number.POSITIVE_INFINITY;
      return;
    }
    const length = this.variantSettings.waves.length;
    const normalized = ((index % length) + length) % length;
    this.currentWaveIndex = normalized;
    const wave = this.getCurrentWave();
    if (!wave) return;
    const spawnRate = this.clampNumber(wave.spawnRate, 0.4, 2.5);
    const baseDelay = 1400 / (spawnRate * this.spawnRateFactor);
    this.currentWaveSpawnDelay = Math.max(520, baseDelay);
    this.currentSpeedMultiplier = this.clampNumber(wave.speedMultiplier ?? 1, 0.6, 1.5);
    this.currentFireRateMultiplier = this.clampNumber(wave.fireRateMultiplier ?? 1, 0.6, 1.4);
    this.waveEndsAt = this.time.now + wave.durationSeconds * 1000;
    this.spawnAcceleration = 0;
    this.maxEnemiesOnScreen = Phaser.Math.Clamp(Math.round(5 + spawnRate * 2), 6, 14);
    this.updateWaveLabel();
  }

  private updateWaveState(): void {
    if (this.gameEnded || !this.variantSettings?.waves.length) {
      return;
    }
    if (!Number.isFinite(this.waveEndsAt)) {
      return;
    }
    if (this.time.now >= this.waveEndsAt) {
      this.applyWaveSettings(this.currentWaveIndex + 1);
    }
  }

  private updateWaveLabel(): void {
    if (!this.waveText) return;
    const wave = this.getCurrentWave();
    if (!wave) {
      this.waveText.setText('Волны: стандарт');
    } else {
      this.waveText.setText(`Волна: ${wave.name}`);
    }
  }

  private pickEnemyProfileForWave(wave: ArcadeWaveDefinition): ArcadeEnemyProfile {
    const fallback = this.variantSettings.enemyProfiles[0];
    const mix = Array.isArray(wave.enemyMix) && wave.enemyMix.length > 0 ? wave.enemyMix : [{ enemyId: fallback.id, weight: 1 }];
    const total = mix.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * (total > 0 ? total : mix.length);
    for (const entry of mix) {
      roll -= entry.weight;
      if (roll <= 0) {
        return this.enemyProfilesMap.get(entry.enemyId) ?? fallback;
      }
    }
    return fallback;
  }

  private completeObjective(): void {
    if (this.objectiveCompleted) return;
    this.objectiveCompleted = true;
    this.timerEvent?.remove(false);
    const bonus = this.variantSettings.objective.bonusOnComplete ?? 0;
    if (bonus > 0) {
      super.updateScore(bonus);
    }
    this.showSuccessOverlay();
  }

  private showSuccessOverlay(): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const overlay = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.82);
    overlay.setScrollFactor(0);
    overlay.setDepth(10);

    const title = this.add
      .text(centerX, centerY - 60, 'Миссия выполнена!', {
        fontSize: '34px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);

    const description = this.add
      .text(centerX, centerY - 10, this.objectiveDescription, {
        fontSize: '20px',
        color: '#d0d7ff',
        fontFamily: 'Arial',
        wordWrap: { width: this.scale.width * 0.7 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);

    const reward = this.add
      .text(centerX, centerY + 30, `Счёт: ${this.score}`, {
        fontSize: '18px',
        color: '#7fffd4',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);

    const button = this.add
      .text(centerX, centerY + 70, 'Продолжить', {
        fontSize: '24px',
        color: '#4caf50',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(11);

    button.on('pointerdown', () => this.endGame(true));
  }

  private isRapidFireActive(): boolean {
    return this.time.now < this.rapidFireUntil;
  }

  private isSpreadActive(): boolean {
    return this.time.now < this.spreadShotUntil;
  }

  private isShieldActive(): boolean {
    return this.time.now < this.shieldUntil;
  }

  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;

    this.timerEvent?.remove(false);
    this.comboResetEvent?.remove(false);
    this.destroyVerticalLayout();
    if (this.starEmitter) {
      this.starEmitter.stop();
      this.starEmitter.destroy();
      this.starEmitter = undefined;
    }
  }
}

