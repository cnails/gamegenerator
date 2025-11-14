import Phaser from 'phaser';
import type { GeneratedGame, GeneratedGameData } from '@/types';
import { BaseGameScene } from '../BaseGameScene';

type TowerDefinition = {
  id: string;
  name: string;
  damage: number;
  fireRate: number;
  range: number;
  projectileSpeed: number;
  effect?: string;
  color: number;
};

type EnemyDefinition = {
  id: string;
  name: string;
  speed: number;
  health: number;
  reward: number;
  color: number;
  ability?: string;
};

type WaveDefinition = {
  name: string;
  description?: string;
  rewardMultiplier: number;
  groups: { enemyId: string; count: number }[];
};

type TowerInstance = {
  position: Phaser.Math.Vector2;
  definition: TowerDefinition;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  cooldown: number;
};

export class TowerDefenseScene extends BaseGameScene {
  private pathPoints: Phaser.Math.Vector2[] = [];
  private towerSlots: Phaser.Math.Vector2[] = [];
  private towers: TowerInstance[] = [];
  private enemies!: Phaser.Physics.Arcade.Group;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private towerDefinitions: TowerDefinition[] = [];
  private enemyMap: Map<string, EnemyDefinition> = new Map();
  private waveDefinitions: WaveDefinition[] = [];
  private requestedWaves = 5;
  private requestedTowerSlots = 6;
  private requestedVariety = 3;
  private baseHealth = 6;
  private baseHealthText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private credits = 0;
  private wavesStarted = 0;
  private allWavesScheduled = false;
  private waveTimer?: Phaser.Time.TimerEvent;
  private activeSpawners: Phaser.Time.TimerEvent[] = [];
  private readonly defaultPalette = [0x10182b, 0x1f2d45, 0x34506e, 0x4caf50, 0xffc048];
  private theme = {
    background: 0x10182b,
    path: 0x23314d,
    pathGlow: 0x2f476e,
    towerBase: 0x4caf50,
    projectile: 0xffc048,
    enemy: 0xff5e57,
  };

  protected initGame(): void {
    this.parseParams();
    this.applyVisualTheme();
    this.towerDefinitions = this.extractTowerDefinitions();
    this.enemyMap = this.extractEnemyDefinitions();
    this.waveDefinitions = this.extractWaveDefinitions();

    this.enemies = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, runChildUpdate: false });
    this.projectiles = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, runChildUpdate: false });

    this.setupWorld();
    this.createHud();
    this.spawnInitialTowers();

    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      this.handleProjectileHit as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.time.delayedCall(600, () => this.spawnNextWave());
  }

  update(_time: number, delta: number): void {
    if (this.gameEnded) {
      return;
    }

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      this.advanceEnemy(enemy);
    });

    this.towers.forEach((tower) => {
      if (tower.cooldown > 0) {
        tower.cooldown -= delta;
      }
      const target = this.findTargetForTower(tower);
      if (!target) {
        return;
      }

      if (tower.cooldown <= 0) {
        this.fireProjectile(tower, target);
        const rate = Phaser.Math.Clamp(tower.definition.fireRate, 0.25, 6);
        tower.cooldown = 1000 / rate;
      }
    });

    this.projectiles.getChildren().forEach((child) => {
      const projectile = child as Phaser.Physics.Arcade.Image;
      const expiresAt = projectile.getData('expiresAt') as number | undefined;
      if (expiresAt && expiresAt < this.time.now) {
        projectile.destroy();
        return;
      }

      if (
        projectile.x < -80 ||
        projectile.x > this.physics.world.bounds.width + 80 ||
        projectile.y < -80 ||
        projectile.y > this.physics.world.bounds.height + 80
      ) {
        projectile.destroy();
      }
    });

    this.tryCompleteGame();
  }

  protected endGame(force: boolean = false): void {
    this.stopSpawners();
    super.endGame(force);
  }

  private parseParams(): void {
    const params = this.gameData.config.params ?? {};
    this.requestedWaves = this.normalizeNumber(params.waveCount, 5, 3, 12);
    this.requestedTowerSlots = this.normalizeNumber(params.towerSlots, 6, 3, 10);
    this.requestedVariety = this.normalizeNumber(params.towerVariety, 3, 1, 5);
    this.requestedVariety = Math.min(this.requestedTowerSlots, this.requestedVariety);
    this.baseHealth = Math.max(3, Math.round(this.requestedWaves * 0.6));
  }

  private applyVisualTheme(): void {
    const palette = this.getVisualColors(this.defaultPalette);
    const pick = (index: number, fallback: number): number => {
      if (!palette.length) return fallback;
      const value = palette[index % palette.length];
      return typeof value === 'number' ? value : fallback;
    };

    const backgroundHint = pick(0, this.theme.background);
    this.theme.background = this.getVisualBackground(backgroundHint);
    this.theme.pathGlow = pick(1, this.theme.pathGlow);
    this.theme.path = pick(2, this.theme.path);
    this.theme.towerBase = pick(3, this.theme.towerBase);
    this.theme.projectile = pick(4, this.theme.projectile);
    this.theme.enemy = pick(0, this.theme.enemy);
  }

  private setupWorld(): void {
    const width = Math.max(this.scale.width, 360);
    const height = Math.max(this.scale.height, 640);

    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.setBackgroundColor(this.theme.background);

    const background = this.add.rectangle(width / 2, height / 2, width, height, this.theme.background, 1);
    background.setDepth(-5);

    this.pathPoints = this.createPath(width, height);
    this.drawPath();
    this.createTowerSlots();

    const basePoint = this.pathPoints[this.pathPoints.length - 1];
    const baseTexture = this.ensureCircleTexture('base', 22, this.theme.pathGlow);
    this.add.image(basePoint.x, basePoint.y, baseTexture).setDepth(1);
  }

  private createHud(): void {
    this.baseHealthText = this.add
      .text(this.scale.width - 20, 20, `База: ${this.baseHealth}`, {
        fontSize: '22px',
        color: '#ffffff',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0);

    this.waveText = this.add
      .text(this.scale.width - 20, 52, 'Волна 0/0', {
        fontSize: '18px',
        color: '#b0c4ff',
        fontFamily: 'Arial',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0);

    this.creditsText = this.add
      .text(20, 60, 'Энергия: 0', {
        fontSize: '18px',
        color: '#b0ffc4',
        fontFamily: 'Arial',
      })
      .setScrollFactor(0);
  }

  private spawnInitialTowers(): void {
    if (!this.towerSlots.length) {
      return;
    }

    const shuffled = Phaser.Utils.Array.Shuffle(this.towerDefinitions.slice());
    const selection = shuffled.slice(0, Math.max(1, Math.min(this.requestedVariety, shuffled.length || 1)));

    let index = 0;
    this.towerSlots.forEach((slot, slotIndex) => {
      const definition = selection[index % selection.length] ?? this.towerDefinitions[0];
      index += 1;
      this.towers.push(this.createTower(slot, definition, slotIndex));
    });
  }

  private createTower(position: Phaser.Math.Vector2, definition: TowerDefinition, slotIndex: number): TowerInstance {
    const textureKey = this.ensureCircleTexture('tower', 18, definition.color ?? this.theme.towerBase);
    const sprite = this.add.image(position.x, position.y, textureKey);
    sprite.setDepth(3);
    sprite.setData('slotIndex', slotIndex);

    const label = this.add
      .text(
        position.x,
        position.y + 26,
        definition.effect ? `${definition.name}\n${definition.effect}` : definition.name,
        {
          fontSize: '12px',
          color: '#d8e2ff',
          align: 'center',
          fontFamily: 'Arial',
        },
      )
      .setOrigin(0.5, 0);

    return {
      position: position.clone(),
      definition,
      sprite,
      label,
      cooldown: 0,
    };
  }

  private spawnNextWave(): void {
    if (this.gameEnded) {
      return;
    }

    if (this.wavesStarted >= this.waveDefinitions.length) {
      this.allWavesScheduled = true;
      return;
    }

    const wave = this.waveDefinitions[this.wavesStarted];
    this.wavesStarted += 1;
    this.waveText.setText(`Волна ${this.wavesStarted}/${this.waveDefinitions.length}: ${wave.name}`);

    const plan: EnemyDefinition[] = [];
    wave.groups.forEach((group) => {
      const enemy = this.enemyMap.get(group.enemyId);
      if (!enemy) return;
      const count = Phaser.Math.Clamp(group.count, 1, 15);
      for (let i = 0; i < count; i++) {
        plan.push(enemy);
      }
    });

    if (!plan.length) {
      this.spawnNextWave();
      return;
    }

    let spawnIndex = 0;
    const spawnDelay = Phaser.Math.Clamp(900 - plan.length * 15, 450, 1100);
    const waveIndex = this.wavesStarted - 1;
    let spawner: Phaser.Time.TimerEvent | null = null;

    const finalizeWaveSchedule = () => {
      if (spawner) {
        this.activeSpawners = this.activeSpawners.filter((event) => event !== spawner);
      }
      if (this.wavesStarted >= this.waveDefinitions.length) {
        this.allWavesScheduled = true;
      } else if (!this.gameEnded) {
        this.waveTimer = this.time.delayedCall(2000, () => this.spawnNextWave());
      }
    };

    this.spawnEnemy(plan[spawnIndex], wave, waveIndex);
    spawnIndex += 1;

    if (plan.length === 1) {
      finalizeWaveSchedule();
      return;
    }

    spawner = this.time.addEvent({
      delay: spawnDelay,
      loop: true,
      callbackScope: this,
      callback: () => {
        if (spawnIndex >= plan.length) {
          spawner?.remove(false);
          finalizeWaveSchedule();
          return;
        }
        this.spawnEnemy(plan[spawnIndex], wave, waveIndex);
        spawnIndex += 1;
        if (spawnIndex >= plan.length) {
          spawner?.remove(false);
          finalizeWaveSchedule();
        }
      },
    });

    this.activeSpawners.push(spawner);
  }

  private spawnEnemy(definition: EnemyDefinition, wave: WaveDefinition, waveIndex: number): void {
    const startPoint = this.pathPoints[0];
    const textureKey = this.ensureCircleTexture('enemy', 14, definition.color ?? this.theme.enemy);
    const enemy = this.physics.add.sprite(startPoint.x, startPoint.y, textureKey);
    enemy.setDepth(2);
    enemy.setCircle(12);
    enemy.setCollideWorldBounds(false);
    this.disableGravity(enemy);

    const speedMultiplier = this.getDifficultyMultiplier(this.gameData.difficulty);
    const baseSpeed = Phaser.Math.Clamp(definition.speed, 40, 160);
    const healthMultiplier = 1 + waveIndex * 0.15;
    const rewardMultiplier = wave.rewardMultiplier || 1;

    const health = Math.round(this.normalizeNumber(definition.health, 120, 50, 400) * healthMultiplier * speedMultiplier);
    const reward = Math.round(this.normalizeNumber(definition.reward, 15, 5, 80) * rewardMultiplier);
    const speed = Phaser.Math.Clamp(baseSpeed * (0.9 + waveIndex * 0.05), 40, 220);

    enemy.setData('hp', health);
    enemy.setData('maxHp', health);
    enemy.setData('speed', speed);
    enemy.setData('reward', reward);
    enemy.setData('pathIndex', 0);
    enemy.setData('definitionId', definition.id);

    this.enemies.add(enemy);
  }

  private advanceEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    let pathIndex = (enemy.getData('pathIndex') as number) ?? 0;
    const nextPoint = this.pathPoints[pathIndex + 1];

    if (!nextPoint) {
      this.handleBaseBreach(enemy);
      return;
    }

    const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, nextPoint.x, nextPoint.y);
    if (distance < 6) {
      pathIndex += 1;
      enemy.setData('pathIndex', pathIndex);
      return;
    }

    const speed = (enemy.getData('speed') as number) || 60;
    const vx = ((nextPoint.x - enemy.x) / distance) * speed;
    const vy = ((nextPoint.y - enemy.y) / distance) * speed;
    enemy.setVelocity(vx, vy);
  }

  private findTargetForTower(tower: TowerInstance): Phaser.Physics.Arcade.Sprite | null {
    const range = tower.definition.range;
    let best: Phaser.Physics.Arcade.Sprite | null = null;
    let bestProgress = -1;

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      const distance = Phaser.Math.Distance.Between(tower.position.x, tower.position.y, enemy.x, enemy.y);
      if (distance > range) return;
      const progress = (enemy.getData('pathIndex') as number) ?? 0;
      if (!best || progress > bestProgress) {
        best = enemy;
        bestProgress = progress;
      }
    });

    return best;
  }

  private fireProjectile(tower: TowerInstance, target: Phaser.Physics.Arcade.Sprite): void {
    const textureKey = this.ensureCircleTexture('projectile', 6, tower.definition.color ?? this.theme.projectile);
    const projectile = this.physics.add.image(tower.position.x, tower.position.y, textureKey);
    projectile.setDepth(4);
    this.disableGravity(projectile);
    projectile.setCircle(4);

    projectile.setData('damage', tower.definition.damage);
    projectile.setData('expiresAt', this.time.now + 2500);

    const angle = Phaser.Math.Angle.Between(tower.position.x, tower.position.y, target.x, target.y);
    const speed = Phaser.Math.Clamp(tower.definition.projectileSpeed, 180, 500);
    projectile.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    this.projectiles.add(projectile);
  }

  private handleProjectileHit(
    projectile: Phaser.GameObjects.GameObject,
    target: Phaser.GameObjects.GameObject,
  ): void {
    if (!(target instanceof Phaser.Physics.Arcade.Sprite)) {
      return;
    }

    const damage = (projectile.getData('damage') as number) || 5;
    projectile.destroy();

    const currentHp = ((target.getData('hp') as number) || 0) - damage;
    target.setData('hp', currentHp);

    if (currentHp <= 0) {
      this.handleEnemyDestroyed(target);
    }
  }

  private handleEnemyDestroyed(enemy: Phaser.Physics.Arcade.Sprite): void {
    const reward = (enemy.getData('reward') as number) || 10;
    this.credits += reward;
    this.creditsText.setText(`Энергия: ${this.credits}`);
    this.updateScore(reward);

    enemy.destroy();
  }

  private handleBaseBreach(enemy: Phaser.Physics.Arcade.Sprite): void {
    enemy.destroy();
    this.baseHealth -= 1;
    this.baseHealthText.setText(`База: ${Math.max(this.baseHealth, 0)}`);

    if (this.baseHealth <= 0) {
      this.handleDefeat();
    }
  }

  private tryCompleteGame(): void {
    if (!this.allWavesScheduled) {
      return;
    }

    if (this.activeSpawners.length > 0) {
      return;
    }

    if (this.enemies.countActive(true) === 0) {
      this.handleVictory();
    }
  }

  private handleVictory(): void {
    if (this.gameEnded) return;
    this.stopSpawners();
    this.updateScore(300 + this.baseHealth * 25);
    this.gameEnded = true;
    this.showGameOver(this.score);
  }

  private handleDefeat(): void {
    if (this.gameEnded) return;
    this.stopSpawners();
    this.gameEnded = true;
    this.showGameOver(this.score);
  }

  private stopSpawners(): void {
    this.waveTimer?.remove(false);
    this.activeSpawners.forEach((event) => event.remove(false));
    this.activeSpawners = [];
  }

  private createPath(width: number, height: number): Phaser.Math.Vector2[] {
    const marginX = Math.max(60, width * 0.08);
    const marginY = Math.max(80, height * 0.12);
    const centerX = width / 2;

    return [
      new Phaser.Math.Vector2(marginX, marginY),
      new Phaser.Math.Vector2(width - marginX, marginY),
      new Phaser.Math.Vector2(width - marginX, height * 0.35),
      new Phaser.Math.Vector2(marginX + 40, height * 0.55),
      new Phaser.Math.Vector2(centerX - 20, height - marginY),
      new Phaser.Math.Vector2(width - marginX, height - marginY),
    ];
  }

  private drawPath(): void {
    if (this.pathPoints.length < 2) {
      return;
    }

    const graphics = this.add.graphics();
    graphics.setDepth(-1);

    const path = new Phaser.Curves.Path(this.pathPoints[0].x, this.pathPoints[0].y);
    for (let i = 1; i < this.pathPoints.length; i++) {
      path.lineTo(this.pathPoints[i].x, this.pathPoints[i].y);
    }

    graphics.lineStyle(36, this.theme.pathGlow, 0.35);
    path.draw(graphics);
    graphics.lineStyle(22, this.theme.path, 0.9);
    path.draw(graphics);
  }

  private createTowerSlots(): void {
    const slots: Phaser.Math.Vector2[] = [];
    const bounds = this.physics.world.bounds;

    for (let i = 0; i < this.pathPoints.length - 1 && slots.length < this.requestedTowerSlots; i++) {
      const start = this.pathPoints[i];
      const end = this.pathPoints[i + 1];
      const mid = start.clone().lerp(end, 0.5);
      const normal = new Phaser.Math.Vector2(end.y - start.y, start.x - end.x);
      if (normal.lengthSq() === 0) {
        normal.set(0, 1);
      }
      normal.normalize().scale(70 + (i % 2) * 20);
      const slot = mid.clone().add(normal);
      slot.x = Phaser.Math.Clamp(slot.x, bounds.x + 50, bounds.right - 50);
      slot.y = Phaser.Math.Clamp(slot.y, bounds.y + 50, bounds.bottom - 50);
      slots.push(slot);
    }

    while (slots.length < this.requestedTowerSlots) {
      const reference = this.pathPoints[Phaser.Math.Between(1, this.pathPoints.length - 2)];
      const offset = new Phaser.Math.Vector2(Phaser.Math.Between(-80, 80), Phaser.Math.Between(-80, 80));
      const slot = reference.clone().add(offset);
      slot.x = Phaser.Math.Clamp(slot.x, bounds.x + 50, bounds.right - 50);
      slot.y = Phaser.Math.Clamp(slot.y, bounds.y + 50, bounds.bottom - 50);
      slots.push(slot);
    }

    this.towerSlots = slots;
  }

  private extractTowerDefinitions(): TowerDefinition[] {
    const fallback = this.getFallbackTowers();
    const payload = this.gameData.gameData as GeneratedGameData | undefined;
    if (!payload || typeof payload !== 'object') {
      return fallback;
    }

    const mechanics = payload.mechanics as Record<string, unknown> | undefined;
    if (!mechanics || typeof mechanics !== 'object') {
      return fallback;
    }

    const raw = mechanics.towerTypes;
    if (!Array.isArray(raw)) {
      return fallback;
    }

    const parsed = raw
      .map<TowerDefinition | null>((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const data = item as Record<string, unknown>;
        const id = String(data.id ?? `tower-${index}`);
        const name = typeof data.name === 'string' ? data.name : `Башня ${index + 1}`;
        const damage = this.normalizeNumber(data.damage, 12, 4, 40);
        const fireRate = this.normalizeNumber(data.fireRate, 1.2, 0.25, 6);
        const range = this.normalizeNumber(data.range, 170, 80, 320);
        const projectileSpeed = this.normalizeNumber(data.projectileSpeed, 320, 160, 520);
        const effect =
          typeof data.effect === 'string'
            ? data.effect
            : typeof data.ability === 'string'
              ? data.ability
              : undefined;
        const color = this.parseColor(data.color, this.theme.towerBase);

        return {
          id,
          name,
          damage,
          fireRate,
          range,
          projectileSpeed,
          effect,
          color,
        };
      })
      .filter((tower): tower is TowerDefinition => !!tower);

    return parsed.length ? parsed : fallback;
  }

  private extractEnemyDefinitions(): Map<string, EnemyDefinition> {
    const fallback = this.getFallbackEnemies();
    const payload = this.gameData.gameData as GeneratedGameData | undefined;

    if (!payload || typeof payload !== 'object') {
      return fallback;
    }

    const mechanics = payload.mechanics as Record<string, unknown> | undefined;
    if (!mechanics || typeof mechanics !== 'object') {
      return fallback;
    }

    const raw = mechanics.enemyTypes;
    if (!Array.isArray(raw)) {
      return fallback;
    }

    const parsed = raw
      .map<EnemyDefinition | null>((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const data = item as Record<string, unknown>;
        const id = String(data.id ?? `enemy-${index}`);
        const name = typeof data.name === 'string' ? data.name : `Враг ${index + 1}`;
        const speed = this.normalizeNumber(data.speed, 80, 30, 200);
        const health = this.normalizeNumber(data.health, 100, 40, 400);
        const reward = this.normalizeNumber(data.reward, 12, 5, 60);
        const ability = typeof data.ability === 'string' ? data.ability : undefined;
        const color = this.parseColor(data.color, this.theme.enemy);

        return {
          id,
          name,
          speed,
          health,
          reward,
          ability,
          color,
        };
      })
      .filter((enemy): enemy is EnemyDefinition => !!enemy);

    if (!parsed.length) {
      return fallback;
    }

    return new Map(parsed.map((enemy) => [enemy.id, enemy]));
  }

  private extractWaveDefinitions(): WaveDefinition[] {
    const fallback = this.getFallbackWaves();
    const payload = this.gameData.gameData as GeneratedGameData | undefined;

    const mechanics = payload?.mechanics as Record<string, unknown> | undefined;
    const candidate = (mechanics?.waves as unknown) ?? payload?.levels;

    const parsed = this.parseWaves(candidate) ?? fallback;
    return this.normalizeWaveCount(parsed);
  }

  private parseWaves(input: unknown): WaveDefinition[] | null {
    if (!Array.isArray(input)) {
      return null;
    }

    const waves: WaveDefinition[] = input
      .map<WaveDefinition | null>((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const data = item as Record<string, unknown>;
        const name = typeof data.name === 'string' ? data.name : `Волна ${index + 1}`;
        const rewardMultiplier = this.normalizeNumber(data.rewardMultiplier, 1, 0.5, 3);

        const groupsRaw = (data.enemies ?? data.groups) as unknown;
        if (!Array.isArray(groupsRaw)) {
          return null;
        }

        const groups = groupsRaw
          .map((group) => {
            if (!group || typeof group !== 'object') return null;
            const g = group as Record<string, unknown>;
            const enemyId = typeof g.enemyId === 'string' ? g.enemyId : typeof g.id === 'string' ? g.id : undefined;
            if (!enemyId) return null;
            const count = this.normalizeNumber(g.count, 5, 1, 20);
            return { enemyId, count };
          })
          .filter((group): group is { enemyId: string; count: number } => !!group);

        if (!groups.length) {
          return null;
        }

        return {
          name,
          description: typeof data.description === 'string' ? data.description : undefined,
          rewardMultiplier,
          groups,
        };
      })
      .filter((wave): wave is WaveDefinition => !!wave);

    return waves.length ? waves : null;
  }

  private normalizeWaveCount(waves: WaveDefinition[]): WaveDefinition[] {
    if (!waves.length) {
      return waves;
    }

    if (waves.length >= this.requestedWaves) {
      return waves.slice(0, this.requestedWaves);
    }

    const result = [...waves];
    while (result.length < this.requestedWaves) {
      const last = result[result.length - 1];
      result.push({
        ...last,
        name: `${last.name} +`,
        groups: last.groups.map((group) => ({ ...group })),
      });
    }
    return result;
  }

  private ensureCircleTexture(prefix: string, radius: number, color: number): string {
    const key = `${prefix}_${radius}_${color.toString(16)}`;
    if (!this.textures.exists(key)) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false } as Phaser.Types.GameObjects.Graphics.Options);
      graphics.fillStyle(color, 1);
      graphics.fillCircle(radius, radius, radius);
      graphics.generateTexture(key, radius * 2, radius * 2);
      graphics.destroy();
    }
    return key;
  }

  private disableGravity(target?: Phaser.Physics.Arcade.Sprite | Phaser.Physics.Arcade.Image): void {
    const body = target?.body;
    if (body instanceof Phaser.Physics.Arcade.Body) {
      body.setAllowGravity(false);
    }
  }

  private normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
    let numeric: number | null = null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      numeric = value;
    } else if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        numeric = parsed;
      }
    }

    const base = numeric ?? fallback;
    return Phaser.Math.Clamp(base, min, max);
  }

  private parseColor(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const color = Phaser.Display.Color.HexStringToColor(value);
      if (color) {
        return color.color;
      }
    }
    return fallback;
  }

  private getFallbackTowers(): TowerDefinition[] {
    return [
      {
        id: 'rapid',
        name: 'Скоростная турель',
        damage: 8,
        fireRate: 2.2,
        range: 160,
        projectileSpeed: 360,
        effect: 'Быстрая стрельба по легким целям',
        color: 0x4caf50,
      },
      {
        id: 'sniper',
        name: 'Снайперская башня',
        damage: 20,
        fireRate: 0.8,
        range: 260,
        projectileSpeed: 420,
        effect: 'Пробивает броню',
        color: 0xffb347,
      },
      {
        id: 'tesla',
        name: 'Тесла-узел',
        damage: 12,
        fireRate: 1.5,
        range: 190,
        projectileSpeed: 300,
        effect: 'Замедляет противников',
        color: 0x7e57c2,
      },
    ];
  }

  private getFallbackEnemies(): Map<string, EnemyDefinition> {
    const enemies: EnemyDefinition[] = [
      {
        id: 'scout',
        name: 'Быстрый разведчик',
        speed: 120,
        health: 70,
        reward: 10,
        ability: 'ускорение на прямых',
        color: 0xffc048,
      },
      {
        id: 'brute',
        name: 'Бронированный громила',
        speed: 70,
        health: 200,
        reward: 20,
        ability: 'высокая броня',
        color: 0xff5e57,
      },
      {
        id: 'swarm',
        name: 'Рой дронов',
        speed: 90,
        health: 90,
        reward: 14,
        ability: 'движется волнами',
        color: 0x4ecdc4,
      },
    ];
    return new Map(enemies.map((enemy) => [enemy.id, enemy]));
  }

  private getFallbackWaves(): WaveDefinition[] {
    return [
      {
        name: 'Разведка',
        rewardMultiplier: 1,
        groups: [
          { enemyId: 'scout', count: 6 },
          { enemyId: 'swarm', count: 4 },
        ],
      },
      {
        name: 'Натиск',
        rewardMultiplier: 1.2,
        groups: [
          { enemyId: 'scout', count: 4 },
          { enemyId: 'brute', count: 3 },
        ],
      },
      {
        name: 'Комбинированная атака',
        rewardMultiplier: 1.4,
        groups: [
          { enemyId: 'swarm', count: 6 },
          { enemyId: 'brute', count: 4 },
        ],
      },
    ];
  }

  private getDifficultyMultiplier(difficulty: GeneratedGame['difficulty']): number {
    switch (difficulty) {
      case 'easy':
        return 0.9;
      case 'hard':
        return 1.2;
      default:
        return 1;
    }
  }
}

