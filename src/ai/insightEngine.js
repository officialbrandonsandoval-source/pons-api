/**
 * PONS Insight Engine
 * Orchestrates all intelligence modules
 * Single entry point for full revenue analysis
 * 
 * FLOW: data → insight → priority → action → revenue impact
 */

import { scoreLeads } from './leadScoring.js';
import { prioritizeDeals } from './dealPrioritization.js';
import { generateActions, getNextBestAction } from './actionRecommendations.js';
import { detectLeaks } from '../services/leakDetector.js';

/**
 * Run full revenue intelligence analysis
 * @param {Object} data - CRM data snapshot
 * @param {Object} options - Analysis options
 * @returns {Object} Complete intelligence report
 */
export async function analyze(data, options = {}) {
  const now = options.now || new Date();
  const includeAI = options.includeAI ?? false;

  const {
    leads = [],
    contacts = [],
    opportunities = [],
    activities = [],
    reps = []
  } = data;

  // ============================================
  // PHASE 1: SCORE & PRIORITIZE
  // ============================================

  // Score all leads
  const leadScoreResult = scoreLeads(leads, activities, now);

  // Prioritize all deals
  const dealPriorityResult = prioritizeDeals(opportunities, activities, now);

  // ============================================
  // PHASE 2: DETECT LEAKS
  // ============================================

  const leakResult = await detectLeaks({
    leads,
    contacts,
    opportunities,
    activities,
    reps,
    now,
    includeAI
  });

  // ============================================
  // PHASE 3: GENERATE ACTIONS
  // ============================================

  const actionResult = generateActions({
    leads,
    deals: opportunities,
    activities,
    reps,
    leadScores: leadScoreResult.leads,
    dealPriorities: dealPriorityResult.deals,
    leaks: leakResult.leaks
  }, now);

  // ============================================
  // PHASE 4: SYNTHESIZE INSIGHTS
  // ============================================

  const insights = synthesizeInsights({
    leadScores: leadScoreResult,
    dealPriorities: dealPriorityResult,
    leaks: leakResult,
    actions: actionResult
  });

  // ============================================
  // BUILD RESPONSE
  // ============================================

  return {
    // Executive summary
    summary: {
      healthScore: calculateHealthScore(insights),
      totalPipelineValue: dealPriorityResult.summary.totalPipelineValue,
      weightedPipelineValue: dealPriorityResult.summary.weightedPipelineValue,
      revenueAtRisk: leakResult.summary.totalEstimatedRevenue,
      leakCount: leakResult.summary.totalLeaks,
      criticalIssues: leakResult.summary.criticalCount,
      actionableItems: actionResult.summary.totalActions
    },

    // Next best action (single most important thing)
    nextBestAction: actionResult.nextBestAction,

    // Top 5 priorities
    focusList: actionResult.actions.slice(0, 5),

    // Detailed results
    leadScoring: leadScoreResult,
    dealPrioritization: dealPriorityResult,
    leakDetection: leakResult,
    actionPlan: actionResult,

    // AI insights (if enabled)
    aiInsights: leakResult.aiInsights,

    // Meta
    insights,
    analyzedAt: now.toISOString()
  };
}

/**
 * Quick analysis - just the essentials
 */
export async function quickAnalysis(data, now = new Date()) {
  const {
    leads = [],
    opportunities = [],
    activities = []
  } = data;

  // Score leads
  const leadScores = scoreLeads(leads, activities, now);
  
  // Prioritize deals
  const dealPriorities = prioritizeDeals(opportunities, activities, now);

  // Get next action
  const nextAction = getNextBestAction({
    leads,
    deals: opportunities,
    activities,
    leadScores: leadScores.leads,
    dealPriorities: dealPriorities.deals,
    leaks: []
  }, now);

  return {
    hotLeads: leadScores.summary.hot,
    topDeal: dealPriorities.summary.topDeal,
    pipelineValue: dealPriorities.summary.totalPipelineValue,
    nextAction: nextAction.action,
    message: nextAction.message,
    analyzedAt: now.toISOString()
  };
}

/**
 * Voice-optimized response
 * Returns speakable summary
 */
export async function voiceSummary(data, now = new Date()) {
  const result = await quickAnalysis(data, now);
  
  const parts = [];

  // Pipeline health
  parts.push(`Your pipeline has ${result.pipelineValue ? '$' + (result.pipelineValue / 1000).toFixed(0) + 'k' : 'no deals'} in active opportunities.`);

  // Hot leads
  if (result.hotLeads > 0) {
    parts.push(`You have ${result.hotLeads} hot lead${result.hotLeads > 1 ? 's' : ''} ready for immediate outreach.`);
  }

  // Top deal
  if (result.topDeal) {
    parts.push(`Your top priority deal is ${result.topDeal.dealName} worth $${(result.topDeal.value / 1000).toFixed(0)}k.`);
  }

  // Next action
  if (result.nextAction) {
    parts.push(`Next action: ${result.nextAction.title}.`);
  }

  return {
    text: parts.join(' '),
    data: result,
    generatedAt: now.toISOString()
  };
}

// ============================================
// HELPERS
// ============================================

function synthesizeInsights(results) {
  const insights = [];

  const { leadScores, dealPriorities, leaks, actions } = results;

  // Lead quality insight
  if (leadScores.summary.hot > 0) {
    insights.push({
      type: 'OPPORTUNITY',
      message: `${leadScores.summary.hot} hot leads available. Speed to lead = 21x better conversion.`
    });
  }

  if (leadScores.summary.dead > leadScores.summary.total * 0.3) {
    insights.push({
      type: 'WARNING',
      message: `${Math.round((leadScores.summary.dead / leadScores.summary.total) * 100)}% of leads are dead. Review lead sources.`
    });
  }

  // Deal velocity insight
  const stuckDeals = dealPriorities.deals.filter(d => d.scores?.velocity <= 20).length;
  if (stuckDeals > 0) {
    insights.push({
      type: 'WARNING',
      message: `${stuckDeals} deals have stalled. Create urgency or disqualify.`
    });
  }

  // Leak patterns
  if (leaks.summary.criticalCount > 0) {
    insights.push({
      type: 'CRITICAL',
      message: `${leaks.summary.criticalCount} critical revenue leaks detected. $${leaks.summary.totalEstimatedRevenue.toLocaleString()} at risk.`
    });
  }

  // Capacity insight
  const immediateActions = actions.summary.immediateCount;
  if (immediateActions > 5) {
    insights.push({
      type: 'CAPACITY',
      message: `${immediateActions} items need immediate attention. Consider prioritization or delegation.`
    });
  }

  return insights;
}

function calculateHealthScore(insights) {
  let score = 100;

  for (const insight of insights) {
    if (insight.type === 'CRITICAL') score -= 25;
    else if (insight.type === 'WARNING') score -= 10;
    else if (insight.type === 'CAPACITY') score -= 5;
  }

  return Math.max(score, 0);
}

export default { 
  analyze, 
  quickAnalysis, 
  voiceSummary 
};
