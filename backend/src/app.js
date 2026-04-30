require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../swagger');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const { error } = require('./utils/response');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const questionsRoutes = require('./modules/questions/questions.routes');
const examsRoutes = require('./modules/exams/exams.routes');
const conductionRoutes = require('./modules/conduction/conduction.routes');
const evaluationRoutes = require('./modules/evaluation/evaluation.routes');
const resultsRoutes = require('./modules/results/results.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');

const app = express();

// ─── Security Middleware ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'fonts.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.jsdelivr.net'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.url === '/health',
}));

// ─── Rate Limiting ────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Static Files ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../../frontend'), {
  maxAge: '1d',
  etag: true,
}));

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/conduct', conductionRoutes);
app.use('/api/evaluation', evaluationRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/notifications', notificationsRoutes);

// ─── Swagger Docs ─────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }',
  customSiteTitle: 'OES API Documentation',
}));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const { pool } = require('./config/database');
  let dbStatus = 'ok';
  try { await pool.query('SELECT 1'); } catch { dbStatus = 'error'; }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    version: '1.0.0',
  });
});

// ─── Frontend SPA fallback ────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return error(res, 'API endpoint not found', 404);
  }
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

// ─── Temporary Debug Route ────────────────────────────────────
app.get('/api/debug-reset', async (req, res) => {
  const { pool } = require('./config/database');
  try {
    const bcrypt = require('bcryptjs');
    const newHash = await bcrypt.hash('Admin@1234', 12);
    
    // Check if users exist at all
    const check = await pool.query('SELECT email FROM users');
    if (check.rows.length === 0) {
      return res.json({ success: false, message: 'NO USERS IN DATABASE!' });
    }

    // Force update password
    await pool.query(`UPDATE users SET password_hash = $1, status = 'active', email_verified = true`, [newHash]);
    
    res.json({ 
      success: true, 
      message: 'All passwords have been forcibly reset to Admin@1234', 
      users_found: check.rows.map(r => r.email) 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack, path: req.path });
  error(res, process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message, 500);
});

// ─── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Test DB connection
    const { pool } = require('./config/database');
    await pool.query('SELECT 1');
    logger.info('✅ Database connected');

    // Connect Redis (non-blocking)
    try {
      const { getRedis } = require('./config/redis');
      await getRedis().connect();
    } catch (e) {
      logger.warn('Redis not available - running without cache');
    }

    // Start cron jobs
    require('./utils/cron');

    app.listen(PORT, () => {
      logger.info(`🚀 OES Server running on port ${PORT}`);
      logger.info(`📚 API Docs: http://localhost:${PORT}/api/docs`);
      logger.info(`🌐 Frontend: http://localhost:${PORT}`);
      logger.info(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`\n✅ Server started at http://localhost:${PORT}`);
      console.log(`📚 Swagger Docs: http://localhost:${PORT}/api/docs`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err.message);
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
