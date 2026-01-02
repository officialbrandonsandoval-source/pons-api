/**
 * PONS Lead Scoring Engine
 * Scores leads 0-100 based on quality signals
 * Higher score = higher likelihood to convert to revenue
 */

const WEIGHTS = {
  SOURCE_QUALITY: 25,      // Where did they come from
  ENGAGEMENT: 25,          // How engaged are they
  RECENCY: 20,             // How fresh is the lead
  COMPLETENESS: 15,        // Data quality
  FIT: 15                  // Profile match
};

const SOURCE_SCORES = {
  'referral': 100,
  'demo_request': 95,
  'inbound_call': 90,
  'pricing_page': 85,
  'contact_form': 75,
  'webinar': 70,
  'content_download': 60,
  'linkedin': 55,
  'trade_show': 50,
  'paid_ads': 45,
  'cold_outbound': 30,
  'purchased_list': 15,
  'unknown': 25
};

/**
 * Score a single lead
 * @param {Object} lead
 * @param {Array} activities - Activities related to this lead
 * @param {Date} now - Current date
 * @returns {Object} { score, breakdown, tier, recommendation }
 */
export function scoreLead(lead, activities = [], now = new Date()) {
  const breakdown = {};
  
  // 1. SOURCE QUALITY (25 pts)
  const sourceKey = normalizeSource(lead.leadSource);
  const sourceScore = SOURCE_SCORES[sourceKey] || SOURCE_SCORES.unknown;
  breakdown.source = Math.round((sourceScore / 100) * WEIGHTS.SOURCE_QUALITY);

  // 2. ENGAGEMENT (25 pts)
  const engagementScore = calculateEngagement(lead, activities, now);
  breakdown.engagement = Math.round((engagementScore / 100) * WEIGHTS.ENGAGEMENT);

  // 3. RECENCY (20 pts)
  const recencyScore = calculateRecency(lead, now);
  breakdown.recency = Math.round((recencyScore / 100) * WEIGHTS.RECENCY);

  // 4. COMPLETENESS (15 pts)
  const completenessScore = calculateCompleteness(lead);
  breakdown.completeness = Math.round((completenessScore / 100) * WEIGHTS.COMPLETENESS);

  // 5. FIT (15 pts)
  const fitScore = calculateFit(lead);
  breakdown.fit = Math.round((fitScore / 100) * WEIGHTS.FIT);

  // Total score
  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  
  // Tier assignment
  const tier = getTier(score);
  
  // Action recommendation
  const recommendation = getRecommendation(score, breakdown, lead);

  return {
    leadId: lead.id,
    score,
    tier,
    breakdown,
    recommendation,
    scoredAt: now.toISOString()
  };
}

/**
 * Score multiple leads and rank them
 */
export function scoreLeads(leads, activities = [], now = new Date()) {
  const activityByLead = groupActivitiesByLead(activities);
  
  const scored = leads.map(lead => {
    const leadActivities = activityByLead.get(lead.id) || [];
    return scoreLead(lead, leadActivities, now);
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Add rank
  scored.forEach((s, i) => s.rank = i + 1);

  return {
    leads: scored,
    summary: {
      total: scored.length,
      hot: scored.filter(s => s.tier === 'HOT').length,
      warm: scored.filter(s => s.tier === 'WARM').length,
      cold: scored.filter(s => s.tier === 'COLD').length,
      dead: scored.filter(s => s.tier === 'DEAD').length,
      avgScore: Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length) || 0
    },
    scoredAt: now.toISOString()
  };
}

// ============================================
// SCORING FUNCTIONS
// ============================================

function calculateEngagement(lead, activities, now) {
  if (activities.length === 0) return 10;
  
  const nowTime = now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  
  let score = 0;
  
  // Activity count (max 40 pts)
  const activityCount = activities.length;
  if (activityCount >= 10) score += 40;
  else if (activityCount >= 5) score += 30;
  else if (activityCount >= 3) score += 20;
  else if (activityCount >= 1) score += 10;

  // Recent activity (max 30 pts)
  const lastActivity = Math.max(...activities.map(a => new Date(a.createdAt).getTime()));
  const daysSinceActivity = (nowTime - lastActivity) / dayMs;
  if (daysSinceActivity <= 1) score += 30;
  else if (daysSinceActivity <= 3) score += 25;
  else if (daysSinceActivity <= 7) score += 15;
  else if (daysSinceActivity <= 14) score += 5;

  // Response to outreach (max 30 pts)
  const hasResponse = activities.some(a => 
    a.direction === 'inbound' || 
    a.type === 'reply' || 
    a.outcome === 'responded'
  );
  if (hasResponse) score += 30;

  return Math.min(score, 100);
}

function calculateRecency(lead, now) {
  const createdAt = new Date(lead.createdAt).getTime();
  const daysSinceCreated = (now.getTime() - createdAt) / (1000 * 60 * 60 * 24);

  if (daysSinceCreated <= 1) return 100;
  if (daysSinceCreated <= 3) return 85;
  if (daysSinceCreated <= 7) return 70;
  if (daysSinceCreated <= 14) return 50;
  if (daysSinceCreated <= 30) return 30;
  if (daysSinceCreated <= 60) return 15;
  return 5;
}

function calculateCompleteness(lead) {
  let score = 0;
  const fields = [
    { key: 'email', weight: 30 },
    { key: 'phone', weight: 25 },
    { key: 'firstName', weight: 15 },
    { key: 'lastName', weight: 10 },
    { key: 'company', weight: 10 },
    { key: 'title', weight: 10 }
  ];

  for (const field of fields) {
    if (lead[field.key] && lead[field.key].trim() !== '') {
      score += field.weight;
    }
  }

  return score;
}

function calculateFit(lead) {
  let score = 50; // Base score

  // Title signals
  const title = (lead.title || '').toLowerCase();
  if (title.includes('owner') || title.includes('ceo') || title.includes('president')) {
    score += 30;
  } else if (title.includes('director') || title.includes('vp') || title.includes('head')) {
    score += 20;
  } else if (title.includes('manager')) {
    score += 10;
  }

  // Company size signals (if available)
  if (lead.companySize) {
    if (lead.companySize >= 50) score += 20;
    else if (lead.companySize >= 10) score += 10;
  }

  return Math.min(score, 100);
}

// ============================================
// HELPERS
// ============================================

function normalizeSource(source) {
  if (!source) return 'unknown';
  const s = source.toLowerCase().replace(/[^a-z]/g, '_');
  
  // Map common variations
  if (s.includes('referral')) return 'referral';
  if (s.includes('demo')) return 'demo_request';
  if (s.includes('pricing')) return 'pricing_page';
  if (s.includes('webinar')) return 'webinar';
  if (s.includes('linkedin')) return 'linkedin';
  if (s.includes('trade') || s.includes('show') || s.includes('event')) return 'trade_show';
  if (s.includes('paid') || s.includes('ads') || s.includes('ppc')) return 'paid_ads';
  if (s.includes('cold') || s.includes('outbound')) return 'cold_outbound';
  if (s.includes('form') || s.includes('contact')) return 'contact_form';
  if (s.includes('content') || s.includes('download') || s.includes('ebook')) return 'content_download';
  
  return 'unknown';
}

function getTier(score) {
  if (score >= 75) return 'HOT';
  if (score >= 50) return 'WARM';
  if (score >= 25) return 'COLD';
  return 'DEAD';
}

function getRecommendation(score, breakdown, lead) {
  if (score >= 75) {
    return {
      action: 'CALL_NOW',
      urgency: 'IMMEDIATE',
      message: 'High-value lead. Call within 5 minutes for 21x better connection rate.'
    };
  }
  
  if (score >= 50) {
    if (breakdown.engagement < 10) {
      return {
        action: 'MULTI_TOUCH',
        urgency: 'TODAY',
        message: 'Good lead, low engagement. Start 3-touch sequence: call, email, LinkedIn.'
      };
    }
    return {
      action: 'FOLLOW_UP',
      urgency: 'TODAY',
      message: 'Warm lead. Schedule discovery call.'
    };
  }
  
  if (score >= 25) {
    if (breakdown.completeness < 8) {
      return {
        action: 'ENRICH',
        urgency: 'THIS_WEEK',
        message: 'Missing data. Enrich before outreach.'
      };
    }
    return {
      action: 'NURTURE',
      urgency: 'THIS_WEEK',
      message: 'Add to nurture sequence. Not ready for sales touch.'
    };
  }
  
  return {
    action: 'DISQUALIFY',
    urgency: 'NONE',
    message: 'Low quality lead. Review for disqualification.'
  };
}

function groupActivitiesByLead(activities) {
  const map = new Map();
  for (const act of activities) {
    const leadId = act.leadId || act.contactId;
    if (!map.has(leadId)) map.set(leadId, []);
    map.get(leadId).push(act);
  }
  return map;
}

export default { scoreLead, scoreLeads };
