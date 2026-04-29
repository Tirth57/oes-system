const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

const createRedisClient = () => {
  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.error('Redis connection failed after 10 attempts');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    lazyConnect: true,
    enableReadyCheck: true,
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.warn('Redis error (non-critical):', err.message));
  client.on('ready', () => logger.info('Redis ready'));

  return client;
};

const getRedis = () => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

// Cache helpers
const cache = {
  async get(key) {
    try {
      const val = await getRedis().get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async set(key, value, ttlSeconds = 300) {
    try {
      await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
    } catch { /* non-critical */ }
  },

  async del(key) {
    try {
      await getRedis().del(key);
    } catch { /* non-critical */ }
  },

  async delPattern(pattern) {
    try {
      const keys = await getRedis().keys(pattern);
      if (keys.length > 0) await getRedis().del(...keys);
    } catch { /* non-critical */ }
  },

  async increment(key, ttlSeconds = 900) {
    try {
      const val = await getRedis().incr(key);
      if (val === 1) await getRedis().expire(key, ttlSeconds);
      return val;
    } catch { return 0; }
  },

  async setSession(sessionId, data, ttlSeconds = 1800) {
    try {
      await getRedis().setex(`session:${sessionId}`, ttlSeconds, JSON.stringify(data));
    } catch { /* non-critical */ }
  },

  async getSession(sessionId) {
    try {
      const val = await getRedis().get(`session:${sessionId}`);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async delSession(sessionId) {
    try {
      await getRedis().del(`session:${sessionId}`);
    } catch { /* non-critical */ }
  },

  async extendSession(sessionId, ttlSeconds) {
    try {
      await getRedis().expire(`session:${sessionId}`, ttlSeconds);
    } catch { /* non-critical */ }
  },
};

module.exports = { getRedis, cache };
