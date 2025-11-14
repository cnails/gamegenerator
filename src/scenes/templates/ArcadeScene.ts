import { VerticalBaseScene } from './VerticalStandardScene';
import Phaser from 'phaser';

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

  initGame(): void {
    const params = this.gameData.config.params || {};
    const speedParam = Number(params.speed ?? 1);
    const spawnParam = Number(params.enemySpawnRate ?? 1);
    const durationParam = Number(params.duration ?? 90);

    this.gameSpeed = Phaser.Math.Clamp(speedParam, 0.5, 2);
    this.enemySpawnRate = Phaser.Math.Clamp(1800 / this.gameSpeed / (spawnParam || 1), 600, 2600);
    this.timeLeft = Phaser.Math.Clamp(durationParam, 45, 240);
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
    this.startRoundTimer();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanup();
    });
  }

  update(time: number, delta: number): void {
    if (this.gameEnded) return;

    this.updatePlayerMovement(delta);
    this.handleAutoFire(time);
    this.handleEnemySpawns(time);
    this.updateEnemies(delta);
    this.recycleObjects();
    this.updateShieldVisual();
    this.animateBackground(delta);
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

    const starTexture = this.ensureCircleTexture('arcade_star', 2, 0xffffff);
    const emitterConfig: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      y: -10,
      lifespan: 5000,
      speedY: { min: 40, max: 90 },
      quantity: 1,
      frequency: 70,
      scale: { start: 1, end: 0 },
      alpha: { start: 0.5, end: 0 },
    };
    this.starEmitter = this.add.particles({
      x: this.safeBounds.centerX,
      y: -10,
      key: starTexture,
      config: emitterConfig,
    });
    this.starEmitter.setDepth(-1).setScrollFactor(0);
    this.starEmitter.particleX = { min: this.safeBounds.left, max: this.safeBounds.right };
    this.starEmitter.particleY = -10;
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
      this.starEmitter.setPosition(this.safeBounds.centerX, -10);
      this.starEmitter.particleX = { min: this.safeBounds.left, max: this.safeBounds.right };
      this.starEmitter.particleY = -10;
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
    const playerTexture = this.ensureTriangleTexture('player_ship', 46, 46, 0x4caf50);
    this.player = this.physics.add.sprite(this.safeBounds.centerX, this.scale.height - 90, playerTexture);
    this.player.setDepth(2);
    this.player.setCollideWorldBounds(true);
    this.player.setDamping(true);
    this.player.setDragX(0.9);
    this.player.body?.setAllowGravity(false);
    this.player.body?.setSize(24, 32);
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
      .text(this.safeBounds.left + 16, 44, 'Комбо x1.0', {
        fontSize: '18px',
        color: '#4caf50',
        fontFamily: 'Arial',
      })
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
      this.updateScore(150);
      this.finishRound();
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
    bullet.body?.setAllowGravity(false);
    bullet.setVelocityY(-460 * this.gameSpeed);
    bullet.setDepth(1);
  }

  private handleEnemySpawns(time: number): void {
    if (time < this.nextEnemySpawn) return;
    this.spawnEnemy();
    const dynamicDelay = Phaser.Math.Clamp(this.enemySpawnRate - this.spawnAcceleration, 480, 2200);
    this.nextEnemySpawn = time + dynamicDelay;
    this.spawnAcceleration = Math.min(this.spawnAcceleration + 25, this.enemySpawnRate - 480);
  }

  private spawnEnemy(): void {
    const type = Phaser.Utils.Array.GetRandom<EnemyType>(['basic', 'zigzag', 'tank']);
    const x = Phaser.Math.Between(Math.floor(this.safeBounds.left + 30), Math.floor(this.safeBounds.right - 30));
    const enemy = this.enemies.create(x, -40, this.getEnemyTexture(type)) as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(1);
    enemy.body?.setAllowGravity(false);
    enemy.setVelocityY((70 + Phaser.Math.Between(0, 40)) * this.gameSpeed);
    enemy.setData('type', type);
    enemy.setData('hp', type === 'tank' ? 3 : 1);
    enemy.setData('shootDelay', Phaser.Math.Between(900, 1700));
    enemy.setData('nextShot', this.time.now + Phaser.Math.Between(600, 1500));
    enemy.setData('zigzagAmplitude', Phaser.Math.Between(16, 28));
    enemy.setData('zigzagSpeed', Phaser.Math.FloatBetween(0.002, 0.004));
    enemy.setData('zigzagSeed', Math.random() * Math.PI * 2);
    enemy.setData('dropsPowerUp', Phaser.Math.Between(0, 100) < 25);
  }

  private getEnemyTexture(type: EnemyType): string {
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
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return;
      this.updateEnemyBehavior(enemy, delta);
    });
  }

  private updateEnemyBehavior(enemy: Phaser.Physics.Arcade.Sprite, delta: number): void {
    const type = (enemy.getData('type') as EnemyType | undefined) ?? 'basic';
    if (type === 'zigzag') {
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

    const nextShot = enemy.getData('nextShot') as number | undefined;
    const shootDelay = (enemy.getData('shootDelay') as number | undefined) ?? 1200;
    if (nextShot && this.time.now >= nextShot) {
      this.enemyShoot(enemy);
      enemy.setData('nextShot', this.time.now + shootDelay);
    }
  }

  private enemyShoot(enemy: Phaser.Physics.Arcade.Sprite): void {
    const laserTexture = this.ensureRoundedRectTexture('enemy_laser', 6, 22, 0xff6f61, 3);
    const laser = this.enemyLasers.create(enemy.x, enemy.y + 20, laserTexture) as Phaser.Physics.Arcade.Sprite;
    laser.body?.setAllowGravity(false);
    laser.setVelocityY(220 + this.gameSpeed * 60);
    laser.setDepth(1);

    if ((enemy.getData('type') as EnemyType | undefined) === 'tank') {
      const twin = this.enemyLasers.create(enemy.x + 12, enemy.y + 20, laserTexture) as Phaser.Physics.Arcade.Sprite;
      twin.body?.setAllowGravity(false);
      twin.setVelocity(120, 260 + this.gameSpeed * 60);
    }
  }

  private recycleObjects(): void {
    this.bullets.children.each((child) => {
      const bullet = child as Phaser.Physics.Arcade.Sprite;
      if (bullet.y < -40) {
        bullet.destroy();
      }
    });

    this.enemyLasers.children.each((child) => {
      const laser = child as Phaser.Physics.Arcade.Sprite;
      if (laser.y > this.scale.height + 40) {
        laser.destroy();
      }
    });

    this.powerUps.children.each((child) => {
      const power = child as Phaser.Physics.Arcade.Sprite;
      if (power.y > this.scale.height + 40) {
        power.destroy();
      }
    });
  }

  private onBulletHitsEnemy(
    bullet: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(bullet instanceof Phaser.Physics.Arcade.Sprite) || !(enemy instanceof Phaser.Physics.Arcade.Sprite)) {
      return;
    }

    bullet.destroy();
    let hp = (enemy.getData('hp') as number | undefined) ?? 1;
    hp -= 1;
    if (hp <= 0) {
      const dropsPowerUp = Boolean(enemy.getData('dropsPowerUp'));
      this.updateScore(Math.round(25 * this.comboMultiplier));
      this.registerComboHit();
      const { x, y } = enemy;
      enemy.destroy();
      if (dropsPowerUp) {
        this.maybeDropPowerUp(x, y);
      }
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

  private collectPowerUp(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    powerUp: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(powerUp instanceof Phaser.Physics.Arcade.Sprite)) return;
    const type = (powerUp.getData('type') as PowerUpType | undefined) ?? 'shield';
    powerUp.destroy();
    switch (type) {
      case 'rapid':
        this.rapidFireUntil = this.time.now + 6000;
        break;
      case 'spread':
        this.spreadShotUntil = this.time.now + 6000;
        break;
      default:
        this.activateShield(6000);
        break;
    }
  }

  private maybeDropPowerUp(x: number, y: number): void {
    const types: PowerUpType[] = ['shield', 'rapid', 'spread'];
    const type = Phaser.Utils.Array.GetRandom(types);
    const texture = this.ensureCircleTexture(`power_${type}`, 10, this.getPowerUpColor(type));
    const power = this.powerUps.create(x, y, texture) as Phaser.Physics.Arcade.Sprite;
    power.body?.setAllowGravity(false);
    power.setVelocityY(50);
    power.setData('type', type);
    power.setDepth(1);
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
      delay: 2000,
      callback: () => {
        this.comboMultiplier = 1;
        this.updateComboText();
      },
    });
  }

  private updateComboText(): void {
    if (this.comboText) {
      this.comboText.setText(`Комбо x${this.comboMultiplier.toFixed(1)}`);
    }
  }

  private ensureTriangleTexture(key: string, width: number, height: number, color: number): string {
    const textureKey = `${key}_${width}x${height}_${color.toString(16)}`;
    if (!this.textures.exists(textureKey)) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
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
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
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
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
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
    this.starEmitter?.destroy();
    this.starEmitter = undefined;
  }
}

