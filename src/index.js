import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initGemini } from './services/gemini.js';
import { initVoice } from './services/voice.js';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS - MUST BE FIRST, BEFORE EVERYTHING
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
  credentials: false,
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Explicit OPTIONS handler for all routes
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Requested-With');
  res.status(200).end();
});

// Body parser
app.use(express.json({ limit: '10mb' }));

// Rate limiting - AFTER CORS
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => req.method === 'OPTIONS'
});
app.use(limiter);

// Optional API key auth
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  const apiKey = process.env.API_KEY;
  if (apiKey && req.headers['x-api-key'] !== apiKey) {
    if (req.path !== '/health' && req.path !== '/' && !req.path.startsWith('/voice')) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/', apiRoutes);

// Initialize services
if (process.env.GEMINI_API_KEY) {
  initGemini();
  console.log('✓ Gemini AI initialized');
}

if (process.env.OPENAI_API_KEY) {
  initVoice();
}

// Only listen in non-serverless environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;
