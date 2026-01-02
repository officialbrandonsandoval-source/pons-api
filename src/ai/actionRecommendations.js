/**
 * PONS Action Recommendation Engine
 * Answers: "What should I do RIGHT NOW to increase revenue?"
 * Returns prioritized actions with expected revenue impact
 */

/**
 * Generate prioritized action list
 * @param {Object} data - Full CRM data snapshot
 * @param {Object} scores - Lead scores and deal priorities
 * @returns {Object} Ordered actions with revenue impact
 */
export function generateActions({ 
  leads = [], 
  deals = [], 
  activities = [], 
  reps = [],
  leadScores = [],
  dealPriorities = [],
  leaks = []
}, now = new Date()) {
  
  const actions = [];

  // 1. HOT LEADS - Immediate call required
  const hotLeads = leadScores.filter(l => l.tier === 'HOT');
  for (const lead of hotLeads.slice(0, 3)) {
    actions.push({
      id: `call_hot_${lead.leadId}`,
      type: 'CALL_HOT_LEAD',
      priority: 100,
      urgency: 'IMMEDIATE',
      title: `Call hot lead: ${getLeadName(lead.leadId, leads)}`,
      description: `Score ${lead.score}/100. ${lead.recommendation?.message || 'High conversion probability.'}`,
      estimatedRevenue: 5000, // Assume avg deal
      timeToExecute: '5 min',
      relatedId: lead.leadId
    });
  }

  // 2. DEALS AT RISK - Rescue before lost
  const atRiskDeals = dealPriorities.filter(d => d.urgency === 'IMMEDIATE');
  for (const deal of atRiskDeals.slice(0, 3)) {
    actions.push({
      id: `rescue_${deal.dealId}`,
      type: 'RESCUE_DEAL',
      priority: 95,
      urgency: 'IMMEDIATE',
      title: `Rescue deal: ${deal.dealName}`,
      description: `$${deal.value.toLocaleString()} at risk. ${deal.recommendation?.message || 'Going cold.'}`,
      estimatedRevenue: deal.value,
      timeToExecute: '15 min',
      relatedId: deal.dealId
    });
  }

  // 3. READY TO CLOSE - Low effort, high return
  const closeableDeals = dealPriorities.filter(d => 
    d.scores?.probability >= 70 && d.recommendation?.action === 'CLOSE'
  );
  for (const deal of closeableDeals.slice(0, 3)) {
    actions.push({
      id: `close_${deal.dealId}`,
      type: 'CLOSE_DEAL',
      priority: 90,
      urgency: 'TODAY',
      title: `Close deal: ${deal.dealName}`,
      description: `High probability (${deal.scores.probability}%). Ask for the business.`,
      estimatedRevenue: deal.value,
      timeToExecute: '30 min',
      relatedId: deal.dealId
    });
  }

  // 4. CRITICAL LEAKS - Fix systemic issues
  const criticalLeaks = leaks.filter(l => l.severity === 'CRITICAL');
  for (const leak of criticalLeaks.slice(0, 2)) {
    actions.push({
      id: `fix_${leak.id}`,
      type: 'FIX_LEAK',
      priority: 85,
      urgency: 'TODAY',
      title: leak.title,
      description: leak.description,
      estimatedRevenue: leak.estimatedRevenue,
      timeToExecute: '1 hour',
      relatedId: leak.id
    });
  }

  // 5. FOLLOW-UPS DUE - Maintain momentum
  const followUpDeals = dealPriorities.filter(d => 
    d.scores?.decay >= 30 && d.scores?.decay < 70
  );
  for (const deal of followUpDeals.slice(0, 5)) {
    actions.push({
      id: `followup_${deal.dealId}`,
      type: 'FOLLOW_UP',
      priority: 70,
      urgency: 'TODAY',
      title: `Follow up: ${deal.dealName}`,
      description: `$${deal.value.toLocaleString()} - needs touch to maintain momentum`,
      estimatedRevenue: deal.expectedValue,
      timeToExecute: '10 min',
      relatedId: deal.dealId
    });
  }

  // 6. WARM LEADS - Build pipeline
  const warmLeads = leadScores.filter(l => l.tier === 'WARM');
  for (const lead of warmLeads.slice(0, 3)) {
    actions.push({
      id: `work_warm_${lead.leadId}`,
      type: 'WORK_LEAD',
      priority: 50,
      urgency: 'THIS_WEEK',
      title: `Work warm lead: ${getLeadName(lead.leadId, leads)}`,
      description: `Score ${lead.score}/100. Start outreach sequence.`,
      estimatedRevenue: 3000,
      timeToExecute: '10 min',
      relatedId: lead.leadId
    });
  }

  // Sort by priority
  actions.sort((a, b) => b.priority - a.priority);

  // Calculate totals
  const totalPotentialRevenue = actions.reduce((sum, a) => sum + a.estimatedRevenue, 0);
  const immediateActions = actions.filter(a => a.urgency === 'IMMEDIATE');
  const todayActions = actions.filter(a => a.urgency === 'TODAY');

  return {
    actions,
    nextBestAction: actions[0] || null,
    summary: {
      totalActions: actions.length,
      immediateCount: immediateActions.length,
      todayCount: todayActions.length,
      totalPotentialRevenue,
      estimatedTimeToComplete: calculateTotalTime(actions)
    },
    byUrgency: {
      immediate: immediateActions,
      today: todayActions,
      thisWeek: actions.filter(a => a.urgency === 'THIS_WEEK'),
      scheduled: actions.filter(a => a.urgency === 'SCHEDULED')
    },
    generatedAt: now.toISOString()
  };
}

/**
 * Get the single most important action right now
 */
export function getNextBestAction(data, now = new Date()) {
  const result = generateActions(data, now);
  
  if (!result.nextBestAction) {
    return {
      action: null,
      message: 'No immediate actions required. Pipeline is healthy.',
      suggestion: 'Focus on prospecting to build pipeline.'
    };
  }

  const action = result.nextBestAction;
  return {
    action,
    message: `${action.title} - ${action.description}`,
    revenue: action.estimatedRevenue,
    urgency: action.urgency,
    timeRequired: action.timeToExecute
  };
}

/**
 * Get rep-specific action list
 */
export function getRepActions(repId, data, now = new Date()) {
  // Filter data to this rep
  const repLeads = data.leads?.filter(l => l.assignedTo === repId) || [];
  const repDeals = data.deals?.filter(d => d.assignedTo === repId) || [];
  const repActivities = data.activities?.filter(a => a.performedBy === repId) || [];
  
  const repLeadScores = data.leadScores?.filter(s => 
    repLeads.some(l => l.id === s.leadId)
  ) || [];
  
  const repDealPriorities = data.dealPriorities?.filter(p => 
    repDeals.some(d => d.id === p.dealId)
  ) || [];

  const repLeaks = data.leaks?.filter(l => 
    l.metadata?.assignedTo === repId || l.relatedIds?.includes(repId)
  ) || [];

  return generateActions({
    leads: repLeads,
    deals: repDeals,
    activities: repActivities,
    leadScores: repLeadScores,
    dealPriorities: repDealPriorities,
    leaks: repLeaks
  }, now);
}

// ============================================
// HELPERS
// ============================================

function getLeadName(leadId, leads) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return `Lead #${leadId}`;
  return `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email || `Lead #${leadId}`;
}

function calculateTotalTime(actions) {
  const minutes = actions.reduce((sum, a) => {
    const time = a.timeToExecute || '10 min';
    const num = parseInt(time);
    if (time.includes('hour')) return sum + (num * 60);
    return sum + num;
  }, 0);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${minutes} min`;
}

export default { generateActions, getNextBestAction, getRepActions };
