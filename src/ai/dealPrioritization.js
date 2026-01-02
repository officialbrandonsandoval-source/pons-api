/**
 * PONS Deal Prioritization Engine
 * Rank = f(value, probability, velocity, decay)
 * 
 * Output: Prioritized deal list with recommended actions
 */

// Stage probability defaults (can be overridden)
const DEFAULT_STAGE_PROBABILITY = {
  'lead': 0.10,
  'qualified': 0.20,
  'discovery': 0.30,
  'demo': 0.40,
  'proposal': 0.50,
  'negotiation': 0.70,
  'verbal_commit': 0.85,
  'closed_won': 1.0,
  'closed_lost': 0,
  'won': 1.0,
  'lost': 0
};

// Velocity thresholds (days)
const VELOCITY_THRESHOLDS = {
  fast: 14,      // < 14 days = fast
  normal: 30,    // 14-30 days = normal
  slow: 60,      // 30-60 days = slow
  stalled: 90    // > 90 days = stalled
};

// Action recommendations by situation
const ACTIONS = {
  high_value_stalled: 'Executive outreach required. Schedule strategy call with decision maker.',
  high_value_no_activity: 'Critical: Re-engage immediately. Send value-add content or schedule check-in.',
  medium_value_stuck: 'Pipeline velocity issue. Identify blockers and create urgency.',
  closing_soon: 'Focus on closing. Remove remaining objections and confirm timeline.',
  early_stage_high_value: 'Accelerate discovery. Book demo within 48 hours.',
  low_engagement: 'Qualification needed. Confirm budget, authority, need, timeline.',
  competitor_risk: 'Competitive situation. Differentiate value and accelerate timeline.',
  default: 'Standard follow-up. Maintain momentum with regular touchpoints.'
};

/**
 * Calculate priority score for a single deal
 * @param {Object} deal - Deal/opportunity object
 * @param {Array} activities - Activities for this deal
 * @param {Object} options - Scoring options
 */
export function prioritizeDeal(deal, activities = [], options = {}) {
  const now = options.now || new Date();
  const stageProbs = options.stageProbabilities || DEFAULT_STAGE_PROBABILITY;
  
  const scores = {
    value: 0,           // 0-30 points
    probability: 0,     // 0-25 points
    velocity: 0,        // 0-25 points
    decay: 0,           // 0-20 points (negative factor)
    total: 0
  };

  // 1. VALUE SCORE (0-30 points)
  // Higher value = higher priority
  const value = deal.value || 0;
  if (value >= 100000) scores.value = 30;
  else if (value >= 50000) scores.value = 25;
  else if (value >= 25000) scores.value = 20;
  else if (value >= 10000) scores.value = 15;
  else if (value >= 5000) scores.value = 10;
  else scores.value = 5;

  // 2. PROBABILITY SCORE (0-25 points)
  // Based on stage
  const stage = deal.stage?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'lead';
  const probability = stageProbs[stage] || 0.3;
  scores.probability = Math.round(probability * 25);

  // 3. VELOCITY SCORE (0-25 points)
  // How fast is this deal moving?
  const createdAt = new Date(deal.createdAt);
  const daysInPipeline = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate expected days based on stage
  const expectedDays = {
    'lead': 7,
    'qualified': 14,
    'discovery': 21,
    'demo': 30,
    'proposal': 45,
    'negotiation': 60
  }[stage] || 30;

  const velocityRatio = expectedDays / Math.max(daysInPipeline, 1);
  if (velocityRatio >= 1.5) scores.velocity = 25;      // Ahead of schedule
  else if (velocityRatio >= 1.0) scores.velocity = 20; // On track
  else if (velocityRatio >= 0.7) scores.velocity = 15; // Slightly behind
  else if (velocityRatio >= 0.5) scores.velocity = 10; // Behind
  else scores.velocity = 5;                             // Way behind

  // 4. DECAY SCORE (0-20 points, reduces total)
  // Penalize deals with no recent activity
  let daysSinceActivity = daysInPipeline;
  if (activities.length > 0) {
    const lastActivity = activities.reduce((latest, a) => {
      const aDate = new Date(a.createdAt);
      return aDate > latest ? aDate : latest;
    }, new Date(0));
    daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  }

  if (daysSinceActivity <= 3) scores.decay = 0;
  else if (daysSinceActivity <= 7) scores.decay = 5;
  else if (daysSinceActivity <= 14) scores.decay = 10;
  else if (daysSinceActivity <= 30) scores.decay = 15;
  else scores.decay = 20;

  // TOTAL (max 100, decay subtracts)
  scores.total = Math.max(0, scores.value + scores.probability + scores.velocity - scores.decay);

  // Determine recommended action
  let action = ACTIONS.default;
  const isHighValue = value >= 50000;
  const isStalled = daysSinceActivity > 14;
  const isClosing = probability >= 0.7;
  const isEarlyStage = probability <= 0.3;

  if (isHighValue && daysSinceActivity > 7) {
    action = ACTIONS.high_value_no_activity;
  } else if (isHighValue && daysInPipeline > 60) {
    action = ACTIONS.high_value_stalled;
  } else if (isClosing) {
    action = ACTIONS.closing_soon;
  } else if (isEarlyStage && isHighValue) {
    action = ACTIONS.early_stage_high_value;
  } else if (isStalled) {
    action = ACTIONS.medium_value_stuck;
  } else if (activities.length < 3) {
    action = ACTIONS.low_engagement;
  }

  // Priority tier
  let priority = 'LOW';
  if (scores.total >= 70) priority = 'CRITICAL';
  else if (scores.total >= 55) priority = 'HIGH';
  else if (scores.total >= 40) priority = 'MEDIUM';

  // Expected value (value * probability)
  const expectedValue = Math.round(value * probability);

  return {
    dealId: deal.id,
    dealName: deal.name,
    score: scores.total,
    priority,
    breakdown: scores,
    metrics: {
      value,
      stage,
      probability: Math.round(probability * 100),
      daysInPipeline,
      daysSinceActivity,
      expectedValue,
      activityCount: activities.length
    },
    recommendedAction: action,
    flags: {
      isHighValue,
      isStalled,
      isClosing,
      needsAttention: isHighValue && isStalled
    }
  };
}

/**
 * Prioritize all deals and return sorted list
 */
export function prioritizeAllDeals(deals, activities, options = {}) {
  // Filter to open deals only
  const openDeals = deals.filter(d => 
    d.status === 'open' || 
    (!d.status && d.stage && !['won', 'lost', 'closed_won', 'closed_lost'].includes(d.stage?.toLowerCase()))
  );

  // Build activity lookup
  const activityByDeal = new Map();
  for (const activity of activities) {
    const id = activity.contactId || activity.dealId || activity.opportunityId;
    if (!activityByDeal.has(id)) {
      activityByDeal.set(id, []);
    }
    activityByDeal.get(id).push(activity);
  }

  // Score each deal
  const prioritized = openDeals.map(deal => {
    const dealActivities = activityByDeal.get(deal.contactId) || activityByDeal.get(deal.id) || [];
    return prioritizeDeal(deal, dealActivities, options);
  });

  // Sort by score descending
  prioritized.sort((a, b) => b.score - a.score);

  // Summary
  const summary = {
    totalDeals: prioritized.length,
    totalValue: prioritized.reduce((sum, d) => sum + d.metrics.value, 0),
    totalExpectedValue: prioritized.reduce((sum, d) => sum + d.metrics.expectedValue, 0),
    priorityDistribution: {
      critical: prioritized.filter(d => d.priority === 'CRITICAL').length,
      high: prioritized.filter(d => d.priority === 'HIGH').length,
      medium: prioritized.filter(d => d.priority === 'MEDIUM').length,
      low: prioritized.filter(d => d.priority === 'LOW').length
    },
    needsAttention: prioritized.filter(d => d.flags.needsAttention).length,
    avgScore: prioritized.length > 0 
      ? Math.round(prioritized.reduce((sum, d) => sum + d.score, 0) / prioritized.length) 
      : 0
  };

  return { deals: prioritized, summary };
}

/**
 * Get top N deals to focus on right now
 */
export function getTopDeals(deals, activities, n = 5, options = {}) {
  const { deals: prioritized } = prioritizeAllDeals(deals, activities, options);
  return prioritized.slice(0, n);
}

export default { prioritizeDeal, prioritizeAllDeals, getTopDeals };
