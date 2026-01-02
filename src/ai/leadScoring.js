/**
 * PONS Lead Scoring Engine
 * Score = f(source quality, engagement, recency, fit)
 * 
 * Output: 0-100 score with breakdown
 */

// Source quality weights (higher = better)
const SOURCE_WEIGHTS = {
  'referral': 95,
  'demo_request': 90,
  'inbound_call': 85,
  'pricing_page': 80,
  'contact_form': 75,
  'webinar': 70,
  'content_download': 60,
  'website': 50,
  'trade_show': 45,
  'cold_outbound': 30,
  'purchased_list': 20,
  'unknown': 40
};

// Engagement scoring factors
const ENGAGEMENT_WEIGHTS = {
  meeting_scheduled: 25,
  meeting_completed: 30,
  email_replied: 15,
  call_connected: 20,
  proposal_viewed: 20,
  pricing_discussed: 25,
  demo_completed: 30,
  email_opened: 5,
  link_clicked: 10
};

/**
 * Score a single lead
 * @param {Object} lead - Lead object
 * @param {Array} activities - Activities for this lead
 * @param {Object} options - Scoring options
 * @returns {Object} Score breakdown
 */
export function scoreLead(lead, activities = [], options = {}) {
  const now = options.now || new Date();
  const scores = {
    source: 0,
    engagement: 0,
    recency: 0,
    fit: 0,
    total: 0
  };

  // 1. SOURCE QUALITY (0-25 points)
  const sourceKey = normalizeSource(lead.leadSource);
  const sourceWeight = SOURCE_WEIGHTS[sourceKey] || SOURCE_WEIGHTS.unknown;
  scores.source = Math.round((sourceWeight / 100) * 25);

  // 2. ENGAGEMENT (0-30 points)
  let engagementPoints = 0;
  const activityTypes = new Set();
  
  for (const activity of activities) {
    const type = activity.type?.toLowerCase() || '';
    const outcome = activity.outcome?.toLowerCase() || '';
    
    if (type === 'meeting' && outcome === 'completed') {
      engagementPoints += ENGAGEMENT_WEIGHTS.meeting_completed;
      activityTypes.add('meeting_completed');
    } else if (type === 'meeting') {
      engagementPoints += ENGAGEMENT_WEIGHTS.meeting_scheduled;
      activityTypes.add('meeting_scheduled');
    } else if (type === 'call' && outcome === 'connected') {
      engagementPoints += ENGAGEMENT_WEIGHTS.call_connected;
      activityTypes.add('call_connected');
    } else if (type === 'email' && outcome === 'replied') {
      engagementPoints += ENGAGEMENT_WEIGHTS.email_replied;
      activityTypes.add('email_replied');
    } else if (type === 'demo') {
      engagementPoints += ENGAGEMENT_WEIGHTS.demo_completed;
      activityTypes.add('demo_completed');
    } else if (type === 'email') {
      engagementPoints += ENGAGEMENT_WEIGHTS.email_opened;
    }
  }
  
  // Cap engagement at 30
  scores.engagement = Math.min(30, engagementPoints);

  // 3. RECENCY (0-25 points)
  // More recent = higher score
  const createdAt = new Date(lead.createdAt);
  const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
  // Last activity matters more
  let daysSinceLastActivity = daysSinceCreated;
  if (activities.length > 0) {
    const lastActivity = activities.reduce((latest, a) => {
      const aDate = new Date(a.createdAt);
      return aDate > latest ? aDate : latest;
    }, new Date(0));
    daysSinceLastActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
  }

  if (daysSinceLastActivity <= 1) scores.recency = 25;
  else if (daysSinceLastActivity <= 3) scores.recency = 22;
  else if (daysSinceLastActivity <= 7) scores.recency = 18;
  else if (daysSinceLastActivity <= 14) scores.recency = 14;
  else if (daysSinceLastActivity <= 30) scores.recency = 10;
  else if (daysSinceLastActivity <= 60) scores.recency = 5;
  else scores.recency = 2;

  // 4. FIT (0-20 points)
  // Based on data completeness and qualification signals
  let fitPoints = 0;
  
  if (lead.email && lead.email.includes('@')) fitPoints += 4;
  if (lead.phone) fitPoints += 3;
  if (lead.company || lead.companyName) fitPoints += 4;
  if (lead.title || lead.jobTitle) fitPoints += 3;
  if (lead.budget || lead.estimatedValue) fitPoints += 3;
  if (lead.timeline || lead.expectedCloseDate) fitPoints += 3;
  
  scores.fit = Math.min(20, fitPoints);

  // TOTAL
  scores.total = scores.source + scores.engagement + scores.recency + scores.fit;

  // Grade
  let grade = 'D';
  if (scores.total >= 80) grade = 'A';
  else if (scores.total >= 65) grade = 'B';
  else if (scores.total >= 50) grade = 'C';

  return {
    leadId: lead.id,
    score: scores.total,
    grade,
    breakdown: scores,
    signals: {
      source: sourceKey,
      activityTypes: Array.from(activityTypes),
      daysSinceLastActivity,
      hasEmail: !!lead.email,
      hasPhone: !!lead.phone
    },
    priority: scores.total >= 70 ? 'HIGH' : scores.total >= 50 ? 'MEDIUM' : 'LOW'
  };
}

/**
 * Score all leads and return sorted by priority
 */
export function scoreAllLeads(leads, activities, options = {}) {
  // Build activity lookup by contact/lead ID
  const activityByLead = new Map();
  for (const activity of activities) {
    const id = activity.contactId || activity.leadId;
    if (!activityByLead.has(id)) {
      activityByLead.set(id, []);
    }
    activityByLead.get(id).push(activity);
  }

  // Score each lead
  const scored = leads.map(lead => {
    const leadActivities = activityByLead.get(lead.id) || [];
    return scoreLead(lead, leadActivities, options);
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Summary stats
  const summary = {
    total: scored.length,
    highPriority: scored.filter(s => s.priority === 'HIGH').length,
    mediumPriority: scored.filter(s => s.priority === 'MEDIUM').length,
    lowPriority: scored.filter(s => s.priority === 'LOW').length,
    avgScore: scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length) : 0,
    gradeDistribution: {
      A: scored.filter(s => s.grade === 'A').length,
      B: scored.filter(s => s.grade === 'B').length,
      C: scored.filter(s => s.grade === 'C').length,
      D: scored.filter(s => s.grade === 'D').length
    }
  };

  return { leads: scored, summary };
}

/**
 * Normalize source string to key
 */
function normalizeSource(source) {
  if (!source) return 'unknown';
  const s = source.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  if (s.includes('referral') || s.includes('refer')) return 'referral';
  if (s.includes('demo')) return 'demo_request';
  if (s.includes('inbound') || s.includes('phone')) return 'inbound_call';
  if (s.includes('pricing')) return 'pricing_page';
  if (s.includes('contact') || s.includes('form')) return 'contact_form';
  if (s.includes('webinar') || s.includes('event')) return 'webinar';
  if (s.includes('download') || s.includes('content') || s.includes('ebook')) return 'content_download';
  if (s.includes('website') || s.includes('web') || s.includes('organic')) return 'website';
  if (s.includes('trade') || s.includes('show') || s.includes('conference')) return 'trade_show';
  if (s.includes('cold') || s.includes('outbound')) return 'cold_outbound';
  if (s.includes('list') || s.includes('purchased')) return 'purchased_list';
  
  return 'unknown';
}

export default { scoreLead, scoreAllLeads };
