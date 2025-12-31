/**
 * PONS API Server
 * AI-powered Revenue Leak Detection for High-Ticket Sales
 * 
 * @version 2.0.0
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import apiRoutes from './routes/api.js';
import { initGemini } from './services/gemini.js';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// ===========================================
// MIDDLEWARE
// ===========================================

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// API Key authentication (optional)
app.use('/api/', (req, res, next) => {
  const apiKey = process.env.API_KEY;
  
  // Skip auth if no API key configured
  if (!apiKey) {
    return next();
  }

  const providedKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (providedKey !== apiKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ===========================================
// ROUTES
// ===========================================

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'PONS API',
    version: '2.0.0',
    description: 'AI-powered Revenue Leak Detection for High-Ticket Sales',
    docs: '/api/health',
    endpoints: {
      health: 'GET /api/health',
      providers: 'GET /api/providers',
      connect: 'POST /api/connect',
      leaks: 'POST /api/leaks',
      leaksSummary: 'POST /api/leaks/summary',
      repKPIs: 'POST /api/reps/kpis',
      repAnalyze: 'POST /api/reps/:repId/analyze',
      validateOutreach: 'POST /api/validate/outreach',
      validateBatch: 'POST /api/validate/batch',
      webhookIngest: 'POST /api/webhook/ingest',
      webhookStatus: 'GET /api/webhook/status',
      executiveReport: 'POST /api/reports/executive'
    }
  });
});

// API routes
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===========================================
// STARTUP
// ===========================================

async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║                    PONS API v2.0.0                    ║');
  console.log('║     AI-Powered Revenue Leak Detection System          ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // Initialize Gemini
  const geminiReady = initGemini();
  if (geminiReady) {
    console.log('✓ Gemini AI engine initialized');
  } else {
    console.log('⚠ Gemini AI disabled (no API key)');
  }

  // Check environment
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ Rate limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 100} requests/min`);
  console.log(`✓ API auth: ${process.env.API_KEY ? 'enabled' : 'disabled'}`);

  // Start server
  app.listen(PORT, () => {
    console.log('');
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📚 API docs: http://localhost:${PORT}/`);
    console.log('');
  });
}

start().catch(console.error);

export default app;
