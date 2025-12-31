/**
 * PONS Gemini AI Service
 * Handles all AI-powered analysis using Google's Gemini 1.5 Flash
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

let genAI = null;
let model = null;

/**
 * Initialize the Gemini client
 */
export function initGemini() {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('[Gemini] No API key found - AI features disabled');
    return false;
  }
  
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: MODEL_NAME });
  console.log(`[Gemini] Initialized with model: ${MODEL_NAME}`);
  return true;
}

/**
 * Analyze CRM data for revenue leaks using AI
 * @param {Object} data - Normalized CRM data
 * @returns {Promise<Object>} AI analysis results
 */
export async function analyzeLeaks(data) {
  if (!model) {
    return { aiEnabled: false, insights: null };
  }

  const { opportunities, activities, leads, contacts } = data;
  
  const prompt = `You are PONS, an AI revenue intelligence analyst for high-ticket sales teams (dealerships, insurance, B2B).

Analyze this CRM data and identify revenue leaks. Be specific, actionable, and tie everything to dollar impact.

DATA SUMMARY:
- Total Opportunities: ${opportunities.length}
- Open Opportunities: ${opportunities.filter(o => o.status === 'open').length}
- Total Pipeline Value: $${opportunities.filter(o => o.status === 'open').reduce((sum, o) => sum + (o.value || 0), 0).toLocaleString()}
- Total Activities (30 days): ${activities.length}
- Total Leads: ${leads.length}
- New Leads (no contact): ${leads.filter(l => l.status === 'new').length}

OPPORTUNITIES (sample of ${Math.min(opportunities.length, 20)}):
${JSON.stringify(opportunities.slice(0, 20).map(o => ({
  id: o.id,
  name: o.name,
  value: o.value,
  status: o.status,
  stage: o.stage,
  assignedTo: o.assignedTo,
  daysSinceActivity: o.lastActivityAt 
    ? Math.floor((Date.now() - new Date(o.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
    : 'unknown',
  createdDaysAgo: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24))
})), null, 2)}

RECENT ACTIVITIES (sample of ${Math.min(activities.length, 30)}):
${JSON.stringify(activities.slice(0, 30).map(a => ({
  type: a.type,
  outcome: a.outcome,
  performedBy: a.performedBy,
  daysAgo: Math.floor((Date.now() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60 * 24))
})), null, 2)}

LEADS (sample of ${Math.min(leads.length, 20)}):
${JSON.stringify(leads.slice(0, 20).map(l => ({
  id: l.id,
  status: l.status,
  assignedTo: l.assignedTo,
  source: l.leadSource,
  daysSinceCreated: Math.floor((Date.now() - new Date(l.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
  contacted: !!l.firstContactedAt
})), null, 2)}

Respond with a JSON object containing:
{
  "criticalIssues": [
    {
      "title": "string",
      "description": "string",
      "estimatedImpact": number,
      "affectedRecords": number,
      "urgency": "CRITICAL" | "HIGH" | "MEDIUM",
      "action": "string"
    }
  ],
  "repPerformance": {
    "topPerformer": { "id": "string", "reason": "string" },
    "needsAttention": { "id": "string", "reason": "string" }
  },
  "quickWins": [
    {
      "action": "string",
      "expectedOutcome": "string",
      "effort": "LOW" | "MEDIUM" | "HIGH"
    }
  ],
  "weeklyFocus": "string - one sentence priority for the week",
  "totalRevenueAtRisk": number,
  "healthScore": number (0-100)
}

Be brutally honest. If the data shows problems, say so. These are business owners who need truth, not comfort.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return {
        aiEnabled: true,
        insights: JSON.parse(jsonStr),
        rawResponse: text
      };
    }
    
    return {
      aiEnabled: true,
      insights: null,
      rawResponse: text,
      error: 'Could not parse AI response as JSON'
    };
  } catch (error) {
    console.error('[Gemini] Analysis error:', error.message);
    return {
      aiEnabled: true,
      insights: null,
      error: error.message
    };
  }
}

/**
 * Generate rep performance summary
 * @param {Object} repData - Rep activities and results
 * @returns {Promise<Object>} AI-generated performance insights
 */
export async function analyzeRepPerformance(repData) {
  if (!model) {
    return { aiEnabled: false, insights: null };
  }

  const prompt = `You are PONS, analyzing sales rep performance for a manager.

REP DATA:
${JSON.stringify(repData, null, 2)}

Provide a brief, actionable assessment in JSON:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "coachingTip": "One specific thing manager should discuss",
  "performanceScore": number (0-100)
}

Be direct. Managers need truth, not fluff.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return {
        aiEnabled: true,
        insights: JSON.parse(jsonStr)
      };
    }
    
    return { aiEnabled: true, insights: null, rawResponse: text };
  } catch (error) {
    console.error('[Gemini] Rep analysis error:', error.message);
    return { aiEnabled: true, insights: null, error: error.message };
  }
}

/**
 * Generate executive summary for owner/manager
 * @param {Object} analysisResult - Full analysis result
 * @returns {Promise<string>} Natural language summary
 */
export async function generateExecutiveSummary(analysisResult) {
  if (!model) {
    return null;
  }

  const prompt = `You are PONS, briefing a business owner on their sales team's performance.

ANALYSIS DATA:
${JSON.stringify(analysisResult, null, 2)}

Write a 3-4 paragraph executive summary that:
1. Opens with the single most important thing they need to know
2. Quantifies revenue at risk
3. Highlights the top 2-3 actions to take THIS WEEK
4. Closes with one encouraging data point (if any exists)

Write in plain English. No jargon. Be direct. This person has 60 seconds to read this.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('[Gemini] Summary error:', error.message);
    return null;
  }
}

export default {
  initGemini,
  analyzeLeaks,
  analyzeRepPerformance,
  generateExecutiveSummary
};
