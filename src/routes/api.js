/**
 * PONS API Routes
 */

import { Router } from 'express';
import { getProvider, listProviders } from '../providers/index.js';
import { detectLeaks, calculateRepKPIs } from '../services/leakDetector.js';
import { validateOutreach, validateBatch } from '../services/contactValidation.js';
import { analyzeRepPerformance, generateExecutiveSummary } from '../services/gemini.js';
import { generateSpeech, VOICES } from '../services/voice.js';
import { WebhookProvider } from '../providers/webhook.js';
import { analyze, quickAnalysis, voiceSummary } from '../ai/insightEngine.js';
import { scoreLeads } from '../ai/leadScoring.js';
import { prioritizeDeals } from '../ai/dealPrioritization.js';
import { generateActions, getNextBestAction } from '../ai/actionRecommendations.js';
import {
  signState,
  verifyState,
  buildGhlAuthorizeUrl,
  exchangeGhlAuthorizationCode,
  isAllowedReturnUrl,
  buildFragmentRedirectUrl
} from '../services/ghlOAuth.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// List available CRM providers
router.get('/providers', (req, res) => {
  res.json({ providers: listProviders() });
});

// ===========================================
// GHL OAUTH (LOGIN)
// ===========================================

const ghlOAuthStartHandler = (req, res) => {
  try {
    const authorizeUrl = process.env.GHL_OAUTH_AUTHORIZE_URL || 'https://marketplace.gohighlevel.com/oauth/chooselocation';
    const clientId = process.env.GHL_OAUTH_CLIENT_ID;
    const redirectUri = process.env.GHL_OAUTH_REDIRECT_URI;
    const stateSecret = process.env.GHL_OAUTH_STATE_SECRET;

    if (!clientId || !redirectUri || !stateSecret) {
      return res.status(500).json({
        error: 'GHL OAuth not configured. Set GHL_OAUTH_CLIENT_ID, GHL_OAUTH_REDIRECT_URI, GHL_OAUTH_STATE_SECRET'
      });
    }

    const scope = req.query.scope || process.env.GHL_OAUTH_SCOPE || undefined;
    const returnUrl = req.query.returnUrl || req.query.return_url || undefined;

    const allowedOrigins = (process.env.GHL_OAUTH_ALLOWED_RETURN_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (returnUrl && !isAllowedReturnUrl(returnUrl, allowedOrigins)) {
      return res.status(400).json({ error: 'Invalid returnUrl' });
    }

    const state = signState(
      {
        iat: Date.now(),
        returnUrl: returnUrl || null
      },
      stateSecret
    );

    const url = buildGhlAuthorizeUrl({
      authorizeUrl,
      clientId,
      redirectUri,
      scope,
      state
    });

    if (req.query.mode === 'json') return res.json({ authorizeUrl: url });
    return res.redirect(url);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const ghlOAuthCallbackHandler = async (req, res) => {
  try {
    const tokenUrl = process.env.GHL_OAUTH_TOKEN_URL || 'https://services.leadconnectorhq.com/oauth/token';
    const clientId = process.env.GHL_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GHL_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GHL_OAUTH_REDIRECT_URI;
    const stateSecret = process.env.GHL_OAUTH_STATE_SECRET;

    if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
      return res.status(500).json({
        error: 'GHL OAuth not configured. Set GHL_OAUTH_CLIENT_ID, GHL_OAUTH_CLIENT_SECRET, GHL_OAUTH_REDIRECT_URI, GHL_OAUTH_STATE_SECRET'
      });
    }

    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const statePayload = verifyState(req.query.state, stateSecret);
    if (!statePayload) return res.status(400).json({ error: 'Invalid state' });

    const allowedOrigins = (process.env.GHL_OAUTH_ALLOWED_RETURN_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const returnUrl = statePayload.returnUrl;
    if (returnUrl && !isAllowedReturnUrl(returnUrl, allowedOrigins)) {
      return res.status(400).json({ error: 'Invalid returnUrl' });
    }

    const token = await exchangeGhlAuthorizationCode({
      tokenUrl,
      code: String(code),
      clientId,
      clientSecret,
      redirectUri
    });

    // Some GHL flows include selected location/company on the callback query.
    const locationId = token.locationId || req.query.locationId || req.query.location_id || null;
    const companyId = token.companyId || req.query.companyId || req.query.company_id || null;

    if (req.query.mode === 'json' || !returnUrl) {
      return res.json({
        connected: true,
        provider: 'ghl',
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        locationId,
        companyId,
        raw: token.raw
      });
    }

    // Redirect back to the app with tokens in the URL fragment (not sent to servers).
    const redirectTo = buildFragmentRedirectUrl(returnUrl, {
      provider: 'ghl',
      access_token: token.accessToken || '',
      refresh_token: token.refreshToken || '',
      expires_at: token.expiresAt || '',
      location_id: locationId || '',
      company_id: companyId || ''
    });

    return res.redirect(redirectTo);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Primary (explicit) routes
router.get('/auth/ghl/start', ghlOAuthStartHandler);
router.get('/auth/ghl/callback', ghlOAuthCallbackHandler);

// White-label friendly aliases (avoid "ghl" in URL for marketplace restrictions)
router.get('/auth/oauth/start', ghlOAuthStartHandler);
router.get('/auth/oauth/callback', ghlOAuthCallbackHandler);

// Test CRM connection
router.post('/connect', async (req, res) => {
  try {
    const { crm, config } = req.body;
    
    if (!crm) {
      return res.status(400).json({ error: 'Missing "crm" parameter' });
    }

    const provider = getProvider(crm, config);
    const result = await provider.testConnection();
    
    res.json({
      crm,
      ...result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ===========================================
// LEAK DETECTION
// ===========================================

// Run leak detection
router.post('/leaks', async (req, res) => {
  try {
    const { crm, config, includeAI = true } = req.body;
    
    if (!crm) {
      return res.status(400).json({ error: 'Missing "crm" parameter' });
    }

    const provider = getProvider(crm, config);
    
    // Test connection first
    const connectionTest = await provider.testConnection();
    if (!connectionTest.connected) {
      return res.status(400).json({ 
        error: 'CRM connection failed', 
        details: connectionTest.error 
      });
    }

    // Fetch all data
    const data = await provider.getAllData();
    
    // Run leak detection
    const result = await detectLeaks({
      ...data,
      includeAI
    });

    res.json(result);
  } catch (error) {
    console.error('[/leaks] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get quick summary (lighter weight)
router.post('/leaks/summary', async (req, res) => {
  try {
    const { crm, config } = req.body;
    
    const provider = getProvider(crm, config);
    const data = await provider.getAllData();
    
    const result = await detectLeaks({
      ...data,
      includeAI: false // Skip AI for quick summary
    });

    // Return just summary
    res.json({
      summary: result.summary,
      topLeaks: result.leaks.slice(0, 5),
      generatedAt: result.generatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// REP PERFORMANCE
// ===========================================

// Get all rep KPIs
router.post('/reps/kpis', async (req, res) => {
  try {
    const { crm, config } = req.body;
    
    const provider = getProvider(crm, config);
    const data = await provider.getAllData();
    
    const kpis = calculateRepKPIs({
      opportunities: data.opportunities,
      activities: data.activities,
      reps: data.reps
    });

    res.json({ kpis, generatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific rep analysis with AI
router.post('/reps/:repId/analyze', async (req, res) => {
  try {
    const { repId } = req.params;
    const { crm, config } = req.body;
    
    const provider = getProvider(crm, config);
    const data = await provider.getAllData();
    
    // Filter data for this rep
    const repOpps = data.opportunities.filter(o => o.assignedTo === repId);
    const repActivities = data.activities.filter(a => a.performedBy === repId);
    const rep = data.reps.find(r => r.id === repId);

    if (!rep) {
      return res.status(404).json({ error: 'Rep not found' });
    }

    const kpis = calculateRepKPIs({
      opportunities: repOpps,
      activities: repActivities,
      reps: [rep]
    })[0];

    // Get AI analysis
    const aiResult = await analyzeRepPerformance({
      rep,
      kpis,
      recentActivities: repActivities.slice(0, 20),
      openDeals: repOpps.filter(o => o.status === 'open')
    });

    res.json({
      rep,
      kpis,
      aiInsights: aiResult.insights,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// CONTACT VALIDATION
// ===========================================

// Validate single contact for outreach
router.post('/validate/outreach', async (req, res) => {
  try {
    const { crm, config, contactId, outreachType, repId, interactionId } = req.body;
    
    if (!contactId || !outreachType) {
      return res.status(400).json({ 
        error: 'Missing required parameters: contactId, outreachType' 
      });
    }

    const provider = getProvider(crm, config);
    const crmData = await provider.getAllData();
    
    const result = validateOutreach({
      contactId,
      outreachType,
      repId,
      interactionId,
      crmData
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch validate multiple contacts
router.post('/validate/batch', async (req, res) => {
  try {
    const { crm, config, contacts } = req.body;
    
    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ 
        error: 'Missing or invalid "contacts" array' 
      });
    }

    const provider = getProvider(crm, config);
    const crmData = await provider.getAllData();
    
    const result = validateBatch(contacts, crmData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// WEBHOOK DATA INGESTION
// ===========================================

// Ingest data via webhook
router.post('/webhook/ingest', async (req, res) => {
  try {
    const { data, mode = 'replace' } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'Missing "data" parameter' });
    }

    const provider = new WebhookProvider({});
    const result = await provider.ingestData(data, mode);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear webhook data
router.delete('/webhook/data', async (req, res) => {
  try {
    const provider = new WebhookProvider({});
    const result = await provider.clearData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get webhook data status
router.get('/webhook/status', async (req, res) => {
  try {
    const provider = new WebhookProvider({});
    const result = await provider.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// EXECUTIVE REPORTS
// ===========================================

// Generate executive summary
router.post('/reports/executive', async (req, res) => {
  try {
    const { crm, config } = req.body;
    
    const provider = getProvider(crm, config);
    const data = await provider.getAllData();
    
    // Run full analysis
    const leakResult = await detectLeaks({ ...data, includeAI: true });
    const kpis = calculateRepKPIs({
      opportunities: data.opportunities,
      activities: data.activities,
      reps: data.reps
    });

    // Generate executive summary
    const summary = await generateExecutiveSummary({
      leaks: leakResult.leaks,
      summary: leakResult.summary,
      aiInsights: leakResult.aiInsights,
      repKPIs: kpis
    });

    res.json({
      executiveSummary: summary,
      data: {
        leakSummary: leakResult.summary,
        topLeaks: leakResult.leaks.slice(0, 10),
        aiInsights: leakResult.aiInsights,
        repKPIs: kpis
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Direct leak detection with inline data (for testing/webhook)
router.post('/leaks/analyze', async (req, res) => {
  try {
    const { contacts = [], opportunities = [], activities = [], leads = [], reps = [], includeAI = false } = req.body;
    
    const result = await detectLeaks({
      contacts,
      opportunities,
      activities,
      leads,
      reps,
      includeAI
    });

    res.json(result);
  } catch (error) {
    console.error('[/leaks/analyze] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// INTELLIGENCE ENGINE
// ===========================================

// Full analysis - comprehensive revenue intelligence
router.post('/analyze', async (req, res) => {
  try {
    const { contacts = [], opportunities = [], activities = [], leads = [], reps = [], includeAI = false } = req.body;
    
    const result = await analyze({
      contacts,
      opportunities,
      activities,
      leads,
      reps
    }, { includeAI });

    res.json(result);
  } catch (error) {
    console.error('[/analyze] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Quick analysis - fast essentials
router.post('/analyze/quick', async (req, res) => {
  try {
    const { opportunities = [], activities = [], leads = [] } = req.body;
    
    const result = await quickAnalysis({
      leads,
      opportunities,
      activities
    });

    res.json(result);
  } catch (error) {
    console.error('[/analyze/quick] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Voice summary - speakable response
router.post('/analyze/voice', async (req, res) => {
  try {
    const { opportunities = [], activities = [], leads = [] } = req.body;
    
    const result = await voiceSummary({
      leads,
      opportunities,
      activities
    });

    res.json(result);
  } catch (error) {
    console.error('[/analyze/voice] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// LEAD SCORING
// ===========================================

router.post('/leads/score', async (req, res) => {
  try {
    const { leads = [], activities = [] } = req.body;
    const result = scoreLeads(leads, activities);
    res.json(result);
  } catch (error) {
    console.error('[/leads/score] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// DEAL PRIORITIZATION
// ===========================================

router.post('/deals/prioritize', async (req, res) => {
  try {
    const { opportunities = [], activities = [] } = req.body;
    const result = prioritizeDeals(opportunities, activities);
    res.json(result);
  } catch (error) {
    console.error('[/deals/prioritize] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// ACTION RECOMMENDATIONS
// ===========================================

router.post('/actions', async (req, res) => {
  try {
    const { leads = [], opportunities = [], activities = [], reps = [], leadScores = [], dealPriorities = [], leaks = [] } = req.body;
    
    const result = generateActions({
      leads,
      deals: opportunities,
      activities,
      reps,
      leadScores,
      dealPriorities,
      leaks
    });

    res.json(result);
  } catch (error) {
    console.error('[/actions] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Next best action - single most important thing
router.post('/actions/next', async (req, res) => {
  try {
    const { leads = [], opportunities = [], activities = [], leadScores = [], dealPriorities = [], leaks = [] } = req.body;
    
    const result = getNextBestAction({
      leads,
      deals: opportunities,
      activities,
      leadScores,
      dealPriorities,
      leaks
    });

    res.json(result);
  } catch (error) {
    console.error('[/actions/next] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// VOICE (OpenAI TTS)
// ===========================================

// Get available voices
router.get('/voice/voices', (req, res) => {
  res.json({ voices: VOICES });
});

// Generate speech from text
router.post('/voice/speak', async (req, res) => {
  try {
    const { text, voice = 'nova' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (text.length > 4096) {
      return res.status(400).json({ error: 'text too long (max 4096 chars)' });
    }

    const audioBuffer = await generateSpeech(text, voice);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache'
    });
    res.send(audioBuffer);
  } catch (error) {
    console.error('[/voice/speak] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Voice summary - analyze data and return audio
router.post('/voice/summary', async (req, res) => {
  try {
    const { leads = [], opportunities = [], activities = [], voice = 'nova' } = req.body;
    
    // Get text summary
    const summary = await voiceSummary({ leads, opportunities, activities });
    
    // Convert to speech
    const audioBuffer = await generateSpeech(summary.text, voice);
    
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'X-Summary-Text': encodeURIComponent(summary.text)
    });
    res.send(audioBuffer);
  } catch (error) {
    console.error('[/voice/summary] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
