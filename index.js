import express from "express";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
import { getLeads, getOpportunities, getActivities } from "./crmProviders.js";
import { detectLeaks } from "./leakDetector.js";
import Stripe from "stripe";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());

const allowedOrigins = [
  "https://pons.solutions",
  "https://www.pons.solutions",
  "https://pons-api-219733399964.us-west1.run.app",
  /^https:\/\/.*-officialbrandonsandoval\.vercel\.app$/, // Vercel Preview URLs
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some(o => (typeof o === 'string' ? o === origin : o.test(origin)))) {
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

// API Key Authentication Middleware
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  const validApiKeys = [process.env.PONS_API_KEY];
  if (process.env.NODE_ENV === 'development' && process.env.PONS_DEV_API_KEY) {
    validApiKeys.push(process.env.PONS_DEV_API_KEY);
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized: API Key is required' });
  }

  // Use crypto.timingSafeEqual to prevent timing attacks
  const isAuthorized = validApiKeys.some(validKey => {
    try {
      return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(validKey));
    } catch {
      return false;
    }
  });

  if (isAuthorized) return next();

  res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
};

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("PONS API OK");
});

app.get("/health", (req, res) => {
  // Standard health check for Cloud Run/load balancers
  res.status(200).json({ status: "ok" });
});

// LEAKS ENDPOINT
app.post("/api/leaks", apiKeyAuth, async (req, res) => {
  const { leads, opportunities, activities } = req.body;

  if (!leads || !opportunities || !activities) {
    return res.status(400).json({ error: "Request body must contain leads, opportunities, and activities arrays." });
  }

  try {
    const leaks = detectLeaks({ leads, opportunities, activities });
    res.json(leaks);
  } catch (error) {
    console.error("Error in /api/leaks:", error);
    if (error instanceof TypeError) {
      return res.status(400).json({ error: `Invalid data provided: ${error.message}` });
    }
    res.status(500).json({ error: "An internal server error occurred while detecting leaks." });
  }
});

// ANALYTICS ENDPOINT
app.get("/api/analytics", apiKeyAuth, async (req, res) => {
    const { crm } = req.query;
    if (!crm) {
        return res.status(400).json({ error: "CRM provider query parameter is required." });
    }

    try {
        const opportunities = await getOpportunities(crm);

        const total_opportunities = opportunities.length;
        const total_value = opportunities.reduce((sum, opp) => sum + opp.value, 0);

        const won_opportunities = opportunities.filter(opp => opp.status === 'won');
        const lost_opportunities = opportunities.filter(opp => opp.status === 'lost');
        const closed_opportunities_count = won_opportunities.length + lost_opportunities.length;

        const win_rate = closed_opportunities_count > 0 ? won_opportunities.length / closed_opportunities_count : 0;

        let total_cycle_days = 0;
        if (won_opportunities.length > 0) {
            total_cycle_days = won_opportunities.reduce((sum, opp) => {
                const created = new Date(opp.createdAt);
                const closed = new Date(opp.closedAt);
                const cycle_days = (closed - created) / (1000 * 60 * 60 * 24);
                return sum + cycle_days;
            }, 0);
        }

        const average_sales_cycle_days = won_opportunities.length > 0 ? Math.round(total_cycle_days / won_opportunities.length) : 0;

        const pipelineSummary = {
            total_opportunities,
            total_value,
            win_rate: parseFloat(win_rate.toFixed(2)),
            average_sales_cycle_days,
            generated_at: new Date().toISOString(),
        };
        res.json(pipelineSummary);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// STRIPE ENDPOINTS
app.post("/api/stripe/create-checkout-session", apiKeyAuth, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID_PRO,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/cancel`,
    });

    res.json({ id: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/stripe/verify-session", apiKeyAuth, async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required.' });
    }
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // Here you would grant access, e.g., update user record in your DB
        res.json({ status: session.payment_status, customer_email: session.customer_details.email });
    } catch (error) {
        console.error("Stripe session verification error:", error.message);
        res.status(402).json({ error: "Payment verification failed." });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`PONS API listening on ${port}`);
});
