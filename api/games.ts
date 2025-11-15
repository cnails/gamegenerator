import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { GeneratedGame } from '../src/types';
import { redis } from './redis.js';

const STORAGE_KEY = 'gamegenerator_games';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Получить список всех игр
      const games = await redis.get<GeneratedGame[]>(STORAGE_KEY);
      return res.status(200).json(games || []);
    }

    if (req.method === 'POST') {
      // Создать или обновить игру
      const game = req.body as GeneratedGame;
      if (!game || !game.id) {
        return res.status(400).json({ error: 'Invalid game data' });
      }

      const games = (await redis.get<GeneratedGame[]>(STORAGE_KEY)) || [];
      const existingIndex = games.findIndex((g) => g.id === game.id);

      if (existingIndex >= 0) {
        games[existingIndex] = game;
      } else {
        games.push(game);
      }

      await redis.set(STORAGE_KEY, games);
      return res.status(200).json(game);
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

