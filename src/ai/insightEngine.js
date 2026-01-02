/**
 * PONS Insight Engine
 * Orchestrates: data → insight → priority → action → revenue impact
 * 
 * This is the brain that answers:
 * - What should be done right now?
 * - Which lead/deal matters most?
 * - Where is money being lost?
 * - What will hurt revenue if ignored?
 */

import { scoreLeads } from './leadScoring.js';
import { prioritizeDeals } from './dealPrioritization.js';

/**
 * Generate full revenue intelligence report
 */
export function generateInsights(data, options = {}) {
  const { 
    opportunities = [], 
    leads = [], 
    activities = [], 
    contacts = [],
    reps = []
  } = data;

  const now = options.now || new Date();

  // Build activity lookups
  const activitiesByContact = buildActivityMap(activities, 'contactId');
  const activitiesByLead = buildActivityMap(activities, 'contactId');

  // Score leads
  const leadScores = scoreLeads(leads, activitiesByLead, { now });

  // Prioritize deals
  const dealPriority = prioritizeDeals(opportunities, activitiesByContact, { now });

  // Calculate wasted effort
  const wastedEffort = calculateWastedEffort(activities, opportunities, leads, { now });

  // Generate next best actions
  const nextActions = generateNextActions(leadScores, dealPriority, wastedEffort);

  // Revenue impact analysis
  const revenueImpact = calculateRevenueImpact(dealPriority, leadScores);

  return {
    timestamp: now.toISOString(),
    
    // Top-level metrics
    metrics: {
      totalPipeline: dealPriority.summary.totalPipeline,
      weightedPipeline: dealPriority.summary.weightedPipeline,
      dealsAtRisk: dealPriority.summary.atRisk,
      hotLeads: leadScores.summary.hotLeads,
      avgLeadScore: leadScores.summary.avgScore,
      avgDealScore: dealPriority.summary.avgScore
    },

    // Prioritized lists
    topDeals: dealPriority.deals.slice(0, 10),
    topLeads: leadScores.leads.slice(0, 10),

    // Action recommendations
    nextActions,
    topActions: nextActions.slice(0, 5),

    // Wasted effort analysis
    wastedEffort,

    // Revenue impact
    revenueImpact,

    // Full data for deep dives
    leadScores,
    dealPriority
  };
}

/**
 * Get single "What should I do right now?" answer
 */
export function getNextBestAction(data, options = {}) {
  const insights = generateInsights(data, options);
  
  if (insights.nextActions.length === 0) {
    return {
      action: 'Pipeline looks healthy',
      type: 'MAINTAIN',
      reason: 'No urgent items requiring attention',
      impact: 0
    };
  }

  const top = insights.nextActions[0];
  return {
    action: top.action,
    type: top.type,
    reason: top.reason,
    impact: top.potentialRevenue,
    relatedId: top.relatedId,
    relatedName: top.relatedName
  };
}

/**
 * Build activity lookup map
 */
function buildActivityMap(activities, keyField) {
  const map = {};
  for (const act of activities) {
    const key = act[keyField];
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(act);
  }
  return map;
}

/**
 * Calculate wasted effort (time spent on low-value/dead activities)
 */
function calculateWastedEffort(activities, opportunities, leads, options = {}) {
  const now = options.now || new Date();
  const nowTime = now.getTime();
  const dayMs = 86400000;
  const thirtyDaysAgo = nowTime - (30 * dayMs);

  const recentActivities = activities.filter(a => 
    new Date(a.createdAt).getTime() > thirtyDaysAgo
  );

  // Find activities on lost/abandoned deals
  const deadDealIds = new Set(
    opportunities
      .filter(o => ['lost', 'abandoned', 'closed_lost'].includes(o.status?.toLowerCase()))
      .map(o => o.contactId)
  );

  const wastedOnDeadDeals = recentActivities.filter(a => deadDealIds.has(a.contactId));

  // Find activities on unresponsive leads (no response after 5+ touches)
  const touchCountByLead = {};
  for (const act of activities) {
    if (!touchCountByLead[act.contactId]) touchCountByLead[act.contactId] = 0;
    touchCountByLead[act.contactId]++;
  }

  const unresponsiveLeadIds = new Set(
    leads
      .filter(l => l.status === 'new' && touchCountByLead[l.id] >= 5)
      .map(l => l.id)
  );

  const wastedOnUnresponsive = recentActivities.filter(a => 
    unresponsiveLeadIds.has(a.contactId)
  );

  const totalActivities = recentActivities.length;
  const wastedActivities = wastedOnDeadDeals.length + wastedOnUnresponsive.length;
  const wastedPercentage = totalActivities > 0 
    ? Math.round((wastedActivities / totalActivities) * 100) 
    : 0;

  return {
    totalActivitiesLast30Days: totalActivities,
    wastedActivities,
    wastedPercentage,
    wastedOnDeadDeals: wastedOnDeadDeals.length,
    wastedOnUnresponsive: wastedOnUnresponsive.length,
    recommendation: wastedPercentage > 20 
      ? 'High wasted effort. Review activity targeting.'
      : wastedPercentage > 10
      ? 'Moderate waste. Consider lead qualification improvements.'
      : 'Effort well-targeted.'
  };
}

/**
 * Generate prioritized action list
 */
function generateNextActions(leadScores, dealPriority, wastedEffort) {
  const actions = [];

  // Critical priority deals first
  for (const deal of dealPriority.deals.filter(d => d.priority === 'CRITICAL')) {
    actions.push({
      type: deal.nextAction.type,
      action: deal.nextAction.action,
      reason: deal.nextAction.reason,
      relatedType: 'deal',
      relatedId: deal.dealId,
      relatedName: deal.dealName,
      potentialRevenue: deal.value,
      urgency: 'CRITICAL',
      score: deal.score
    });
  }

  // Hot leads
  for (const lead of leadScores.leads.filter(l => l.grade === 'A')) {
    actions.push({
      type: 'ENGAGE_HOT_LEAD',
      action: 'Immediate outreach to hot lead',
      reason: `Lead score ${lead.score}/100`,
      relatedType: 'lead',
      relatedId: lead.leadId,
      relatedName: lead.leadId,
      potentialRevenue: 10000, // Estimated
      urgency: 'HIGH',
      score: lead.score
    });
  }

  // High priority deals
  for (const deal of dealPriority.deals.filter(d => d.priority === 'HIGH')) {
    actions.push({
      type: deal.nextAction.type,
      action: deal.nextAction.action,
      reason: deal.nextAction.reason,
      relatedType: 'deal',
      relatedId: deal.dealId,
      relatedName: deal.dealName,
      potentialRevenue: deal.value,
      urgency: 'HIGH',
      score: deal.score
    });
  }

  // Sort by urgency then potential revenue
  const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  actions.sort((a, b) => {
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.potentialRevenue - a.potentialRevenue;
  });

  return actions;
}

/**
 * Calculate total revenue impact
 */
function calculateRevenueImpact(dealPriority, leadScores) {
  const atRiskDeals = dealPriority.deals.filter(d => d.breakdown.decayPenalty <= -10);
  const atRiskRevenue = atRiskDeals.reduce((sum, d) => sum + d.value, 0);

  const hotLeadPotential = leadScores.summary.hotLeads * 15000; // Avg deal estimate
  const warmLeadPotential = leadScores.summary.warmLeads * 8000;

  return {
    pipelineAtRisk: atRiskRevenue,
    dealsAtRisk: atRiskDeals.length,
    hotLeadPotential,
    warmLeadPotential,
    totalUpside: hotLeadPotential + warmLeadPotential,
    netPosition: dealPriority.summary.weightedPipeline - atRiskRevenue
  };
}

export default { generateInsights, getNextBestAction };
