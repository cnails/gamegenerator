import Phaser from 'phaser';
import type { GeneratedGame, ScoreSystem } from '@/types';
import { GameTemplate } from '@/types';
import { BaseGameScene } from '@/scenes/BaseGameScene';
import { PlatformerScene } from '@/scenes/templates/PlatformerScene';
import { ArcadeScene } from '@/scenes/templates/ArcadeScene';
import { PuzzleScene } from '@/scenes/templates/PuzzleScene';
import { TowerDefenseScene } from '@/scenes/templates/TowerDefenseScene';
import { VerticalStandardScene } from '@/scenes/templates/VerticalStandardScene';
import { RoguelikeScene } from '@/scenes/templates/RoguelikeScene';

export class GameManager {
  private phaserGame: Phaser.Game | null = null;
  private currentGame: GeneratedGame | null = null;
  private scoreSystem: ScoreSystem = {
    currentScore: 0,
    highScore: 0,
    rewards: 0,
    multiplier: 1,
  };

  private onGameEndCallback?: (score: number, rewards: number) => void;

  constructor() {
    // Инициализация при необходимости
  }

  setOnGameEnd(callback: (score: number, rewards: number) => void): void {
    this.onGameEndCallback = callback;
  }

  async startGame(game: GeneratedGame, containerId: string = 'app'): Promise<void> {
    this.currentGame = game;
    this.scoreSystem.currentScore = 0;
    this.scoreSystem.multiplier = 1;

    if (this.phaserGame) {
      this.phaserGame.destroy(true);
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      parent: containerId,
      backgroundColor: '#1a1a2e',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 300 },
          debug: false,
        },
      },
      scene: [],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    this.phaserGame = new Phaser.Game(config);

    const sceneKey = 'game';
    const sceneClass = this.getSceneClassForTemplate(game.template);
    this.phaserGame.scene.add(sceneKey, sceneClass, false);
    this.phaserGame.scene.start(sceneKey, { gameData: game });

    this.phaserGame.events.once(Phaser.Core.Events.READY, () => {
      const activeScene = this.phaserGame?.scene.getScene(sceneKey) as BaseGameScene | undefined;
      if (!activeScene) {
        return;
      }

      activeScene.events.once('gameEnd', (score: number) => {
        this.scoreSystem.currentScore = score;
        this.endGame();
      });
    });
  }

  private getSceneClassForTemplate(template: GameTemplate): typeof BaseGameScene {
    switch (template) {
      case GameTemplate.PLATFORMER:
        return PlatformerScene;
      case GameTemplate.ARCADE:
        return ArcadeScene;
      case GameTemplate.PUZZLE:
        return PuzzleScene;
      case GameTemplate.TOWER_DEFENSE:
        return TowerDefenseScene;
      case GameTemplate.VERTICAL_STANDARD:
        return VerticalStandardScene;
      case GameTemplate.ROGUELIKE:
        return RoguelikeScene;
      default:
        throw new Error(`Unknown template: ${template}`);
    }
  }

  updateScore(points: number): void {
    this.scoreSystem.currentScore += points * this.scoreSystem.multiplier;
  }

  getCurrentScore(): number {
    return this.scoreSystem.currentScore;
  }

  endGame(): void {
    const finalScore = this.scoreSystem.currentScore;
    const rewards = Math.floor(finalScore / 100);

    if (finalScore > this.scoreSystem.highScore) {
      this.scoreSystem.highScore = finalScore;
    }

    this.scoreSystem.rewards += rewards;

    if (this.phaserGame) {
      this.phaserGame.destroy(true);
      this.phaserGame = null;
    }

    if (this.onGameEndCallback) {
      this.onGameEndCallback(finalScore, rewards);
    }
  }

  getScoreSystem(): ScoreSystem {
    return { ...this.scoreSystem };
  }

  destroy(): void {
    if (this.phaserGame) {
      this.phaserGame.destroy(true);
      this.phaserGame = null;
    }
  }
}
