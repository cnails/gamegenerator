import Redis from 'ioredis';

// Инициализация Redis клиента
// В production используем переменные окружения из Vercel
// В development можно использовать локальные переменные
const redisUrl = process.env.REDIS_URL || '';

let redisClient: Redis | null = null;

// Функция для получения экземпляра Redis
function getRedisClient(): Redis {
  if (!redisClient) {
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
  }
  
  return redisClient;
}

// Экспорт для обратной совместимости
export const redis = {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();
    const data = await client.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },
  
  async set(key: string, value: unknown): Promise<void> {
    const client = getRedisClient();
    await client.set(key, JSON.stringify(value));
  },
};

