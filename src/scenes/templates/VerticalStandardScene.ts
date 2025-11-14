import Phaser from 'phaser';
import { BaseGameScene } from '../BaseGameScene';

export interface VerticalLayoutOptions {
  targetAspect?: number;
  minSafeWidth?: number;
  maxSafeWidth?: number;
  paddingX?: number;
  paddingY?: number;
  enablePointer?: boolean;
  extraPointers?: number;
}

const DEFAULT_LAYOUT_OPTIONS: Required<VerticalLayoutOptions> = {
  targetAspect: 9 / 16,
  minSafeWidth: 360,
  maxSafeWidth: 520,
  paddingX: 0.06,
  paddingY: 0.08,
  enablePointer: false,
  extraPointers: 0,
};

export abstract class VerticalBaseScene extends BaseGameScene {
  protected safeBounds!: Phaser.Geom.Rectangle;
  protected playBounds!: Phaser.Geom.Rectangle;

  private layoutOptions: Required<VerticalLayoutOptions> = DEFAULT_LAYOUT_OPTIONS;
  private layoutInitialized: boolean = false;
  private pointerRegistered: boolean = false;

  protected initVerticalLayout(options: Partial<VerticalLayoutOptions> = {}): void {
    if (this.layoutInitialized) {
      console.warn('[VerticalBaseScene] Layout already initialized');
      return;
    }

    this.layoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
    this.layoutInitialized = true;

    this.recalculateBounds(this.scale.width, this.scale.height);

    if (this.layoutOptions.enablePointer) {
      const additionalPointers = Math.max(0, this.layoutOptions.extraPointers);
      if (additionalPointers > 0) {
        this.input.addPointer(additionalPointers);
      }
      this.pointerRegistered = true;
      this.input.on('pointerdown', this.handlePointerDown, this);
      this.input.on('pointermove', this.handlePointerMove, this);
      this.input.on('pointerup', this.handlePointerUp, this);
      this.input.on('pointerupoutside', this.handlePointerUp, this);
      this.input.on('pointerout', this.handlePointerUp, this);
    }

    this.scale.on('resize', this.onLayoutResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyVerticalLayout());
  }

  protected destroyVerticalLayout(): void {
    if (!this.layoutInitialized) return;
    this.layoutInitialized = false;

    this.scale.off('resize', this.onLayoutResize, this);
    if (this.pointerRegistered) {
      this.input.off('pointerdown', this.handlePointerDown, this);
      this.input.off('pointermove', this.handlePointerMove, this);
      this.input.off('pointerup', this.handlePointerUp, this);
      this.input.off('pointerupoutside', this.handlePointerUp, this);
      this.input.off('pointerout', this.handlePointerUp, this);
      this.pointerRegistered = false;
    }
  }

  protected onSafeAreaChanged(_safe: Phaser.Geom.Rectangle, _play: Phaser.Geom.Rectangle): void {
    // Дочерние сцены могут переопределить для реагирования на resize
  }

  protected onPointerDown(_pointer: Phaser.Input.Pointer): void {
    // Переопределяется дочерними сценами при необходимости
  }

  protected onPointerMove(_pointer: Phaser.Input.Pointer): void {
    // Переопределяется дочерними сценами при необходимости
  }

  protected onPointerUp(_pointer: Phaser.Input.Pointer): void {
    // Переопределяется дочерними сценами при необходимости
  }

  protected clampXWithinSafeArea(value: number, padding: number = 0): number {
    return Phaser.Math.Clamp(value, this.safeBounds.left + padding, this.safeBounds.right - padding);
  }

  protected clampYWithinSafeArea(value: number, padding: number = 0): number {
    return Phaser.Math.Clamp(value, this.safeBounds.top + padding, this.safeBounds.bottom - padding);
  }

  protected getSafeBounds(): Phaser.Geom.Rectangle {
    return Phaser.Geom.Rectangle.Clone(this.safeBounds);
  }

  protected getPlayableBounds(): Phaser.Geom.Rectangle {
    return Phaser.Geom.Rectangle.Clone(this.playBounds);
  }

  private onLayoutResize(gameSize: Phaser.Structs.Size): void {
    this.recalculateBounds(gameSize.width, gameSize.height);
  }

  private recalculateBounds(width: number, height: number): void {
    this.safeBounds = this.computeSafeBounds(width, height);
    this.playBounds = this.computePlayBounds(this.safeBounds);
    this.applyHudLayout();
    this.onSafeAreaChanged(
      Phaser.Geom.Rectangle.Clone(this.safeBounds),
      Phaser.Geom.Rectangle.Clone(this.playBounds),
    );
  }

  private computeSafeBounds(width: number, height: number): Phaser.Geom.Rectangle {
    const currentAspect = width / height;
    const desiredAspect = this.layoutOptions.targetAspect;

    if (currentAspect >= desiredAspect) {
      const safeWidth = height * desiredAspect;
      const clampedWidth = Phaser.Math.Clamp(safeWidth, this.layoutOptions.minSafeWidth, this.layoutOptions.maxSafeWidth);
      const offsetX = (width - clampedWidth) / 2;
      return new Phaser.Geom.Rectangle(offsetX, 0, clampedWidth, height);
    }

    const safeHeight = width / desiredAspect;
    const offsetY = (height - safeHeight) / 2;
    return new Phaser.Geom.Rectangle(0, offsetY, width, safeHeight);
  }

  private computePlayBounds(safeBounds: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    const padX = safeBounds.width * this.layoutOptions.paddingX;
    const padY = safeBounds.height * this.layoutOptions.paddingY;
    return new Phaser.Geom.Rectangle(
      safeBounds.left + padX,
      safeBounds.top + padY,
      safeBounds.width - padX * 2,
      safeBounds.height - padY * 2,
    );
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.onPointerDown(pointer);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.onPointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.onPointerUp(pointer);
  }

  private applyHudLayout(): void {
    if (this.scoreText) {
      this.scoreText.setPosition(this.safeBounds.left + 16, this.safeBounds.top + 16);
    }
  }
}

export class VerticalStandardScene extends VerticalBaseScene {
  protected initGame(): void {
    this.initVerticalLayout({ enablePointer: true, extraPointers: 1 });

    const play = this.getPlayableBounds();
    this.add
      .rectangle(play.centerX, play.centerY, play.width, play.height, 0x0d111c, 0.85)
      .setDepth(-1)
      .setStrokeStyle(2, 0x1f2b44, 0.8);

    const label = this.add.text(
      play.centerX,
      play.centerY,
      'Vertical Template Ready\nДобавьте игровую механику',
      {
        fontSize: '26px',
        color: '#ffffff',
        align: 'center',
        fontFamily: 'Arial',
      },
    );
    label.setOrigin(0.5);
  }

  private registerCollisions(): void {
    this.physics.add.overlap(
      this.player,
      this.obstacles,
      this.onPlayerHitsObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.collectibles,
      this.onPlayerCollects as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.onPlayerHitsObstacle as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.enemyProjectiles,
      this.onPlayerHitsEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );
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
    this.timerText?.setText(this.formatTime(this.timeLeft));
    this.updateProgressBar();

    if (this.timeLeft === 0) {
      this.finishRound(true);
    }
  }

  private updatePlayerMovement(delta: number): void {
    const clampX = (value: number) => this.clampToPlayBoundsX(value);
    const smoothing = delta / 220;

    if (this.pointerTargetX !== undefined) {
      this.player.x = Phaser.Math.Linear(this.player.x, this.pointerTargetX, Phaser.Math.Clamp(smoothing, 0.08, 0.24));
    } else if (this.cursors) {
      const horizontal =
        (this.cursors.left?.isDown ? -1 : 0) + (this.cursors.right?.isDown ? 1 : 0);
      if (horizontal !== 0) {
        const speed = (280 * delta) / 1000;
        this.player.x = clampX(this.player.x + horizontal * speed);
      }
    }

    this.player.x = clampX(this.player.x);
  }

  private handleSpawns(time: number): void {
    if (time >= this.nextObstacleAt) {
      this.spawnObstaclePattern();
      this.nextObstacleAt = time + Phaser.Math.Between(900, 1400) / this.spawnDensity;
    }

    if (time >= this.nextCollectibleAt) {
      this.spawnCollectibleCluster();
      this.nextCollectibleAt = time + Phaser.Math.Between(1200, 2200) / this.spawnDensity;
    }

    if (time >= this.nextEnemyAt) {
      this.spawnEnemy();
      this.nextEnemyAt = time + Phaser.Math.Between(1800, 2600) / this.spawnDensity;
    }
  }

  private spawnObstaclePattern(): void {
    const color = this.palette[2] ?? 0x1f3b63;
    const patternType = Phaser.Math.Between(0, 2);

    if (patternType === 0) {
      const width = Phaser.Math.Between(60, 140);
      const height = Phaser.Math.Between(40, 90);
      const x = this.randomXPosition(width);
      this.createObstacle(x, width, height, color);
    } else if (patternType === 1) {
      const width = Phaser.Math.Between(50, 100);
      const height = Phaser.Math.Between(50, 90);
      const gap = Phaser.Math.Between(100, 160);
      const center = Phaser.Math.Between(
        Math.floor(this.playBounds.left + gap / 2 + 40),
        Math.floor(this.playBounds.right - gap / 2 - 40),
      );
      const leftX = this.clampXForWidth(center - gap / 2 - width / 2, width);
      const rightX = this.clampXForWidth(center + gap / 2 + width / 2, width);
      this.createObstacle(leftX, width, height, color);
      this.createObstacle(rightX, width, height, color);
    } else {
      const width = Phaser.Math.Between(45, 75);
      const height = Phaser.Math.Between(60, 100);
      const baseX = this.randomXPosition(width);
      for (let i = 0; i < 3; i++) {
        const offsetX = this.clampXForWidth(baseX + (i - 1) * 70, width);
        this.createObstacle(offsetX, width, height, color, i * 40);
      }
    }
  }

  private createObstacle(x: number, width: number, height: number, color: number, offsetY: number = 0): void {
    const texture = this.ensureRoundedRectTexture('vertical_obstacle', width, height, color, 16);
    const sprite = this.obstacles.create(x, this.playBounds.top - height / 2 - offsetY, texture) as Phaser.Physics.Arcade.Sprite;
    sprite.setDepth(1);
    sprite.body?.setAllowGravity(false);
    sprite.setVelocityY(this.worldSpeed * Phaser.Math.FloatBetween(0.9, 1.15));
    sprite.setImmovable(true);
    sprite.setData('damage', 1);
  }

  private spawnCollectibleCluster(): void {
    const count = Phaser.Math.Between(3, 5);
    const spacing = 28;
    const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    const startX = Phaser.Math.Between(Math.floor(this.playBounds.left + 60), Math.floor(this.playBounds.right - 60));

    for (let i = 0; i < count; i++) {
      const texture = this.ensureDiamondTexture('vertical_collectible', 10, 0xffd452);
      const offsetX = Phaser.Math.Clamp(startX + i * spacing * direction, this.playBounds.left + 24, this.playBounds.right - 24);
      const collectible = this.collectibles.create(offsetX, this.playBounds.top - i * 24, texture) as Phaser.Physics.Arcade.Sprite;
      collectible.setDepth(1);
      collectible.body?.setAllowGravity(false);
      collectible.setVelocityY(this.worldSpeed * 0.85);
      collectible.setData('value', 15);
    }
  }

  private spawnEnemy(): void {
    const texture = this.ensureCapsuleTexture('vertical_enemy', 28, 36, 0xff7043, 12);
    const x = Phaser.Math.Between(Math.floor(this.playBounds.left + 50), Math.floor(this.playBounds.right - 50));
    const enemy = this.enemies.create(x, this.playBounds.top - 70, texture) as Phaser.Physics.Arcade.Sprite;
    enemy.setDepth(1);
    enemy.body?.setAllowGravity(false);
    enemy.setVelocityY(this.worldSpeed * 0.65);
    enemy.setData('hp', 2);
    enemy.setData('baseX', x);
    enemy.setData('nextShot', this.time.now + Phaser.Math.Between(700, 1400));
    enemy.setData('driftAmplitude', Phaser.Math.Between(10, 26));
    enemy.setData('driftSpeed', Phaser.Math.FloatBetween(0.0015, 0.0035));
    enemy.setData('driftSeed', Math.random() * Math.PI * 2);
  }

  private updateEnemiesBehavior(time: number): void {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return;
      const amplitude = (enemy.getData('driftAmplitude') as number | undefined) ?? 0;
      if (amplitude > 0) {
        const baseX = (enemy.getData('baseX') as number | undefined) ?? enemy.x;
        const driftSpeed = (enemy.getData('driftSpeed') as number | undefined) ?? 0.002;
        const seed = (enemy.getData('driftSeed') as number | undefined) ?? 0;
        const offset = Math.sin(this.time.now * driftSpeed + seed) * amplitude;
        enemy.x = this.clampToPlayBoundsX(baseX + offset);
      }
      const nextShot = enemy.getData('nextShot') as number | undefined;
      if (nextShot && time >= nextShot) {
        this.enemyShoot(enemy);
        enemy.setData('nextShot', time + Phaser.Math.Between(1200, 2000));
      }
    });
  }

  private enemyShoot(enemy: Phaser.Physics.Arcade.Sprite): void {
    const texture = this.ensureRoundedRectTexture('vertical_enemy_bullet', 6, 16, 0xffab91, 3);
    const projectile = this.enemyProjectiles.create(enemy.x, enemy.y + 20, texture) as Phaser.Physics.Arcade.Sprite;
    projectile.body?.setAllowGravity(false);
    projectile.setVelocityY(this.worldSpeed * 1.4);
    projectile.setDepth(1);
  }

  private cleanupOutOfBounds(): void {
    const minX = this.playBounds.left - 120;
    const maxX = this.playBounds.right + 120;
    const minY = this.playBounds.top - 200;
    const maxY = this.playBounds.bottom + 200;
    [this.obstacles, this.collectibles, this.enemies, this.enemyProjectiles].forEach((group) => {
      group.children.each((child) => {
        const sprite = child as Phaser.Physics.Arcade.Sprite;
        if (sprite.x < minX || sprite.x > maxX || sprite.y < minY || sprite.y > maxY) {
          sprite.destroy();
        }
      });
    });
  }

  private onPlayerHitsObstacle(
    player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    hazard: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(player instanceof Phaser.Physics.Arcade.Sprite) || !(hazard instanceof Phaser.Physics.Arcade.Sprite)) return;
    hazard.destroy();
    this.applyDamage(1);
  }

  private onPlayerCollects(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    collectible: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(collectible instanceof Phaser.Physics.Arcade.Sprite)) return;
    const value = (collectible.getData('value') as number | undefined) ?? 10;
    this.updateScore(value);
    this.timeLeft = Phaser.Math.Clamp(this.timeLeft + 1, 0, this.roundDuration);
    this.timerText?.setText(this.formatTime(this.timeLeft));
    this.updateProgressBar();
    collectible.destroy();
  }

  private onPlayerHitsEnemy(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    projectile: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(projectile instanceof Phaser.Physics.Arcade.Sprite)) return;
    projectile.destroy();
    this.applyDamage(1);
  }

  private applyDamage(amount: number): void {
    if (this.gameEnded) return;
    if (this.time.now < this.damageCooldownUntil) return;

    this.damageCooldownUntil = this.time.now + 600;
    this.health = Math.max(0, this.health - amount);
    this.updateHealthText();
    this.cameras.main.shake(180, 0.004);
    this.player.setTintFill(0xff9e80);
    this.time.delayedCall(150, () => this.player.clearTint());

    if (this.health <= 0) {
      this.finishRound(false);
    }
  }

  private finishRound(success: boolean): void {
    if (this.gameEnded) return;
    this.gameEnded = true;
    this.cleanup();
    if (success) {
      this.updateScore(200);
    }
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

  private updateProgressBar(): void {
    if (!this.progressFill) return;

    const progress = Phaser.Math.Clamp(this.timeLeft / this.roundDuration, 0, 1);
    const width = this.playBounds.width - 140 - 4;
    const height = 8;
    const x = this.playBounds.left + 72;
    const y = this.playBounds.bottom - 30;

    this.progressFill.clear();
    this.progressFill.fillStyle(0x4caf50);
    this.progressFill.fillRoundedRect(x, y, width * progress, height, 6);
  }

  private animateBackground(delta: number): void {
    const drift = (this.worldSpeed * delta) / 6000;
    if (this.parallaxStripe) {
      this.parallaxStripe.tilePositionY += drift * 60;
    }

    this.backgroundLayers.forEach((layer, index) => {
      if (index === 0) return;
      const offset = Math.sin(this.time.now * 0.0003 + index) * 0.5;
      layer.rotation = offset * 0.01;
    });
  }

  private clampToPlayBoundsX(value: number): number {
    return Phaser.Math.Clamp(value, this.playBounds.left + 32, this.playBounds.right - 32);
  }

  private clampToPlayBoundsY(value: number): number {
    return Phaser.Math.Clamp(value, this.playBounds.top + 32, this.playBounds.bottom - 32);
  }

  private randomXPosition(width: number): number {
    const min = this.playBounds.left + width / 2 + 20;
    const max = this.playBounds.right - width / 2 - 20;
    return Phaser.Math.Between(Math.floor(min), Math.floor(max));
  }

  private clampXForWidth(x: number, width: number): number {
    const min = this.playBounds.left + width / 2 + 20;
    const max = this.playBounds.right - width / 2 - 20;
    return Phaser.Math.Clamp(x, min, max);
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  }

  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.safeViewport = this.computeSafeViewport(gameSize.width, gameSize.height);
    this.playBounds = this.computePlayBounds();
    this.physics.world.setBounds(
      this.playBounds.left,
      this.playBounds.top,
      this.playBounds.width,
      this.playBounds.height,
    );
    this.layoutBackground();
    this.refreshHudPositions();
    this.player.x = this.clampToPlayBoundsX(this.player.x);
    this.player.y = this.clampToPlayBoundsY(this.player.y);
  }

  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;

    this.scale.off('resize', this.handleResize, this);
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.off('pointermove', this.handlePointerMove, this);
    this.input.off('pointerup', this.handlePointerUp, this);
    this.input.off('pointerupoutside', this.handlePointerUp, this);
    this.timerEvent?.remove(false);
    this.playerTrail?.destroy();
    this.playerTrail = undefined;
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

  private ensureCapsuleTexture(key: string, width: number, height: number, color: number, radius: number): string {
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

  private ensureDiamondTexture(key: string, half: number, color: number): string {
    const textureKey = `${key}_${half}_${color.toString(16)}`;
    if (!this.textures.exists(textureKey)) {
      const size = half * 2;
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(color, 1);
      graphics.beginPath();
      graphics.moveTo(half, 0);
      graphics.lineTo(size, half);
      graphics.lineTo(half, size);
      graphics.lineTo(0, half);
      graphics.closePath();
      graphics.fillPath();
      graphics.generateTexture(textureKey, size, size);
      graphics.destroy();
    }
    return textureKey;
  }

  private ensureStripeTexture(key: string, stripeWidth: number, length: number, colorA: number, colorB: number): string {
    const textureKey = `${key}_${stripeWidth}_${length}_${colorA.toString(16)}_${colorB.toString(16)}`;
    if (!this.textures.exists(textureKey)) {
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(colorA, 1);
      graphics.fillRect(0, 0, length, stripeWidth);
      graphics.fillStyle(colorB, 1);
      graphics.fillRect(0, stripeWidth, length, stripeWidth);
      graphics.generateTexture(textureKey, length, stripeWidth * 2);
      graphics.destroy();
    }
    return textureKey;
  }
}


