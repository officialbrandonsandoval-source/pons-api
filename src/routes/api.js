/**
 * PONS API Routes
 */

import { Router } from 'express';
import { getProvider, listProviders } from '../providers/index.js';
import { detectLeaks, calculateRepKPIs } from '../services/leakDetector.js';
import { validateOutreach, validateBatch } from '../services/contactValidation.js';
import { analyzeRepPerformance, generateExecutiveSummary } from '../services/gemini.js';
import { WebhookProvider } from '../providers/webhook.js';

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

export default router;
