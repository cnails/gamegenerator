import Phaser from 'phaser';
import { VerticalBaseScene } from './VerticalStandardScene';
import type {
  RoguelikeVariantSettings,
  RoguelikeEnemyProfile,
  RoguelikePickupProfile,
  RoguelikeWeaponProfile,
} from '@/types';

type MovementInputMode = 'pointer' | 'keyboard';

export class RoguelikeScene extends VerticalBaseScene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;

  private maxHealth: number = 5;
  private health: number = 5;
  private timeElapsed: number = 0;
  private totalKills: number = 0;
  private xp: number = 0;

  private hpText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private challengeText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;

  private movementMode: MovementInputMode = 'pointer';
  private activePointerId?: number;
  private pointerTarget?: Phaser.Math.Vector2;
  private keyboard?: Phaser.Types.Input.Keyboard.CursorKeys;

  private variant!: RoguelikeVariantSettings;
  private enemyProfiles: RoguelikeEnemyProfile[] = [];
  private pickupProfiles: RoguelikePickupProfile[] = [];
  private weapon!: RoguelikeWeaponProfile;

  private enemySpawnTimer: number = 0;
  private readonly baseEnemySpawnDelay: number = 1200;

  // Автоатака
  private weaponCooldown: number = 0;
  private bullets!: Phaser.Physics.Arcade.Group;
  private moveSpeedMultiplier: number = 1;
  private maxEnemiesOnScreen: number = 14;
  private activeWeapons: RoguelikeWeaponProfile[] = [];

  initGame(): void {
    this.physics.world.gravity.y = 0;

    this.initVerticalLayout({
      minSafeWidth: 360,
      maxSafeWidth: 520,
      paddingX: 0.05,
      paddingY: 0.05,
      enablePointer: true,
      extraPointers: 1,
    });

    this.setupVariant();
    this.createGroups();
    this.createPlayer();
    this.createHud();
    this.registerCollisions();

    this.keyboard = this.input.keyboard?.createCursorKeys();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroyVerticalLayout();
    });
  }

  update(time: number, delta: number): void {
    if (this.gameEnded || !this.player) return;

    const dt = delta / 1000;
    this.timeElapsed += dt;

    this.updateMovement(dt);
    this.updateSpawns(time, delta);
    this.updateWeapon(delta);
    this.updateEnemies(dt);
    this.updateOrbitBullets();
    this.cleanupOffscreen();
    this.updateTimerLabel();

    this.checkChallengeCompletion();
  }

  protected onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.gameEnded) return;
    this.movementMode = 'pointer';
    this.activePointerId = pointer.id;
    this.pointerTarget = new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  protected onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.gameEnded) return;
    if (this.movementMode !== 'pointer') return;
    if (this.activePointerId !== pointer.id) return;
    this.pointerTarget?.set(pointer.x, pointer.y);
  }

  protected onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId === pointer.id) {
      this.activePointerId = undefined;
      this.pointerTarget = undefined;
    }
  }

  protected onSafeAreaChanged(): void {
    if (!this.safeBounds) return;
    if (this.player) {
      this.player.x = Phaser.Math.Clamp(this.player.x, this.safeBounds.left + 16, this.safeBounds.right - 16);
      this.player.y = Phaser.Math.Clamp(this.player.y, this.safeBounds.top + 16, this.safeBounds.bottom - 16);
    }
  }

  private setupVariant(): void {
    const mechanics = (this.gameData.gameData?.mechanics || {}) as Record<string, unknown>;
    const rawVariant = mechanics.roguelikeVariant as RoguelikeVariantSettings | undefined;

    this.variant = this.hydrateVariant(rawVariant);
    this.enemyProfiles = this.variant.enemyProfiles;
    this.pickupProfiles = this.variant.pickupProfiles;

    const defaultWeaponId = this.variant.defaultWeaponId ?? this.variant.weapons[0]?.id;
    const weapon =
      this.variant.weapons.find((w) => w.id === defaultWeaponId) ?? this.variant.weapons[0];
    if (!weapon) {
      throw new Error('RoguelikeVariantSettings: no weapons defined');
    }
    this.weapon = weapon;
    this.applyPlayerConstraints();
    this.activeWeapons = [this.weapon];
  }

  private hydrateVariant(incoming?: RoguelikeVariantSettings): RoguelikeVariantSettings {
    const fallback: RoguelikeVariantSettings = {
      codename: 'Last Circle',
      briefing:
        'Герой застрял в сжимающемся кольце монстров. Выживай, двигаясь и полагаясь на автоатаки.',
      challengeGoal: {
        type: 'surviveTime',
        description: 'Выживи как минимум 5 минут среди нарастающих волн врагов.',
        targetValue: 300,
      },
      playerConstraints: [
        {
          id: 'baseline',
          name: 'Базовый выживший',
          description:
            'Стартовые параметры без экстремальных ограничений. Основной акцент на плотности врагов.',
          maxHealthMultiplier: 1,
          moveSpeedMultiplier: 1,
          attackCooldownMultiplier: 1,
          damageMultiplier: 1,
        },
      ],
      enemyProfiles: [
        {
          id: 'chaser',
          name: 'Преследователь-тень',
          description: 'Быстрый враг, постоянно тянется к герою.',
          pattern: 'chaser',
          maxHealth: 3,
          touchDamage: 1,
          speed: 70,
          spawnWeight: 3,
        },
        {
          id: 'orbiter',
          name: 'Орбитальный паразит',
          description: 'Держится на расстоянии и кружит вокруг, постепенно сжимая круг.',
          pattern: 'orbiter',
          maxHealth: 4,
          touchDamage: 1,
          speed: 40,
          spawnWeight: 2,
        },
        {
          id: 'charger',
          name: 'Берсерк-рампедж',
          description: 'Рывком бросается на героя по прямой линии.',
          pattern: 'charger',
          maxHealth: 5,
          touchDamage: 2,
          speed: 90,
          spawnWeight: 1,
        },
      ],
      pickupProfiles: [
        {
          id: 'heal-small',
          name: 'Кристалл жизни',
          description: 'Восстанавливает небольшое количество здоровья.',
          type: 'heal',
          amount: 1,
          dropChance: 0.18,
        },
        {
          id: 'xp-orb',
          name: 'Опытный шар',
          description: 'Накопленный опыт для прогресса.',
          type: 'xp',
          amount: 3,
          dropChance: 0.4,
        },
        {
          id: 'weapon-upgrade-basic',
          name: 'Ядро апгрейда',
          description: 'Редкий модуль, усиливающий оружие героя.',
          type: 'weaponUpgrade',
          dropChance: 0.25,
          upgradeKind: 'damage',
          damageBonus: 1.25,
          projectileBonus: 1,
          cooldownMultiplier: 0.9,
          rare: true,
        },
      ],
      weapons: [
        {
          id: 'basic-orbit',
          name: 'Орбитальные лезвия',
          description: 'Короткие вращающиеся клинки вокруг героя, режущие ближайших врагов.',
          kind: 'orbit',
          baseDamage: 1,
          baseCooldownMs: 900,
          projectileCount: 4,
          range: 70,
          projectileSpeed: 0,
        },
      ],
      defaultWeaponId: 'basic-orbit',
      baseDurationSeconds: 300,
    };

    if (!incoming || typeof incoming !== 'object') {
      return fallback;
    }

    const safeNumber = (value: unknown, min: number, max: number, def: number): number => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return def;
      return Phaser.Math.Clamp(value, min, max);
    };

    const hydrateEnemies = (src?: RoguelikeEnemyProfile[]): RoguelikeEnemyProfile[] => {
      if (!Array.isArray(src) || !src.length) return fallback.enemyProfiles;
      return src
        .map((e, index) => {
          const base = fallback.enemyProfiles[index % fallback.enemyProfiles.length];
          if (!e || typeof e !== 'object') return base;
          const patternNames: RoguelikeEnemyProfile['pattern'][] = ['chaser', 'orbiter', 'charger', 'ranged'];
          const pattern = patternNames.includes(e.pattern) ? e.pattern : base.pattern;
          return {
            id: typeof e.id === 'string' && e.id.trim() ? e.id.trim() : base.id,
            name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : base.name,
            description:
              typeof e.description === 'string' && e.description.trim()
                ? e.description.trim()
                : base.description,
            pattern,
            maxHealth: safeNumber(e.maxHealth, 1, 10, base.maxHealth),
            touchDamage: safeNumber(e.touchDamage, 1, 3, base.touchDamage),
            speed: safeNumber(e.speed, 30, 110, base.speed),
            spawnWeight: safeNumber(e.spawnWeight, 1, 7, base.spawnWeight),
          };
        })
        .filter(Boolean);
    };

    const hydratePickups = (src?: RoguelikePickupProfile[]): RoguelikePickupProfile[] => {
      if (!Array.isArray(src) || !src.length) return fallback.pickupProfiles;
      const result = src
        .map((p, index) => {
          const base = fallback.pickupProfiles[index % fallback.pickupProfiles.length];
          if (!p || typeof p !== 'object') return base;
          const allowedTypes: RoguelikePickupProfile['type'][] = [
            'heal',
            'xp',
            'temporaryBuff',
            'currency',
            'weaponUpgrade',
          ];
          const type = allowedTypes.includes(p.type) ? p.type : base.type;
          return {
            id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : base.id,
            name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : base.name,
            description:
              typeof p.description === 'string' && p.description.trim()
                ? p.description.trim()
                : base.description,
            type,
            amount: safeNumber(p.amount ?? base.amount ?? 1, 1, 50, base.amount ?? 1),
            dropChance: safeNumber(
              typeof p.dropChance === 'number' && Number.isFinite(p.dropChance)
                ? p.dropChance
                : base.dropChance,
              0.15,
              0.9,
              base.dropChance,
            ),
            upgradeKind: p.upgradeKind ?? base.upgradeKind,
            damageBonus:
              typeof p.damageBonus === 'number' && Number.isFinite(p.damageBonus)
                ? p.damageBonus
                : base.damageBonus,
            projectileBonus:
              typeof p.projectileBonus === 'number' && Number.isInteger(p.projectileBonus)
                ? p.projectileBonus
                : base.projectileBonus,
            cooldownMultiplier:
              typeof p.cooldownMultiplier === 'number' && Number.isFinite(p.cooldownMultiplier)
                ? p.cooldownMultiplier
                : base.cooldownMultiplier,
            grantWeaponId:
              typeof p.grantWeaponId === 'string' && p.grantWeaponId.trim().length > 0
                ? p.grantWeaponId.trim()
                : base.grantWeaponId,
            rare: typeof p.rare === 'boolean' ? p.rare : base.rare,
            moveSpeedBonusMultiplier: safeNumber(
              p.moveSpeedBonusMultiplier ?? base.moveSpeedBonusMultiplier ?? 1,
              1,
              2,
              base.moveSpeedBonusMultiplier ?? 1,
            ),
            maxHealthBonusFlat: safeNumber(
              p.maxHealthBonusFlat ?? base.maxHealthBonusFlat ?? 0,
              0,
              8,
              base.maxHealthBonusFlat ?? 0,
            ),
            maxHealthBonusMultiplier: safeNumber(
              p.maxHealthBonusMultiplier ?? base.maxHealthBonusMultiplier ?? 1,
              1,
              2.5,
              base.maxHealthBonusMultiplier ?? 1,
            ),
          };
        })
        .filter(Boolean);

      const hasUpgrade = result.some((p) => p.type === 'weaponUpgrade');
      if (!hasUpgrade) {
        const fallbackUpgrade = fallback.pickupProfiles.find((p) => p.type === 'weaponUpgrade');
        if (fallbackUpgrade) {
          result.push(fallbackUpgrade);
        }
      }

      return result;
    };

    const hydrateWeapons = (src?: RoguelikeWeaponProfile[]): RoguelikeWeaponProfile[] => {
      if (!Array.isArray(src) || !src.length) return fallback.weapons;
      const kinds: RoguelikeWeaponProfile['kind'][] = ['basic', 'orbit', 'nova', 'chain'];
      return src
        .map((w, index) => {
          const base = fallback.weapons[index % fallback.weapons.length];
          if (!w || typeof w !== 'object') return base;
          const kind = kinds.includes(w.kind) ? w.kind : base.kind;
          return {
            id: typeof w.id === 'string' && w.id.trim() ? w.id.trim() : base.id,
            name: typeof w.name === 'string' && w.name.trim() ? w.name.trim() : base.name,
            description:
              typeof w.description === 'string' && w.description.trim()
                ? w.description.trim()
                : base.description,
            kind,
            baseDamage: safeNumber(w.baseDamage, 0.2, 20, base.baseDamage),
            baseCooldownMs: safeNumber(
              w.baseCooldownMs,
              200,
              5000,
              base.baseCooldownMs,
            ),
            projectileCount: safeNumber(w.projectileCount, 1, 24, base.projectileCount),
            range: safeNumber(w.range, 40, 260, base.range),
            projectileSpeed: safeNumber(
              w.projectileSpeed ?? base.projectileSpeed ?? 0,
              0,
              400,
              base.projectileSpeed ?? 0,
            ),
            chainTargets: w.chainTargets
              ? safeNumber(w.chainTargets, 1, 10, w.chainTargets)
              : base.chainTargets,
          };
        })
        .filter(Boolean);
    };

    const hydrateConstraints = (src?: RoguelikeVariantSettings['playerConstraints']) => {
      if (!Array.isArray(src) || !src.length) return fallback.playerConstraints;
      return src
        .map((c, index) => {
          const base = fallback.playerConstraints[index % fallback.playerConstraints.length];
          if (!c || typeof c !== 'object') return base;
          const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : base.id;
          const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : base.name;
          const description =
            typeof c.description === 'string' && c.description.trim()
              ? c.description.trim()
              : base.description;
          return {
            id,
            name,
            description,
            maxHealthMultiplier: safeNumber(
              c.maxHealthMultiplier ?? base.maxHealthMultiplier ?? 1,
              0.3,
              3,
              base.maxHealthMultiplier ?? 1,
            ),
            moveSpeedMultiplier: safeNumber(
              c.moveSpeedMultiplier ?? base.moveSpeedMultiplier ?? 1,
              0.3,
              3,
              base.moveSpeedMultiplier ?? 1,
            ),
            attackCooldownMultiplier: safeNumber(
              c.attackCooldownMultiplier ?? base.attackCooldownMultiplier ?? 1,
              0.3,
              3,
              base.attackCooldownMultiplier ?? 1,
            ),
            projectileCountBonus: safeNumber(
              c.projectileCountBonus ?? base.projectileCountBonus ?? 0,
              -12,
              12,
              base.projectileCountBonus ?? 0,
            ),
            damageMultiplier: safeNumber(
              c.damageMultiplier ?? base.damageMultiplier ?? 1,
              0.25,
              4,
              base.damageMultiplier ?? 1,
            ),
            weaponDisabled: Boolean(c.weaponDisabled),
            allowOnlyMelee: Boolean(c.allowOnlyMelee),
            allowOnlyAuras: Boolean(c.allowOnlyAuras),
          };
        })
        .filter(Boolean);
    };

    const goalInput = incoming.challengeGoal;
    const goal: RoguelikeVariantSettings['challengeGoal'] =
      goalInput && typeof goalInput === 'object'
        ? {
            type: goalInput.type ?? fallback.challengeGoal.type,
            description:
              typeof goalInput.description === 'string' && goalInput.description.trim()
                ? goalInput.description.trim()
                : fallback.challengeGoal.description,
            targetValue: safeNumber(
              goalInput.targetValue,
              10,
              100000,
              fallback.challengeGoal.targetValue,
            ),
            softFailAllowed: goalInput.softFailAllowed ?? fallback.challengeGoal.softFailAllowed,
          }
        : fallback.challengeGoal;

    const enemies = hydrateEnemies(incoming.enemyProfiles);
    const pickups = hydratePickups(incoming.pickupProfiles);
    const weapons = hydrateWeapons(incoming.weapons);
    const constraints = hydrateConstraints(incoming.playerConstraints);

    const defaultWeaponId =
      typeof incoming.defaultWeaponId === 'string' &&
      weapons.some((w) => w.id === incoming.defaultWeaponId)
        ? incoming.defaultWeaponId
        : fallback.defaultWeaponId;

    const codename =
      typeof incoming.codename === 'string' && incoming.codename.trim()
        ? incoming.codename.trim()
        : fallback.codename;
    const briefing =
      typeof incoming.briefing === 'string' && incoming.briefing.trim()
        ? incoming.briefing.trim()
        : fallback.briefing;

    const baseDurationSeconds = safeNumber(
      incoming.baseDurationSeconds ?? fallback.baseDurationSeconds ?? 300,
      60,
      3600,
      fallback.baseDurationSeconds ?? 300,
    );

    return {
      codename,
      briefing,
      challengeGoal: goal,
      playerConstraints: constraints,
      enemyProfiles: enemies.length ? enemies : fallback.enemyProfiles,
      pickupProfiles: pickups.length ? pickups : fallback.pickupProfiles,
      weapons: weapons.length ? weapons : fallback.weapons,
      defaultWeaponId,
      baseDurationSeconds,
    };
  }

  private applyPlayerConstraints(): void {
    const constraints = this.variant.playerConstraints;
    if (!constraints.length) return;

    // Можно комбинировать все мутаторы; при желании добавим выбор одного случайного
    const combined = constraints.reduce(
      (acc, c) => {
        acc.maxHealthMultiplier *= c.maxHealthMultiplier ?? 1;
        acc.moveSpeedMultiplier *= c.moveSpeedMultiplier ?? 1;
        acc.attackCooldownMultiplier *= c.attackCooldownMultiplier ?? 1;
        acc.projectileCountBonus += c.projectileCountBonus ?? 0;
        acc.damageMultiplier *= c.damageMultiplier ?? 1;
        acc.weaponDisabled = acc.weaponDisabled || !!c.weaponDisabled;
        acc.allowOnlyMelee = acc.allowOnlyMelee || !!c.allowOnlyMelee;
        acc.allowOnlyAuras = acc.allowOnlyAuras || !!c.allowOnlyAuras;
        return acc;
      },
      {
        maxHealthMultiplier: 1,
        moveSpeedMultiplier: 1,
        attackCooldownMultiplier: 1,
        projectileCountBonus: 0,
        damageMultiplier: 1,
        weaponDisabled: false,
        allowOnlyMelee: false,
        allowOnlyAuras: false,
      },
    );

    // Дополнительные клампы, чтобы финальные значения не делали игру несправедливой
    combined.maxHealthMultiplier = Phaser.Math.Clamp(combined.maxHealthMultiplier, 0.7, 2.5);
    combined.moveSpeedMultiplier = Phaser.Math.Clamp(combined.moveSpeedMultiplier, 0.7, 2.0);
    combined.attackCooldownMultiplier = Phaser.Math.Clamp(
      combined.attackCooldownMultiplier,
      0.5,
      2.0,
    );
    combined.damageMultiplier = Phaser.Math.Clamp(combined.damageMultiplier, 0.7, 3.0);

    const baseHp = 5;
    this.maxHealth = Math.max(1, Math.round(baseHp * combined.maxHealthMultiplier));
    this.health = this.maxHealth;
    this.moveSpeedMultiplier = combined.moveSpeedMultiplier;

    const weapon = this.weapon;
    if (combined.weaponDisabled) {
      // Полностью отключаем оружие — чистый челлендж на уклонение
      this.weaponCooldown = Number.POSITIVE_INFINITY;
    } else {
      const projectileCount = Math.max(
        1,
        weapon.projectileCount + (combined.projectileCountBonus | 0),
      );
      this.weapon = {
        ...weapon,
        baseCooldownMs: weapon.baseCooldownMs * combined.attackCooldownMultiplier,
        projectileCount,
        baseDamage: weapon.baseDamage * combined.damageMultiplier,
      };
    }
  }

  private createGroups(): void {
    this.enemies = this.physics.add.group({ allowGravity: false });
    this.pickups = this.physics.add.group({ allowGravity: false });
    this.bullets = this.physics.add.group({ allowGravity: false });
    this.bullets.runChildUpdate = false;
  }

  private createPlayer(): void {
    const heroTexture =
      this.getLlmTextureKey({ role: 'hero' }) ??
      this.ensureCircleTexture('rogue_hero', 14, 0x4caf50);
    this.player = this.physics.add.sprite(this.safeBounds.centerX, this.safeBounds.centerY, heroTexture);
    this.player.setDepth(2);
    this.player.setCollideWorldBounds(true);
    this.disableGravity(this.player);

    if (this.getLlmSpriteMetaByTexture(heroTexture)) {
      this.fitSpriteToLlmMeta(this.player, heroTexture, {
        bodyWidthRatio: 0.65,
        bodyHeightRatio: 0.9,
      });
    } else {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.setCircle(14);
    }
  }

  private createHud(): void {
    const topY = this.safeBounds.top + 12;
    this.hpText = this.add
      .text(this.safeBounds.left + 12, topY, '', {
        fontSize: '18px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setScrollFactor(0)
      .setDepth(5);

    this.timerText = this.add
      .text(this.safeBounds.right - 12, topY, '', {
        fontSize: '18px',
        color: '#80d4ff',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(5);

    this.killText = this.add
      .text(this.safeBounds.left + 12, topY + 22, '', {
        fontSize: '16px',
        color: '#ffd54f',
        fontFamily: 'Arial',
      })
      .setScrollFactor(0)
      .setDepth(5);

    const challengeLine = `${this.variant.codename}: ${this.variant.challengeGoal.description}`;
    this.challengeText = this.add
      .text(this.safeBounds.centerX, topY + 20, challengeLine, {
        fontSize: '14px',
        color: '#ffe082',
        fontFamily: 'Arial',
        wordWrap: { width: this.safeBounds.width * 0.9 },
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(5);

    this.updateHpLabel();
    this.updateKillLabel();
    this.updateTimerLabel();
  }

  private registerCollisions(): void {
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.onPlayerHitsEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      this.onBulletHitsEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.pickups,
      this.onPlayerCollectsPickup as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
  }

  private updateMovement(dt: number): void {
    const speedBase = 120;
    const speed = speedBase * this.moveSpeedMultiplier;

    if (this.movementMode === 'pointer' && this.pointerTarget) {
      const target = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(this.pointerTarget.x, this.safeBounds.left, this.safeBounds.right),
        Phaser.Math.Clamp(this.pointerTarget.y, this.safeBounds.top, this.safeBounds.bottom),
      );
      const dir = target.clone().subtract(this.player).normalize();
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
      const move = Math.min(dist, speed * dt);
      this.player.x += dir.x * move;
      this.player.y += dir.y * move;
      return;
    }

    if (this.keyboard) {
      const x =
        (this.keyboard.left?.isDown ? -1 : 0) +
        (this.keyboard.right?.isDown ? 1 : 0);
      const y =
        (this.keyboard.up?.isDown ? -1 : 0) +
        (this.keyboard.down?.isDown ? 1 : 0);
      const dir = new Phaser.Math.Vector2(x, y);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        this.player.x = Phaser.Math.Clamp(
          this.player.x + dir.x * speed * dt,
          this.safeBounds.left,
          this.safeBounds.right,
        );
        this.player.y = Phaser.Math.Clamp(
          this.player.y + dir.y * speed * dt,
          this.safeBounds.top,
          this.safeBounds.bottom,
        );
      }
    }
  }

  private updateSpawns(time: number, delta: number): void {
    const densityParam = Number(this.gameData.config.params?.density ?? 1) || 1;
    const density = Phaser.Math.Clamp(densityParam, 0.4, 1.6);

    const baseDelay = this.baseEnemySpawnDelay / density;
    const t = this.timeElapsed;
    // Рост сложности более мягкий и с меньшим максимумом
    const difficultyMul = Phaser.Math.Clamp(1 + t / 180, 1, 2); // растет каждые 3 минуты
    const delay = baseDelay / difficultyMul;

    this.enemySpawnTimer -= delta;
    if (this.enemySpawnTimer <= 0) {
      this.spawnEnemyWave();
      this.enemySpawnTimer = delay;
    }
  }

  private spawnEnemyWave(): void {
    if (!this.enemyProfiles.length) return;

    const activeCount = this.enemies.countActive(true);
    if (activeCount >= this.maxEnemiesOnScreen) {
      return;
    }

    const budget = this.maxEnemiesOnScreen - activeCount;
    const maxSpawn = Phaser.Math.Clamp(budget, 1, 2);
    const count = Phaser.Math.Between(1, maxSpawn);

    for (let i = 0; i < count; i++) {
      const profile = this.pickEnemyProfile();
      this.spawnEnemy(profile);
    }
  }

  private pickEnemyProfile(): RoguelikeEnemyProfile {
    const pool = this.enemyProfiles;
    const total = pool.reduce((sum, e) => sum + e.spawnWeight, 0);
    let roll = Math.random() * (total || pool.length);
    for (const e of pool) {
      roll -= e.spawnWeight;
      if (roll <= 0) return e;
    }
    return pool[0];
  }

  private spawnEnemy(profile: RoguelikeEnemyProfile): void {
    const margin = 40;
    const side = Phaser.Math.Between(0, 3);
    let x = this.safeBounds.centerX;
    let y = this.safeBounds.top - margin;

    switch (side) {
      case 0:
        x = this.safeBounds.left - margin;
        y = Phaser.Math.Between(this.safeBounds.top, this.safeBounds.bottom);
        break;
      case 1:
        x = this.safeBounds.right + margin;
        y = Phaser.Math.Between(this.safeBounds.top, this.safeBounds.bottom);
        break;
      case 2:
        x = Phaser.Math.Between(this.safeBounds.left, this.safeBounds.right);
        y = this.safeBounds.top - margin;
        break;
      case 3:
        x = Phaser.Math.Between(this.safeBounds.left, this.safeBounds.right);
        y = this.safeBounds.bottom + margin;
        break;
    }

    const llmTexture =
      this.getLlmTextureKey({ id: profile.id }) ??
      this.getLlmTextureKey({ role: 'enemy', random: true });
    const textureKey =
      llmTexture ??
      this.ensureCircleTexture(`rogue_enemy_${profile.id}`, 10, 0xff7043);

    const enemy = this.enemies.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(1);
    this.disableGravity(enemy);
    if (llmTexture) {
      this.fitSpriteToLlmMeta(enemy, textureKey, {
        bodyWidthRatio: 0.6,
        bodyHeightRatio: 0.8,
      });
    } else {
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      body.setCircle(10);
    }

    enemy.setData('profileId', profile.id);
    enemy.setData('pattern', profile.pattern);
    enemy.setData('hp', profile.maxHealth);
    enemy.setData('speed', profile.speed);
    enemy.setData('touchDamage', profile.touchDamage);
    enemy.setData('spawnTime', this.time.now);
    enemy.setData('orbitSeed', Math.random() * Math.PI * 2);
    enemy.setData('state', 'idle');
    enemy.setData('nextActionAt', this.time.now + Phaser.Math.Between(800, 1800));
  }

  private updateEnemies(dt: number): void {
    const playerX = this.player.x;
    const playerY = this.player.y;

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return;

      const pattern = enemy.getData('pattern') as RoguelikeEnemyProfile['pattern'];
      const speed = (enemy.getData('speed') as number) || 60;
      const state = (enemy.getData('state') as string) || 'idle';

      const toPlayer = new Phaser.Math.Vector2(playerX - enemy.x, playerY - enemy.y);
      const dist = toPlayer.length();
      const dir = dist > 0 ? toPlayer.clone().scale(1 / dist) : new Phaser.Math.Vector2(0, 0);

      switch (pattern) {
        case 'chaser': {
          const move = speed * dt;
          enemy.x += dir.x * move;
          enemy.y += dir.y * move;
          break;
        }
        case 'orbiter': {
          // Держится на среднем расстоянии и кружит
          const desiredRadius = 120;
          const orbitSeed = (enemy.getData('orbitSeed') as number) || 0;
          const angle = this.timeElapsed * 0.8 + orbitSeed;
          const radialDir = new Phaser.Math.Vector2(
            Math.cos(angle),
            Math.sin(angle),
          );

          // Подтягиваемся к окружности вокруг игрока
          const currentRadius = dist;
          const radiusError = desiredRadius - currentRadius;
          const radialAdjust = Phaser.Math.Clamp(radiusError, -1, 1) * speed * 0.5 * dt;

          enemy.x += radialDir.x * radialAdjust;
          enemy.y += radialDir.y * radialAdjust;
          break;
        }
        case 'charger': {
          const now = this.time.now;
          const nextActionAt = (enemy.getData('nextActionAt') as number) || 0;

          if (state === 'charging') {
            const move = speed * 1.6 * dt;
            enemy.x += dir.x * move;
            enemy.y += dir.y * move;
            if (now >= nextActionAt) {
              enemy.setData('state', 'idle');
              enemy.setData('nextActionAt', now + Phaser.Math.Between(1000, 2200));
            }
          } else if (now >= nextActionAt) {
            enemy.setData('state', 'charging');
            enemy.setData('nextActionAt', now + Phaser.Math.Between(260, 480));
          } else {
            // медленное подползание
            const move = speed * 0.4 * dt;
            enemy.x += dir.x * move;
            enemy.y += dir.y * move;
          }
          break;
        }
        case 'ranged':
        default: {
          // Держим дистанцию: если далеко — подтягиваемся, если близко — отпрыгиваем
          const minDist = 140;
          const maxDist = 220;
          let moveDir = new Phaser.Math.Vector2(0, 0);

          if (dist > maxDist) {
            moveDir = dir;
          } else if (dist < minDist) {
            moveDir = dir.clone().scale(-1);
          } else {
            // боковое смещение по окружности
            moveDir = new Phaser.Math.Vector2(-dir.y, dir.x);
          }

          const move = speed * 0.9 * dt;
          enemy.x += moveDir.x * move;
          enemy.y += moveDir.y * move;
          break;
        }
      }
    });
  }

  private updateWeapon(delta: number): void {
    if (!this.activeWeapons.length || !Number.isFinite(this.weaponCooldown)) return;

    this.weaponCooldown -= delta;
    if (this.weaponCooldown <= 0) {
      this.fireWeaponsSalvo();
      const mainWeapon = this.activeWeapons[0];
      this.weaponCooldown = mainWeapon.baseCooldownMs / this.getGlobalTimeScale(1);
    }
  }

  private fireWeaponsSalvo(): void {
    if (!this.activeWeapons.length) return;
    this.activeWeapons.forEach((weapon) => this.fireWeaponInstance(weapon));
  }

  private fireWeaponInstance(weapon: RoguelikeWeaponProfile): void {
    switch (weapon.kind) {
      case 'orbit':
        this.fireOrbitals(weapon);
        break;
      case 'nova':
        this.fireNova(weapon);
        break;
      case 'basic':
        this.fireBasicProjectiles(weapon);
        break;
      case 'chain':
        this.fireChain(weapon);
        break;
    }
  }

  private fireOrbitals(weapon: RoguelikeWeaponProfile): void {
    const count = Phaser.Math.Clamp(weapon.projectileCount, 1, 24);
    const radius = weapon.range;
    const damage = weapon.baseDamage;
    const color = 0xfff176;

    // Удаляем старые орбитальные снаряды, чтобы не захламлять сцену
    this.bullets.getChildren().forEach((child) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (b.getData('orbit')) {
        b.destroy();
      }
    });

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + this.timeElapsed;
      const x = this.player.x + Math.cos(angle) * radius;
      const y = this.player.y + Math.sin(angle) * radius;
      const bullet = this.createBullet(x, y, 0, 0, color);
      bullet.setData('damage', damage);
      bullet.setData('orbit', true);
      bullet.setData('orbitRadius', radius);
      bullet.setData('orbitAngle', angle);
      bullet.setData('orbitSpeed', 1);
    }
  }

  private fireNova(weapon: RoguelikeWeaponProfile): void {
    const count = Phaser.Math.Clamp(weapon.projectileCount, 4, 64);
    const speed = weapon.projectileSpeed ?? 140;
    const damage = weapon.baseDamage;
    const color = 0x90caf9;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const bullet = this.createBullet(this.player.x, this.player.y, vx, vy, color);
      bullet.setData('damage', damage);
    }
  }

  private fireBasicProjectiles(weapon: RoguelikeWeaponProfile): void {
    const target = this.findClosestEnemy();
    const count = Phaser.Math.Clamp(weapon.projectileCount, 1, 8);
    const damage = weapon.baseDamage;
    const speed = weapon.projectileSpeed ?? 200;
    const color = 0xfff9c4;

    for (let i = 0; i < count; i++) {
      let angle: number;
      if (target) {
        angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
      } else {
        angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      }
      const spread = (Math.PI / 24) * (i - (count - 1) / 2);
      const vx = Math.cos(angle + spread) * speed;
      const vy = Math.sin(angle + spread) * speed;
      const bullet = this.createBullet(this.player.x, this.player.y, vx, vy, color);
      bullet.setData('damage', damage);
    }
  }

  private fireChain(weapon: RoguelikeWeaponProfile): void {
    const first = this.findClosestEnemy();
    if (!first) return;

    const maxTargets = weapon.chainTargets ?? 4;
    const damage = weapon.baseDamage;

    let current: Phaser.Physics.Arcade.Sprite | null = first;
    const visited = new Set<Phaser.Physics.Arcade.Sprite>();
    const chainColor = 0xb39ddb;

    for (let i = 0; i < maxTargets && current; i++) {
      const chainTarget = current;
      visited.add(chainTarget);
      const bullet = this.createBullet(this.player.x, this.player.y, 0, 0, chainColor);
      bullet.setData('damage', damage);
      bullet.setData('instantHit', true);
      bullet.setData('target', chainTarget);

      current = this.findNextChainTarget(chainTarget, visited);
    }
  }

  private createBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: number,
  ): Phaser.Physics.Arcade.Sprite {
    const texture = this.ensureCircleTexture(`rogue_bullet_${color.toString(16)}`, 4, color);
    const bullet = (this.bullets as Phaser.Physics.Arcade.Group).create(
      x,
      y,
      texture,
    ) as Phaser.Physics.Arcade.Sprite;
    this.disableGravity(bullet);
    bullet.setDepth(1);
    bullet.setVelocity(vx, vy);
    return bullet;
  }

  private updateOrbitBullets(): void {
    const bullets = this.bullets.getChildren() as Phaser.Physics.Arcade.Sprite[];
    if (!bullets.length) return;

    bullets.forEach((bullet) => {
      if (!bullet.active) return;
      if (!bullet.getData('orbit')) return;

      const radius = (bullet.getData('orbitRadius') as number) || 60;
      const baseAngle = (bullet.getData('orbitAngle') as number) || 0;
      const speed = (bullet.getData('orbitSpeed') as number) || 1;
      const angle = baseAngle + this.timeElapsed * speed;

      bullet.x = this.player.x + Math.cos(angle) * radius;
      bullet.y = this.player.y + Math.sin(angle) * radius;
    });
  }

  private findClosestEnemy(): Phaser.Physics.Arcade.Sprite | null {
    let best: Phaser.Physics.Arcade.Sprite | null = null;
    let bestDistSq = Number.POSITIVE_INFINITY;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = enemy;
      }
    });
    return best;
  }

  private findNextChainTarget(
    from: Phaser.Physics.Arcade.Sprite,
    visited: Set<Phaser.Physics.Arcade.Sprite>,
  ): Phaser.Physics.Arcade.Sprite | null {
    let best: Phaser.Physics.Arcade.Sprite | null = null;
    let bestDistSq = Number.POSITIVE_INFINITY;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || visited.has(enemy)) return;
      const dx = enemy.x - from.x;
      const dy = enemy.y - from.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq && distSq < 180 * 180) {
        bestDistSq = distSq;
        best = enemy;
      }
    });
    return best;
  }

  private onBulletHitsEnemy(
    bullet: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(bullet instanceof Phaser.Physics.Arcade.Sprite)) return;
    if (!(enemy instanceof Phaser.Physics.Arcade.Sprite)) return;

    const damage = (bullet.getData('damage') as number) || this.weapon.baseDamage;
    const instant = bullet.getData('instantHit') === true;

    if (!instant) {
      bullet.destroy();
    }

    const shieldUntil = enemy.getData('shieldUntil') as number | undefined;
    if (shieldUntil && this.time.now < shieldUntil) {
      return;
    }

    let hp = (enemy.getData('hp') as number) ?? 1;
    hp -= damage;
    this.showDamageNumber(enemy.x, enemy.y, damage);
    if (hp <= 0) {
      const x = enemy.x;
      const y = enemy.y;
      enemy.destroy();
      this.totalKills += 1;
      this.updateKillLabel();
      this.updateScore(10);
      this.maybeDropPickup(x, y);
    } else {
      enemy.setData('hp', hp);
      enemy.setTintFill(0xffffff);
      this.time.delayedCall(120, () => enemy.clearTint());
    }
  }

  private onPlayerHitsEnemy(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(enemy instanceof Phaser.Physics.Arcade.Sprite)) return;
    const damage = (enemy.getData('touchDamage') as number) || 1;
    enemy.destroy();
    this.applyDamage(damage);
  }

  private onPlayerCollectsPickup(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    pickup: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(pickup instanceof Phaser.Physics.Arcade.Sprite)) return;
    const profile = pickup.getData('profile') as RoguelikePickupProfile | undefined;
    pickup.destroy();
    if (!profile) return;
    const amount = profile.amount ?? 1;
    switch (profile.type) {
      case 'heal':
        this.health = Phaser.Math.Clamp(this.health + amount, 0, this.maxHealth);
        this.updateHpLabel();
        break;
      case 'xp':
        this.xp += amount;
        break;
      case 'weaponUpgrade':
        this.applyWeaponUpgrade(profile);
        break;
      case 'temporaryBuff':
        this.applyTemporaryBuff(profile);
        break;
      case 'currency':
      default:
        break;
    }
  }

  private maybeDropPickup(x: number, y: number): void {
    if (!this.pickupProfiles.length) return;
    const profile = this.pickPickupProfile();
    if (!profile) return;

    const baseChance = Phaser.Math.Clamp(profile.dropChance, 0, 1);
    const isBuffType =
      profile.type === 'weaponUpgrade' || profile.type === 'temporaryBuff';
    const spawnChance = isBuffType
      ? Phaser.Math.Clamp(baseChance * 1.5, 0.35, 1)
      : baseChance;

    if (Math.random() > spawnChance) return;

    const llmTexture =
      this.getLlmTextureKey({ id: profile.id }) ??
      this.getLlmTextureKey({ role: 'bonus', random: true });

    const isUpgrade = profile.type === 'weaponUpgrade';
    const color = isUpgrade ? 0xffa726 : profile.type === 'heal' ? 0x81c784 : 0xfff176;
    const radius = isUpgrade || profile.rare ? 9 : 6;

    const texture =
      llmTexture ?? this.ensureCircleTexture(`rogue_pickup_${profile.id}`, radius, color);

    const pickup = this.pickups.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    this.disableGravity(pickup);
    pickup.setDepth(isUpgrade || profile.rare ? 3 : 1);
    pickup.setVelocity(0, 22);
    pickup.setData('profile', profile);
  }

  private pickPickupProfile(): RoguelikePickupProfile | undefined {
    if (this.pickupProfiles.length === 0) return undefined;
    const total = this.pickupProfiles.reduce((sum, p) => sum + p.dropChance, 0);
    let roll = Math.random() * (total || this.pickupProfiles.length);
    for (const p of this.pickupProfiles) {
      roll -= p.dropChance;
      if (roll <= 0) return p;
    }
    return this.pickupProfiles[0];
  }

  private applyDamage(amount: number): void {
    // В roguelike шаблоне избегаем one-hit-death, чтобы баланс был в пользу игрока
    this.health = Math.max(0, this.health - amount);
    this.updateHpLabel();
    this.cameras.main.shake(160, 0.004);
    this.player.setTintFill(0xff8a80);
    this.time.delayedCall(150, () => this.player.clearTint());

    if (this.health <= 0) {
      this.finishRun(false);
    }
  }

  private showUpgradeText(message: string): void {
    const x = this.player.x;
    const y = this.player.y - 30;
    const text = this.add.text(x, y, message, {
      fontSize: '16px',
      color: '#ffe082',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    });
    text.setOrigin(0.5);
    text.setDepth(20);
    this.tweens.add({
      targets: text,
      y: y - 24,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private showDamageNumber(x: number, y: number, amount: number): void {
    const text = this.add.text(x, y, `${Math.max(1, Math.round(amount))}`, {
      fontSize: '14px',
      color: '#ffeb3b',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    });
    text.setOrigin(0.5);
    text.setDepth(19);
    this.tweens.add({
      targets: text,
      y: y - 20,
      alpha: 0,
      duration: 450,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private applyWeaponUpgrade(profile: RoguelikePickupProfile): void {
    if (!this.activeWeapons.length) {
      if (this.weapon) {
        this.activeWeapons = [this.weapon];
      } else {
        return;
      }
    }

    const kind = profile.upgradeKind ?? 'damage';

    if (kind === 'grantWeapon') {
      const id = profile.grantWeaponId;
      if (!id) return;
      const weapon = this.variant.weapons.find((w) => w.id === id);
      if (!weapon) return;
      const alreadyActive = this.activeWeapons.some((w) => w.id === id);
      if (!alreadyActive) {
        this.activeWeapons.push({ ...weapon });
      }
      this.showUpgradeText('Новое оружие!');
      return;
    }

    // Усиливаем все активные оружия (чуть-чуть, чтобы не ломать баланс)
    const damageBonus = profile.damageBonus ?? 1.2;
    const projectileBonus = profile.projectileBonus ?? 1;
    const cooldownMul = profile.cooldownMultiplier ?? 0.9;

    this.activeWeapons = this.activeWeapons.map((weapon) => {
      const upgraded: RoguelikeWeaponProfile = { ...weapon };
      if (kind === 'damage' || kind === 'projectile' || kind === 'cooldown') {
        if (kind === 'damage') {
          upgraded.baseDamage *= damageBonus;
        }
        if (kind === 'projectile') {
          upgraded.projectileCount = Phaser.Math.Clamp(
            (upgraded.projectileCount ?? 1) + projectileBonus,
            1,
            32,
          );
        }
        if (kind === 'cooldown') {
          upgraded.baseCooldownMs = Phaser.Math.Clamp(
            upgraded.baseCooldownMs * cooldownMul,
            180,
            6000,
          );
        }
      } else {
        // Общий случай, если upgradeKind неизвестен — чуть-чуть бустануть всё
        upgraded.baseDamage *= damageBonus;
        upgraded.projectileCount = Phaser.Math.Clamp(
          (upgraded.projectileCount ?? 1) + projectileBonus,
          1,
          32,
        );
        upgraded.baseCooldownMs = Phaser.Math.Clamp(
          upgraded.baseCooldownMs * cooldownMul,
          180,
          6000,
        );
      }
      return upgraded;
    });

    this.weapon = this.activeWeapons[0];
    this.showUpgradeText('Апгрейд оружия!');
  }

  private applyTemporaryBuff(profile: RoguelikePickupProfile): void {
    const speedMulRaw = profile.moveSpeedBonusMultiplier ?? 1.15;
    const hpFlatRaw = profile.maxHealthBonusFlat ?? 1;
    const hpMulRaw = profile.maxHealthBonusMultiplier ?? 1;

    const speedMul = Phaser.Math.Clamp(speedMulRaw, 1.05, 1.6);
    const hpFlat = Phaser.Math.Clamp(hpFlatRaw, 0, 5);
    const hpMul = Phaser.Math.Clamp(hpMulRaw, 1, 2.0);

    // Баф скорости
    this.moveSpeedMultiplier = Phaser.Math.Clamp(
      this.moveSpeedMultiplier * speedMul,
      0.5,
      3.0,
    );

    // Баф здоровья
    const oldMax = this.maxHealth;
    let newMax = oldMax;
    if (hpFlat > 0) {
      newMax += hpFlat;
    }
    newMax = Math.round(newMax * hpMul);
    newMax = Phaser.Math.Clamp(newMax, 1, 40);

    const lostHp = oldMax - this.health;
    this.maxHealth = newMax;
    // Сохраняем текущий процент здоровья
    this.health = Phaser.Math.Clamp(this.maxHealth - lostHp, 1, this.maxHealth);

    this.updateHpLabel();
    this.showUpgradeText('Бафф героя!');
  }

  private updateHpLabel(): void {
    if (this.hpText) {
      this.hpText.setText(`HP: ${this.health}/${this.maxHealth}`);
    }
  }

  private updateKillLabel(): void {
    if (this.killText) {
      this.killText.setText(`Убийства: ${this.totalKills}`);
    }
  }

  private updateTimerLabel(): void {
    if (!this.timerText) return;
    const totalSeconds = Math.floor(this.timeElapsed);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.timerText.setText(
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
    );
  }

  private cleanupOffscreen(): void {
    const bounds = new Phaser.Geom.Rectangle(
      this.safeBounds.left - 80,
      this.safeBounds.top - 80,
      this.safeBounds.width + 160,
      this.safeBounds.height + 160,
    );

    this.enemies.getChildren().forEach((child) => {
      const e = child as Phaser.Physics.Arcade.Sprite;
      if (!bounds.contains(e.x, e.y)) {
        e.destroy();
      }
    });

    (this.bullets as Phaser.Physics.Arcade.Group).getChildren().forEach((child) => {
      const b = child as Phaser.Physics.Arcade.Sprite;
      if (!bounds.contains(b.x, b.y)) {
        b.destroy();
      }
    });

    this.pickups.getChildren().forEach((child) => {
      const p = child as Phaser.Physics.Arcade.Sprite;
      if (!bounds.contains(p.x, p.y)) {
        p.destroy();
      }
    });
  }

  private checkChallengeCompletion(): void {
    const goal = this.variant.challengeGoal;
    if (!goal) return;

    switch (goal.type) {
      case 'surviveTime':
        if (this.timeElapsed >= goal.targetValue) {
          this.finishRun(true);
        }
        break;
      case 'reachKillCount':
        if (this.totalKills >= goal.targetValue) {
          this.finishRun(true);
        }
        break;
      case 'collectResources':
        if (this.xp >= goal.targetValue) {
          this.finishRun(true);
        }
        break;
      case 'surviveWaves':
      default:
        // В текущей версии волны считаем по времени
        break;
    }
  }

  private finishRun(success: boolean): void {
    if (this.gameEnded) return;
    this.gameEnded = true;

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    const overlay = this.add.rectangle(
      centerX,
      centerY,
      this.scale.width,
      this.scale.height,
      0x000000,
      0.8,
    );
    overlay.setScrollFactor(0);
    overlay.setDepth(10);

    const title = this.add
      .text(centerX, centerY - 60, success ? 'Челлендж выполнен!' : 'Вы погибли', {
        fontSize: '32px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);

    const summaryLines: string[] = [
      this.variant.challengeGoal.description,
      `Время: ${this.timerText.text}`,
      `Убийства: ${this.totalKills}`,
      `Счёт: ${this.score}`,
    ];

    const summary = this.add
      .text(centerX, centerY - 10, summaryLines.join('\n'), {
        fontSize: '18px',
        color: '#d0d7ff',
        fontFamily: 'Arial',
        align: 'center',
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

  // Вспомогательные утилиты для примитивной отрисовки

  private ensureCircleTexture(key: string, radius: number, color: number): string {
    const textureKey = `${key}_${radius}_${color.toString(16)}`;
    if (!this.textures.exists(textureKey)) {
      const graphics = this.make.graphics({
        x: 0,
        y: 0,
        add: false,
      } as Phaser.Types.GameObjects.Graphics.Options);
      graphics.fillStyle(color, 1);
      graphics.fillCircle(radius, radius, radius);
      graphics.generateTexture(textureKey, radius * 2, radius * 2);
      graphics.destroy();
    }
    return textureKey;
  }

  private disableGravity(target?: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.GameObject): void {
    const body = (target as Phaser.Physics.Arcade.Sprite | undefined)?.body;
    if (body instanceof Phaser.Physics.Arcade.Body) {
      body.setAllowGravity(false);
    }
  }
}



