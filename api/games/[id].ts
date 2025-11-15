import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { GeneratedGame } from '../../src/types';
import { redis } from '../redis.js';

const STORAGE_KEY = 'gamegenerator_games';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid game ID' });
  }

  try {
    if (req.method === 'GET') {
      // Получить игру по ID
      const games = (await redis.get<GeneratedGame[]>(STORAGE_KEY)) || [];
      const game = games.find((g) => g.id === id);
      
      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      return res.status(200).json(game);
    }

    if (req.method === 'PUT') {
      // Обновить игру
      const game = req.body as GeneratedGame;
      if (!game || game.id !== id) {
        return res.status(400).json({ error: 'Invalid game data' });
      }

      const games = (await redis.get<GeneratedGame[]>(STORAGE_KEY)) || [];
      const existingIndex = games.findIndex((g) => g.id === id);

      if (existingIndex < 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      games[existingIndex] = game;
      await redis.set(STORAGE_KEY, games);
      return res.status(200).json(game);
    }

    if (req.method === 'DELETE') {
      // Удалить игру
      const games = (await redis.get<GeneratedGame[]>(STORAGE_KEY)) || [];
      const filtered = games.filter((g) => g.id !== id);

      if (games.length === filtered.length) {
        return res.status(404).json({ error: 'Game not found' });
      }

      await redis.set(STORAGE_KEY, filtered);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

