/**
 * PONS Deal Prioritization Engine
 * Ranks deals by expected ROI and urgency
 * Output: Ordered list of deals to work on NOW
 */

const WEIGHTS = {
  VALUE: 30,           // Deal size
  PROBABILITY: 25,     // Likelihood to close
  VELOCITY: 20,        // Speed/momentum
  DECAY: 15,           // Risk of losing
  EFFORT: 10           // Inverse of effort required
};

/**
 * Prioritize a single deal
 * @param {Object} deal
 * @param {Array} activities - Related activities
 * @param {Date} now
 * @returns {Object} Priority score and recommendation
 */
export function prioritizeDeal(deal, activities = [], now = new Date()) {
  const scores = {};
  
  // 1. VALUE SCORE (30 pts) - Weighted by deal size
  scores.value = scoreValue(deal.value);

  // 2. PROBABILITY SCORE (25 pts) - Stage-based + signals
  scores.probability = scoreProbability(deal, activities);

  // 3. VELOCITY SCORE (20 pts) - Is it moving?
  scores.velocity = scoreVelocity(deal, activities, now);

  // 4. DECAY SCORE (15 pts) - Risk of going cold
  scores.decay = scoreDecay(deal, activities, now);

  // 5. EFFORT SCORE (10 pts) - Inverse effort
  scores.effort = scoreEffort(deal, activities);

  // Calculate weighted total
  const priorityScore = 
    (scores.value / 100) * WEIGHTS.VALUE +
    (scores.probability / 100) * WEIGHTS.PROBABILITY +
    (scores.velocity / 100) * WEIGHTS.VELOCITY +
    (scores.decay / 100) * WEIGHTS.DECAY +
    (scores.effort / 100) * WEIGHTS.EFFORT;

  // Expected value = deal value * probability
  const expectedValue = deal.value * (scores.probability / 100);

  // Urgency based on decay
  const urgency = getUrgency(scores.decay, scores.velocity);

  return {
    dealId: deal.id,
    dealName: deal.name,
    value: deal.value,
    priorityScore: Math.round(priorityScore),
    expectedValue: Math.round(expectedValue),
    scores,
    urgency,
    recommendation: getRecommendation(scores, deal),
    scoredAt: now.toISOString()
  };
}

/**
 * Prioritize multiple deals
 * Returns ranked list with clear next actions
 */
export function prioritizeDeals(deals, activities = [], now = new Date()) {
  const activityByDeal = groupActivitiesByDeal(activities, deals);
  
  // Only score open deals
  const openDeals = deals.filter(d => d.status === 'open');
  
  const prioritized = openDeals.map(deal => {
    const dealActivities = activityByDeal.get(deal.id) || 
                          activityByDeal.get(deal.contactId) || [];
    return prioritizeDeal(deal, dealActivities, now);
  });

  // Sort by priority score descending
  prioritized.sort((a, b) => b.priorityScore - a.priorityScore);

  // Add rank
  prioritized.forEach((p, i) => p.rank = i + 1);

  // Calculate portfolio metrics
  const totalValue = prioritized.reduce((sum, p) => sum + p.value, 0);
  const totalExpected = prioritized.reduce((sum, p) => sum + p.expectedValue, 0);
  const urgentDeals = prioritized.filter(p => p.urgency === 'IMMEDIATE' || p.urgency === 'TODAY');

  return {
    deals: prioritized,
    summary: {
      totalDeals: prioritized.length,
      totalPipelineValue: totalValue,
      weightedPipelineValue: totalExpected,
      avgPriorityScore: Math.round(prioritized.reduce((sum, p) => sum + p.priorityScore, 0) / prioritized.length) || 0,
      urgentCount: urgentDeals.length,
      topDeal: prioritized[0] || null
    },
    focusList: prioritized.slice(0, 5).map(p => ({
      rank: p.rank,
      name: p.dealName,
      value: p.value,
      urgency: p.urgency,
      action: p.recommendation.action
    })),
    scoredAt: now.toISOString()
  };
}

// ============================================
// SCORING FUNCTIONS
// ============================================

function scoreValue(value) {
  if (!value || value <= 0) return 10;
  
  // Logarithmic scale to handle wide range
  // $1k = 30, $10k = 50, $50k = 70, $100k = 80, $500k = 95
  if (value >= 500000) return 100;
  if (value >= 100000) return 85;
  if (value >= 50000) return 70;
  if (value >= 25000) return 60;
  if (value >= 10000) return 50;
  if (value >= 5000) return 40;
  if (value >= 1000) return 30;
  return 20;
}

function scoreProbability(deal, activities) {
  let score = 50; // Base

  // Stage-based scoring
  const stage = (deal.stage || '').toLowerCase();
  const stageScores = {
    'closed': 100,
    'contract': 90,
    'negotiation': 80,
    'proposal': 70,
    'demo': 60,
    'qualified': 50,
    'discovery': 40,
    'lead': 25,
    'new': 20
  };

  for (const [key, val] of Object.entries(stageScores)) {
    if (stage.includes(key)) {
      score = val;
      break;
    }
  }

  // Engagement boost
  if (activities.length >= 5) score += 10;
  else if (activities.length >= 3) score += 5;

  // Multi-threading boost (multiple contacts)
  const uniqueContacts = new Set(activities.map(a => a.contactId)).size;
  if (uniqueContacts >= 3) score += 10;
  else if (uniqueContacts >= 2) score += 5;

  return Math.min(score, 100);
}

function scoreVelocity(deal, activities, now) {
  if (activities.length === 0) return 20;

  const nowTime = now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  
  // Sort activities by date
  const sorted = [...activities].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Recent activity score
  const lastActivityTime = new Date(sorted[0].createdAt).getTime();
  const daysSinceActivity = (nowTime - lastActivityTime) / dayMs;

  let score = 0;
  
  // Recency (max 50)
  if (daysSinceActivity <= 1) score += 50;
  else if (daysSinceActivity <= 3) score += 40;
  else if (daysSinceActivity <= 7) score += 25;
  else if (daysSinceActivity <= 14) score += 10;

  // Activity frequency in last 14 days (max 30)
  const recentActivities = activities.filter(a => {
    const age = (nowTime - new Date(a.createdAt).getTime()) / dayMs;
    return age <= 14;
  }).length;

  if (recentActivities >= 5) score += 30;
  else if (recentActivities >= 3) score += 20;
  else if (recentActivities >= 1) score += 10;

  // Stage progression (max 20)
  const hasProgressed = deal.stageChangedAt && 
    (nowTime - new Date(deal.stageChangedAt).getTime()) / dayMs <= 14;
  if (hasProgressed) score += 20;

  return Math.min(score, 100);
}

function scoreDecay(deal, activities, now) {
  // Higher score = MORE at risk (needs attention)
  const nowTime = now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;

  let riskScore = 0;

  // Days since last activity
  let daysSinceActivity = 999;
  if (activities.length > 0) {
    const lastActivity = Math.max(...activities.map(a => new Date(a.createdAt).getTime()));
    daysSinceActivity = (nowTime - lastActivity) / dayMs;
  }

  if (daysSinceActivity > 30) riskScore += 50;
  else if (daysSinceActivity > 14) riskScore += 35;
  else if (daysSinceActivity > 7) riskScore += 20;
  else if (daysSinceActivity > 3) riskScore += 10;

  // High value at risk multiplier
  if (deal.value >= 50000 && daysSinceActivity > 7) {
    riskScore += 25;
  }

  // Stuck in stage too long
  const daysInStage = deal.updatedAt ? 
    (nowTime - new Date(deal.updatedAt).getTime()) / dayMs : 30;
  
  if (daysInStage > 21) riskScore += 25;
  else if (daysInStage > 14) riskScore += 15;

  return Math.min(riskScore, 100);
}

function scoreEffort(deal, activities) {
  // Higher score = LESS effort needed (easier to close)
  let score = 50;

  // More activities = more invested = easier to continue
  if (activities.length >= 10) score += 25;
  else if (activities.length >= 5) score += 15;

  // Later stage = less effort to close
  const stage = (deal.stage || '').toLowerCase();
  if (stage.includes('contract') || stage.includes('negotiation')) score += 25;
  else if (stage.includes('proposal')) score += 15;
  else if (stage.includes('demo')) score += 5;

  return Math.min(score, 100);
}

// ============================================
// HELPERS
// ============================================

function getUrgency(decayScore, velocityScore) {
  if (decayScore >= 70) return 'IMMEDIATE';
  if (decayScore >= 50) return 'TODAY';
  if (decayScore >= 30 || velocityScore <= 20) return 'THIS_WEEK';
  return 'SCHEDULED';
}

function getRecommendation(scores, deal) {
  // High decay = needs rescue
  if (scores.decay >= 70) {
    return {
      action: 'RESCUE',
      message: `Deal going cold. Immediate outreach required.`,
      tactic: 'Call + email same day. Offer meeting or value-add.'
    };
  }

  // Low velocity = needs push
  if (scores.velocity <= 30) {
    return {
      action: 'ACCELERATE',
      message: `Deal stalled. Create urgency.`,
      tactic: 'Propose deadline, limited offer, or executive meeting.'
    };
  }

  // High probability = push to close
  if (scores.probability >= 70) {
    return {
      action: 'CLOSE',
      message: `Deal ready to close. Ask for the business.`,
      tactic: 'Send contract, schedule signing call, remove final objections.'
    };
  }

  // Default: advance
  return {
    action: 'ADVANCE',
    message: `Move deal forward.`,
    tactic: 'Schedule next milestone: demo, proposal review, or stakeholder meeting.'
  };
}

function groupActivitiesByDeal(activities, deals) {
  const map = new Map();
  
  // Create contact-to-deal mapping
  const contactToDeal = new Map();
  for (const deal of deals) {
    if (deal.contactId) contactToDeal.set(deal.contactId, deal.id);
  }

  for (const act of activities) {
    // Try direct deal ID first
    let dealId = act.dealId;
    
    // Fall back to contact mapping
    if (!dealId && act.contactId) {
      dealId = contactToDeal.get(act.contactId);
    }

    if (dealId) {
      if (!map.has(dealId)) map.set(dealId, []);
      map.get(dealId).push(act);
    }
  }

  return map;
}

export default { prioritizeDeal, prioritizeDeals };
