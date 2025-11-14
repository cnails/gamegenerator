import Phaser from 'phaser';
import type { GeneratedGame, GeneratedGameData, GameVisualSettings } from '@/types';

export abstract class BaseGameScene extends Phaser.Scene {
  protected gameData!: GeneratedGame;
  protected score: number = 0;
  protected scoreText!: Phaser.GameObjects.Text;
  protected gameEnded: boolean = false;
  private endEventDispatched: boolean = false;

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

    this.cameras.main.setBackgroundColor(this.getVisualBackground());

    // Вызываем метод инициализации конкретной игры
    this.initGame();
  }

  protected abstract initGame(): void;

  protected updateScore(points: number): void {
    this.score += points;
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

