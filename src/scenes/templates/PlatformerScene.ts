import { BaseGameScene } from '../BaseGameScene';
import Phaser from 'phaser';

export class PlatformerScene extends BaseGameScene {
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

  initGame(): void {
    this.applyVisualTheme();
    const config = this.gameData.config;
    this.gameSpeed = (config.params.speed as number) || 1;

    const viewportWidth = Math.max(this.scale.width, 320);
    const viewportHeight = Math.max(this.scale.height, 560);
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
    const palette = this.getVisualColors(this.defaultPalette);
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
      const graphics = this.make.graphics({ x: 0, y: 0, add: false });
      graphics.fillStyle(color, 1);
      graphics.fillRoundedRect(0, 0, width, height, Math.min(16, height / 2));
      graphics.generateTexture(key, width, height);
      graphics.destroy();
    }
    return key;
  }

  private createPlayer(x: number, y: number): void {
    const textureKey = this.ensureTexture('player', 36, 36, this.theme.player);
    this.player = this.physics.add.sprite(x, y, textureKey);
    this.player.setBounce(0.2);
    this.player.setCollideWorldBounds(true);
    this.player.setSize(28, 32);
    this.player.setOffset((this.player.width - 28) / 2, (this.player.height - 32) / 2);
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
    const starCount = 18;
    for (let i = 0; i < starCount; i++) {
      const x = Phaser.Math.Between(40, width - 40);
      const y = worldHeight - (i * (worldHeight / starCount)) - 80;
      const textureKey = this.ensureTexture('star', 18, 18, this.theme.star);
      const star = this.stars.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
      star.setCircle(9);
      star.setBounceY(Phaser.Math.FloatBetween(0.2, 0.5));
    }
  }

  private createEnemies(worldHeight: number, width: number): void {
    const enemyCount = 4 + Math.floor(this.gameSpeed * 2);
    const textureKey = this.ensureTexture('enemy', 28, 28, this.theme.enemy);
    for (let i = 0; i < enemyCount; i++) {
      const x = Phaser.Math.Between(40, width - 40);
      const y = worldHeight - Phaser.Math.Between(200, worldHeight - 200);
      const enemy = this.enemies.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
      enemy.setBounce(1, 0);
      enemy.setCollideWorldBounds(true);
      enemy.setVelocityX(Phaser.Math.Between(-80, 80));
    }
  }

  private spawnHazards(worldHeight: number, width: number): void {
    const hazardWidth = 40;
    const hazardHeight = 16;
    const textureKey = this.ensureTexture('hazard', hazardWidth, hazardHeight, this.theme.hazard);
    const hazardCount = 4;

    for (let i = 0; i < hazardCount; i++) {
      const x = (i + 1) * (width / (hazardCount + 1));
      const y = worldHeight - Phaser.Math.Between(40, 140);
      const hazard = this.hazards.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
      hazard.refreshBody();
    }
  }

  private spawnFallingObstacles(width: number): void {
    const textureKey = this.ensureTexture('obstacle', 20, 40, this.theme.obstacle);
    this.time.addEvent({
      delay: Phaser.Math.Between(3000, 4500),
      loop: true,
      callback: () => {
        if (this.gameEnded) return;
        const x = Phaser.Math.Between(30, width - 30);
        const obstacle = this.obstacles.create(x, this.cameras.main.worldView.y - 50, textureKey) as Phaser.Physics.Arcade.Sprite;
        obstacle.setVelocityY(120 + this.gameSpeed * 40);
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
      .text(padding, padding, 'Комбо x1', {
        fontSize: '18px',
        color: comboColor,
        fontFamily: 'Arial',
      })
      .setScrollFactor(0);
  }

  private startLevelTimer(): void {
    const configDuration = Number(this.gameData.config.params.duration);
    this.timeLeft = Number.isFinite(configDuration) && configDuration > 0 ? configDuration : 120;
    this.timerEvent?.remove(false);
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.timeLeft -= 1;
        this.timerText.setText(this.formatTime(Math.max(this.timeLeft, 0)));
        if (this.timeLeft <= 0) {
          this.timerEvent?.remove(false);
          this.showGameOver(this.score);
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

  private hitHazard(): void {
    this.showGameOver(this.score);
  }

  private collectStar(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    star: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    if (!(star instanceof Phaser.Physics.Arcade.Sprite)) return;
    star.disableBody(true, true);

    this.collectedStars += 1;
    this.comboMultiplier = Math.min(this.comboMultiplier + 0.2, 3);
    this.updateScore(Math.floor(12 * this.comboMultiplier));
    this.updateComboText();
    this.refreshComboTimer();

    if (this.stars.countActive(true) === 0) {
      this.updateScore(150);
      this.showGameOver(this.score);
    }
  }

  private hitEnemy(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _enemy: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ): void {
    this.showGameOver(this.score);
  }

  protected endGame(force: boolean = false): void {
    this.timerEvent?.remove(false);
    this.comboResetEvent?.remove(false);
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
    if (moveLeft) {
      this.player.setVelocityX(-180 * this.gameSpeed);
    } else if (moveRight) {
      this.player.setVelocityX(180 * this.gameSpeed);
    } else {
      this.player.setVelocityX(0);
    }

    // Актуализируем параллакс
    this.parallaxLayers.forEach((layer, index) => {
      layer.y = this.cameras.main.scrollY * (0.1 * (index + 1));
    });

    // Очищаем препятствия за пределами экрана
    this.obstacles.children.each((obstacle) => {
      const sprite = obstacle as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > this.cameras.main.scrollY + this.scale.height + 80) {
        sprite.destroy();
      }
    });
  }
}

