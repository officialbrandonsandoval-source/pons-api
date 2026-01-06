# PONS API v2.0.0

**AI-Powered Revenue Leak Detection for High-Ticket Sales**

PONS sits on top of your CRM and identifies where you're losing money. Built for dealerships, insurance agencies, and any business where every deal matters.

## Features

- **10+ Leak Types Detected**: Stale opportunities, untouched leads, slow response, abandoned deals, and more
- **AI Analysis**: Gemini 1.5 Flash analyzes patterns and generates actionable insights
- **Multi-CRM Support**: GoHighLevel, HubSpot, Salesforce, + Generic Webhook
- **Rep Performance KPIs**: Track every rep's activity, win rate, and pipeline health
- **Contact Validation**: Prevent misfired outreach before it damages your reputation
- **Executive Reports**: AI-generated summaries for owners and managers

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Add your keys to .env.local (see below)

# Start server
npm run dev
```

## Environment Variables

```env
# Required
GEMINI_API_KEY=your_gemini_key

# CRM (pick one or more)
GHL_API_KEY=your_ghl_key
GHL_LOCATION_ID=your_location_id
# (Optional, recommended) GoHighLevel OAuth (browser login flow)
# These enable /auth/ghl/start and /auth/ghl/callback
GHL_OAUTH_CLIENT_ID=your_ghl_oauth_client_id
GHL_OAUTH_CLIENT_SECRET=your_ghl_oauth_client_secret
GHL_OAUTH_REDIRECT_URI=https://your-api-domain.com/auth/ghl/callback
GHL_OAUTH_STATE_SECRET=long_random_string
# Optional overrides
# GHL_OAUTH_AUTHORIZE_URL=https://marketplace.gohighlevel.com/oauth/chooselocation
# GHL_OAUTH_TOKEN_URL=https://services.leadconnectorhq.com/oauth/token
# GHL_OAUTH_SCOPE=...
# Comma-separated allowlist. If set, returnUrl must match one of these origins.
# GHL_OAUTH_ALLOWED_RETURN_ORIGINS=https://your-app-domain.com,https://another-domain.com
# OR
HUBSPOT_ACCESS_TOKEN=your_hubspot_token
# OR
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
SALESFORCE_REFRESH_TOKEN=...
SALESFORCE_INSTANCE_URL=https://yourinstance.salesforce.com

# Optional
PORT=3001
API_KEY=your_api_key_for_clients
```

## API Endpoints

### Health & Setup

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/providers` | GET | List available CRM providers |
| `/api/connect` | POST | Test CRM connection |

### Auth (GoHighLevel OAuth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/ghl/start` | GET | Redirects user to GHL OAuth |
| `/auth/ghl/callback` | GET | OAuth callback; returns JSON or redirects back |

### Leak Detection

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/leaks` | POST | Run full leak detection + AI analysis |
| `/api/leaks/summary` | POST | Quick summary (no AI) |

### Rep Performance

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reps/kpis` | POST | Get KPIs for all reps |
| `/api/reps/:repId/analyze` | POST | AI analysis for specific rep |

### Contact Validation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/validate/outreach` | POST | Validate before sending outreach |
| `/api/validate/batch` | POST | Batch validate multiple contacts |

### Webhook (Generic CRM)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/ingest` | POST | Send CRM data via webhook |
| `/api/webhook/status` | GET | Check webhook data status |
| `/api/webhook/data` | DELETE | Clear webhook data |

### Reports

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports/executive` | POST | Generate executive summary |

## Usage Examples

### Run Leak Detection (GoHighLevel)

```bash
curl -X POST http://localhost:3001/api/leaks \
  -H "Content-Type: application/json" \
  -d '{
    "crm": "ghl",
    "config": {
      "apiKey": "your_ghl_key",
      "locationId": "your_location"
    },
    "includeAI": true
  }'
```

**Simplest setup (recommended for most users):**

- Provide only the token (`apiKey` / `accessToken`). If the token is a JWT that contains a `locationId` claim, PONS will auto-detect it.
- If auto-detection fails, also provide `locationId` (fastest + most reliable).

Example with token only:

```bash
curl -X POST http://localhost:3001/api/connect \
  -H "Content-Type: application/json" \
  -d '{
    "crm": "ghl",
    "config": {
      "apiKey": "YOUR_GHL_TOKEN"
    }
  }'
```

### GHL Login (OAuth)

1) Send the user to:

`GET https://your-api-domain.com/auth/ghl/start?returnUrl=https://your-app-domain.com/oauth-complete`

2) After the user authorizes, GHL will call back:

`GET https://your-api-domain.com/auth/ghl/callback?code=...&state=...`

3) If `returnUrl` was provided, the API redirects the user back to your app and puts tokens in the URL fragment (so they are not sent to your app server via HTTP headers):

`https://your-app-domain.com/oauth-complete#provider=ghl&access_token=...&refresh_token=...&location_id=...`

4) Your app should read `access_token` + `location_id` from the fragment and then call PONS endpoints using:

```json
{
  "crm": "ghl",
  "config": {
    "accessToken": "...",
    "locationId": "..."
  }
}
```

### Validate Before Outreach

```bash
curl -X POST http://localhost:3001/api/validate/outreach \
  -H "Content-Type: application/json" \
  -d '{
    "crm": "webhook",
    "contactId": "contact_123",
    "outreachType": "review_request",
    "repId": "rep_456"
  }'
```

### Use Generic Webhook (Any CRM via Zapier/Make)

```bash
# Step 1: Send your CRM data
curl -X POST http://localhost:3001/api/webhook/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "contacts": [...],
      "opportunities": [...],
      "activities": [...],
      "leads": [...],
      "reps": [...]
    },
    "mode": "replace"
  }'

# Step 2: Run analysis
curl -X POST http://localhost:3001/api/leaks \
  -H "Content-Type: application/json" \
  -d '{"crm": "webhook"}'
```

## Detected Leak Types

| Type | Description | Severity |
|------|-------------|----------|
| STALE_OPPORTUNITY | No activity 30+ days | HIGH/CRITICAL |
| UNTOUCHED_LEAD | Lead not contacted | MEDIUM/HIGH |
| SLOW_RESPONSE | Response > 24 hours | MEDIUM |
| ABANDONED_DEAL | Recently lost deals | MEDIUM |
| MISSING_FOLLOW_UP | No follow-up after interaction | MEDIUM |
| NO_ACTIVITY_REP | Rep with low activity | MEDIUM/HIGH |
| UNASSIGNED_LEAD | Lead without owner | MEDIUM/HIGH |
| DEAD_PIPELINE | Deals stuck 14+ days | MEDIUM |
| LOST_WITHOUT_REASON | No loss reason recorded | MEDIUM |
| HIGH_VALUE_AT_RISK | Big deal going cold | HIGH/CRITICAL |

## Architecture

```
pons-api/
├── src/
│   ├── index.js           # Server entry point
│   ├── types.js           # Type definitions
│   ├── routes/
│   │   └── api.js         # All API routes
│   ├── services/
│   │   ├── gemini.js      # AI engine
│   │   ├── leakDetector.js # Core detection logic
│   │   └── contactValidation.js # Outreach validation
│   └── providers/
│       ├── base.js        # Provider interface
│       ├── ghl.js         # GoHighLevel
│       ├── hubspot.js     # HubSpot
│       ├── salesforce.js  # Salesforce
│       ├── webhook.js     # Generic webhook
│       └── index.js       # Provider factory
├── package.json
├── .env.example
└── README.md
```

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

## License

Proprietary - Brandon Sandoval / PONS

---

Built for founders who value discipline over talent, systems over motivation, and truth over ego.
