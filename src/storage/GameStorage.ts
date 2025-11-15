import type { GeneratedGame } from '@/types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export class GameStorage {
  static async saveGame(game: GeneratedGame): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/games`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(game),
      });

      if (!response.ok) {
        throw new Error(`Failed to save game: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error saving game:', error);
      throw error;
    }
  }

  static async getAllGames(): Promise<GeneratedGame[]> {
    try {
      const response = await fetch(`${API_BASE}/games`);
      if (!response.ok) {
        throw new Error(`Failed to fetch games: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching games:', error);
      return [];
    }
  }

  static async getGame(id: string): Promise<GeneratedGame | null> {
    try {
      const response = await fetch(`${API_BASE}/games/${id}`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch game: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching game:', error);
      return null;
    }
  }

  static async deleteGame(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/games/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete game: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting game:', error);
      throw error;
    }
  }

  static async updateGameScore(id: string, score: number): Promise<void> {
    const game = await this.getGame(id);
    if (!game) return;

    if (score > game.highScore) {
      game.highScore = score;
    }
    game.score = score;

    await this.saveGame(game);
  }

  static async getTotalRewards(): Promise<number> {
    const games = await this.getAllGames();
    return games.reduce((sum, game) => sum + game.rewards, 0);
  }
}

