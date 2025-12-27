import express from "express";
import cors from "cors";
import crypto from "crypto";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import fs from "fs";
import Stripe from "stripe";
import { getCRMClient } from "./src/providers/index.js";
import { detectLeaks } from "./src/leakDetector.js";

dotenv.config();

const app = express();
app.use(express.json());

// --- Startup Constants & Validation ---
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const appVersion = packageJson.version;
const serverStartTime = new Date();

const requiredEnvVars = ['STRIPE_SECRET_KEY', 'PONS_API_KEY', 'STRIPE_PRICE_ID_PRO', 'ALLOWED_ORIGINS'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`[FATAL] Missing required environment variable: ${varName}. Shutting down.`);
    process.exit(1);
  }
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// --- Request ID and Logging Middleware ---
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = process.hrtime();
  res.on('finish', () => {
    const durationInMs = (process.hrtime(start)[0] * 1000 + process.hrtime(start)[1] / 1e6).toFixed(2);
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: parseFloat(durationInMs),
      ip: req.ip,
    }));
  });
  next();
});

// --- CORS Configuration ---
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
if (process.env.NODE_ENV === 'development') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:8080');
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key"],
  })
);

app.options("*", cors());

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// --- Utility Functions ---
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Middleware ---
const apiKeyAuth = (req, res, next) => {
  let apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7, authHeader.length);
  }

  const validApiKeys = [process.env.PONS_API_KEY];
  if (process.env.NODE_ENV === 'development' && process.env.PONS_DEV_API_KEY) {
    validApiKeys.push(process.env.PONS_DEV_API_KEY);
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized: API Key is required via x-api-key or Authorization: Bearer header' });
  }

  const isAuthorized = validApiKeys.some(validKey => {
    try {
      return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validKey));
    } catch (e) {
      return false;
    }
  });

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }
  next();
};

// --- Public Endpoints ---
app.get("/", (req, res) => {
  res.send("PONS API OK");
});

app.get("/health", (req, res) => {
  // Calculate uptime in seconds
  const uptimeSeconds = (new Date() - serverStartTime) / 1000;

  res.status(200).json({
    status: "ok",
    version: appVersion,
    uptime: `${uptimeSeconds.toFixed(0)}s`,
  });
});

app.get("/warm", (req, res) => {
  // This endpoint is for Cloud Run warm-up calls to reduce cold starts.
  // It should execute minimal logic. A log entry is sufficient.
  console.log(JSON.stringify({
    level: 'info',
    message: 'Instance warmed up.',
    requestId: req.id,
  }));
  res.status(204).send(); // 204 No Content is efficient for successful no-op requests.
});

// --- API Routes ---
const apiRouter = express.Router();

// LEAKS ENDPOINT
apiRouter.post("/leaks", apiKeyAuth, asyncHandler(async (req, res) => {
  const { crm } = req.query;
  if (!crm) {
    return res.status(400).json({ error: "CRM provider query parameter is required (e.g., ?crm=ghl)." });
  }

  const client = getCRMClient(crm, {});
  const [leads, opportunities, activities] = await Promise.all([
    client.fetchLeads(),
    client.fetchDeals(),
    client.fetchActivities(),
  ]);

  const result = detectLeaks({ leads, opportunities, activities });

  res.json(result);
}));

// LEAKS ANALYSIS ENDPOINT (flexible input)
apiRouter.post("/leaks/analyze", apiKeyAuth, asyncHandler(async (req, res) => {
  const { crm } = req.query;
  let leads, opportunities, activities;

  if (crm) {
    // Case 1: Fetch data from a specified CRM provider.
    const client = getCRMClient(crm, {});
    [leads, opportunities, activities] = await Promise.all([
      client.fetchLeads(),
      client.fetchDeals(),
      client.fetchActivities(),
    ]);
  } else {
    // Case 2: Use raw data provided in the request body.
    ({ leads, opportunities, activities } = req.body);

    // Validate that the required data arrays are present in the body.
    if (!Array.isArray(leads) || !Array.isArray(opportunities) || !Array.isArray(activities)) {
      return res.status(400).json({
        error: "Invalid request body. When not using a 'crm' query parameter, the body must contain 'leads', 'opportunities', and 'activities' arrays."
      });
    }
  }

  // Run the leak detection engine with the normalized data.
  const result = detectLeaks({ leads, opportunities, activities });
  res.json(result);
}));

// ANALYTICS ENDPOINT
apiRouter.get("/analytics", apiKeyAuth, asyncHandler(async (req, res) => {
  const { crm } = req.query;
  if (!crm) {
    return res.status(400).json({ error: "CRM provider query parameter is required." });
  }

  const client = getCRMClient(crm, {});
  const opportunities = await client.fetchDeals();

  const total_opportunities = opportunities.length;
  const total_value = opportunities.reduce((sum, opp) => sum + opp.value, 0);

  const won_opportunities = opportunities.filter(opp => opp.status === 'won');
  const lost_opportunities = opportunities.filter(opp => opp.status === 'lost');
  const closed_opportunities_count = won_opportunities.length + lost_opportunities.length;

  const win_rate = closed_opportunities_count > 0 ? won_opportunities.length / closed_opportunities_count : 0;

  const total_cycle_days = won_opportunities.reduce((sum, opp) => {
    const created = new Date(opp.createdAt);
    const closed = new Date(opp.closedAt);
    const cycle_days = (closed - created) / (1000 * 60 * 60 * 24);
    return sum + cycle_days;
  }, 0);

  const average_sales_cycle_days = won_opportunities.length > 0 ? Math.round(total_cycle_days / won_opportunities.length) : 0;

  const pipelineSummary = {
    total_opportunities,
    total_value,
    win_rate: parseFloat(win_rate.toFixed(2)),
    average_sales_cycle_days,
    generated_at: new Date().toISOString(),
  };
  res.json(pipelineSummary);
}));

// STRIPE ENDPOINTS
apiRouter.post("/stripe/create-checkout-session", apiKeyAuth, asyncHandler(async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price: process.env.STRIPE_PRICE_ID_PRO,
      quantity: 1,
    }, ],
    mode: 'subscription',
    success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${req.headers.origin}/cancel`,
  });

  res.json({ id: session.id });
}));

apiRouter.post("/stripe/verify-session", apiKeyAuth, asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  // Here you would grant access, e.g., update user record in your DB
  res.json({ status: session.payment_status, customer_email: session.customer_details.email });
}));

app.use('/api', apiRouter);

// --- Error Handling ---
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    requestId: req.id,
    message: err.message,
    stack: err.stack,
  }));

  if (err instanceof Stripe.errors.StripeError) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }

  // Add more specific error types as needed

  res.status(500).json({ error: 'An internal server error occurred.' });
});

// --- Server Start ---
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`PONS API listening on ${port}`);
});
