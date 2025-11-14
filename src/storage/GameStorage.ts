import type { GeneratedGame } from '@/types';

const STORAGE_KEY = 'gamegenerator_games';
const STORAGE_SCORES_KEY = 'gamegenerator_scores';

export class GameStorage {
  static saveGame(game: GeneratedGame): void {
    const games = this.getAllGames();
    const existingIndex = games.findIndex((g) => g.id === game.id);

    if (existingIndex >= 0) {
      games[existingIndex] = game;
    } else {
      games.push(game);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  }

  static getAllGames(): GeneratedGame[] {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static getGame(id: string): GeneratedGame | null {
    const games = this.getAllGames();
    return games.find((g) => g.id === id) || null;
  }

  static deleteGame(id: string): void {
    const games = this.getAllGames();
    const filtered = games.filter((g) => g.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  static updateGameScore(id: string, score: number): void {
    const game = this.getGame(id);
    if (!game) return;

    if (score > game.highScore) {
      game.highScore = score;
    }
    game.score = score;

    this.saveGame(game);
  }

  static getTotalRewards(): number {
    const games = this.getAllGames();
    return games.reduce((sum, game) => sum + game.rewards, 0);
  }
}

