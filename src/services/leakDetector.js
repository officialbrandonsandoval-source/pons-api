/**
 * PONS Leak Detector Service
 * Combines rule-based detection with AI-powered analysis
 */

import { LEAK_TYPES, THRESHOLDS } from '../types.js';
import { analyzeLeaks as aiAnalyze } from './gemini.js';

/**
 * Main leak detection function
 * @param {Object} params
 * @param {Array} params.opportunities
 * @param {Array} params.activities
 * @param {Array} params.leads
 * @param {Array} params.contacts
 * @param {Array} params.reps
 * @param {Date} params.now - Current date (for testing)
 * @param {boolean} params.includeAI - Whether to run AI analysis
 * @returns {Promise<Object>} Full analysis result
 */
export async function detectLeaks({
  opportunities = [],
  activities = [],
  leads = [],
  contacts = [],
  reps = [],
  now = new Date(),
  includeAI = true
}) {
  const leaks = [];
  const nowTime = now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const hourMs = 1000 * 60 * 60;

  // Build activity lookup by contact
  const activityByContact = new Map();
  for (const act of activities) {
    if (!activityByContact.has(act.contactId)) {
      activityByContact.set(act.contactId, []);
    }
    activityByContact.get(act.contactId).push(act);
  }

  // Build activity lookup by rep
  const activityByRep = new Map();
  for (const act of activities) {
    if (!activityByRep.has(act.performedBy)) {
      activityByRep.set(act.performedBy, []);
    }
    activityByRep.get(act.performedBy).push(act);
  }

  // ============================================
  // LEAK TYPE 1: Stale Opportunities
  // ============================================
  const openOpps = opportunities.filter(o => o.status === 'open');
  for (const opp of openOpps) {
    const contactActivities = activityByContact.get(opp.contactId) || [];
    const lastActivityDate = contactActivities.length > 0
      ? Math.max(...contactActivities.map(a => new Date(a.createdAt).getTime()))
      : new Date(opp.createdAt).getTime();
    
    const daysSinceActivity = Math.floor((nowTime - lastActivityDate) / dayMs);
    
    if (daysSinceActivity > THRESHOLDS.STALE_DAYS) {
      leaks.push({
        id: `stale_opp_${opp.id}`,
        type: LEAK_TYPES.STALE_OPPORTUNITY,
        severity: opp.value >= THRESHOLDS.CRITICAL_VALUE_DEAL ? 'CRITICAL' 
                : opp.value >= THRESHOLDS.HIGH_VALUE_DEAL ? 'HIGH' : 'MEDIUM',
        title: 'Stale Opportunity',
        description: `"${opp.name}" has had no activity for ${daysSinceActivity} days. Value: $${opp.value?.toLocaleString() || 0}`,
        recommendedAction: 'Schedule immediate follow-up call or send re-engagement email',
        impactedCount: 1,
        estimatedRevenue: opp.value || 0,
        relatedIds: [opp.id],
        metadata: { daysSinceActivity, assignedTo: opp.assignedTo }
      });
    }
  }

  // ============================================
  // LEAK TYPE 2: Untouched Leads
  // ============================================
  const newLeads = leads.filter(l => l.status === 'new' && !l.firstContactedAt);
  for (const lead of newLeads) {
    const daysSinceCreated = Math.floor((nowTime - new Date(lead.createdAt).getTime()) / dayMs);
    
    if (daysSinceCreated > 1) { // More than 24 hours
      leaks.push({
        id: `untouched_lead_${lead.id}`,
        type: LEAK_TYPES.UNTOUCHED_LEAD,
        severity: daysSinceCreated > 7 ? 'HIGH' : 'MEDIUM',
        title: 'Untouched Lead',
        description: `Lead "${lead.firstName} ${lead.lastName}" from ${lead.leadSource || 'unknown source'} has not been contacted in ${daysSinceCreated} days`,
        recommendedAction: 'Make first contact within 5 minutes of lead creation for 21x better conversion',
        impactedCount: 1,
        estimatedRevenue: 5000, // Assume average deal size
        relatedIds: [lead.id],
        metadata: { daysSinceCreated, leadSource: lead.leadSource, assignedTo: lead.assignedTo }
      });
    }
  }

  // ============================================
  // LEAK TYPE 3: Slow Response Time
  // ============================================
  for (const lead of leads) {
    if (lead.firstContactedAt && lead.createdAt) {
      const responseHours = (new Date(lead.firstContactedAt).getTime() - new Date(lead.createdAt).getTime()) / hourMs;
      
      if (responseHours > THRESHOLDS.RESPONSE_HOURS) {
        leaks.push({
          id: `slow_response_${lead.id}`,
          type: LEAK_TYPES.SLOW_RESPONSE,
          severity: responseHours > 72 ? 'HIGH' : 'MEDIUM',
          title: 'Slow Response Time',
          description: `Lead "${lead.firstName} ${lead.lastName}" took ${Math.floor(responseHours)} hours to get first contact`,
          recommendedAction: 'Set up speed-to-lead automation. Response within 5 min = 100x more likely to connect',
          impactedCount: 1,
          estimatedRevenue: 0, // Historical - can't recover
          relatedIds: [lead.id],
          metadata: { responseHours, assignedTo: lead.assignedTo }
        });
      }
    }
  }

  // ============================================
  // LEAK TYPE 4: Abandoned Deals
  // ============================================
  const abandonedOpps = opportunities.filter(o => o.status === 'abandoned' || o.status === 'lost');
  const recentAbandoned = abandonedOpps.filter(o => {
    const daysAgo = (nowTime - new Date(o.updatedAt).getTime()) / dayMs;
    return daysAgo <= 90; // Last 90 days
  });
  
  if (recentAbandoned.length > 0) {
    const totalValue = recentAbandoned.reduce((sum, o) => sum + (o.value || 0), 0);
    leaks.push({
      id: `abandoned_deals_batch`,
      type: LEAK_TYPES.ABANDONED_DEAL,
      severity: totalValue > 100000 ? 'HIGH' : 'MEDIUM',
      title: 'Abandoned Deals (Last 90 Days)',
      description: `${recentAbandoned.length} deals worth $${totalValue.toLocaleString()} were abandoned recently`,
      recommendedAction: 'Review lost reasons. Implement win-back campaign for deals lost to "no decision"',
      impactedCount: recentAbandoned.length,
      estimatedRevenue: Math.floor(totalValue * 0.1), // 10% recoverable
      relatedIds: recentAbandoned.map(o => o.id),
      metadata: { totalValue }
    });
  }

  // ============================================
  // LEAK TYPE 5: Missing Follow-Ups
  // ============================================
  for (const opp of openOpps) {
    const contactActivities = activityByContact.get(opp.contactId) || [];
    const lastActivity = contactActivities
      .filter(a => a.outcome === 'completed' || a.type === 'meeting')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    
    if (lastActivity) {
      const daysSince = Math.floor((nowTime - new Date(lastActivity.createdAt).getTime()) / dayMs);
      if (daysSince >= 7 && daysSince < THRESHOLDS.STALE_DAYS) {
        leaks.push({
          id: `missing_followup_${opp.id}`,
          type: LEAK_TYPES.MISSING_FOLLOW_UP,
          severity: 'MEDIUM',
          title: 'Missing Follow-Up',
          description: `"${opp.name}" had a ${lastActivity.type} ${daysSince} days ago but no follow-up scheduled`,
          recommendedAction: 'Schedule next touch within 48 hours of every interaction',
          impactedCount: 1,
          estimatedRevenue: opp.value || 0,
          relatedIds: [opp.id],
          metadata: { lastActivityType: lastActivity.type, daysSince }
        });
      }
    }
  }

  // ============================================
  // LEAK TYPE 6: Inactive Reps
  // ============================================
  const thirtyDaysAgo = nowTime - (30 * dayMs);
  for (const rep of reps) {
    if (!rep.active) continue;
    
    const repActivities = activityByRep.get(rep.id) || [];
    const recentActivities = repActivities.filter(a => new Date(a.createdAt).getTime() > thirtyDaysAgo);
    
    if (recentActivities.length < THRESHOLDS.MIN_WEEKLY_ACTIVITIES * 4) { // Less than 40 activities in 30 days
      const assignedOpps = openOpps.filter(o => o.assignedTo === rep.id);
      const atRisk = assignedOpps.reduce((sum, o) => sum + (o.value || 0), 0);
      
      if (assignedOpps.length > 0) {
        leaks.push({
          id: `inactive_rep_${rep.id}`,
          type: LEAK_TYPES.NO_ACTIVITY_REP,
          severity: atRisk > 50000 ? 'HIGH' : 'MEDIUM',
          title: 'Low Activity Rep',
          description: `${rep.name} has only ${recentActivities.length} activities in 30 days with $${atRisk.toLocaleString()} in open pipeline`,
          recommendedAction: 'Schedule 1:1 to identify blockers. Consider reassigning high-value deals',
          impactedCount: assignedOpps.length,
          estimatedRevenue: atRisk,
          relatedIds: [rep.id, ...assignedOpps.map(o => o.id)],
          metadata: { activityCount: recentActivities.length, openDeals: assignedOpps.length }
        });
      }
    }
  }

  // ============================================
  // LEAK TYPE 7: Unassigned Leads
  // ============================================
  const unassignedLeads = leads.filter(l => !l.assignedTo && l.status !== 'unqualified');
  if (unassignedLeads.length > 0) {
    leaks.push({
      id: `unassigned_leads_batch`,
      type: LEAK_TYPES.UNASSIGNED_LEAD,
      severity: unassignedLeads.length > 10 ? 'HIGH' : 'MEDIUM',
      title: 'Unassigned Leads',
      description: `${unassignedLeads.length} leads have no assigned rep`,
      recommendedAction: 'Enable round-robin assignment. Every minute unassigned = lower conversion',
      impactedCount: unassignedLeads.length,
      estimatedRevenue: unassignedLeads.length * 3000, // Conservative estimate
      relatedIds: unassignedLeads.map(l => l.id),
      metadata: {}
    });
  }

  // ============================================
  // LEAK TYPE 8: Dead Pipeline (No Movement)
  // ============================================
  const stuckOpps = openOpps.filter(opp => {
    const daysInStage = (nowTime - new Date(opp.updatedAt).getTime()) / dayMs;
    return daysInStage > 14; // Same stage for 2+ weeks
  });
  
  if (stuckOpps.length >= 3) {
    const stuckValue = stuckOpps.reduce((sum, o) => sum + (o.value || 0), 0);
    leaks.push({
      id: `dead_pipeline_batch`,
      type: LEAK_TYPES.DEAD_PIPELINE,
      severity: stuckValue > 100000 ? 'HIGH' : 'MEDIUM',
      title: 'Stuck Pipeline',
      description: `${stuckOpps.length} deals worth $${stuckValue.toLocaleString()} haven't moved stages in 14+ days`,
      recommendedAction: 'Implement stage-based SLAs. Deals stuck > 2 weeks need manager intervention',
      impactedCount: stuckOpps.length,
      estimatedRevenue: stuckValue,
      relatedIds: stuckOpps.map(o => o.id),
      metadata: { avgDaysStuck: Math.floor(stuckOpps.reduce((sum, o) => sum + (nowTime - new Date(o.updatedAt).getTime()) / dayMs, 0) / stuckOpps.length) }
    });
  }

  // ============================================
  // LEAK TYPE 9: Lost Without Reason
  // ============================================
  const lostNoReason = opportunities.filter(o => 
    o.status === 'lost' && (!o.lostReason || o.lostReason === 'unknown' || o.lostReason === '')
  );
  
  if (lostNoReason.length > 0) {
    const lostValue = lostNoReason.reduce((sum, o) => sum + (o.value || 0), 0);
    leaks.push({
      id: `lost_no_reason_batch`,
      type: LEAK_TYPES.LOST_WITHOUT_REASON,
      severity: 'MEDIUM',
      title: 'Lost Deals Missing Reason',
      description: `${lostNoReason.length} lost deals have no recorded loss reason. Can't fix what you don't measure`,
      recommendedAction: 'Require loss reason before deal can be marked lost. Review patterns monthly',
      impactedCount: lostNoReason.length,
      estimatedRevenue: 0,
      relatedIds: lostNoReason.map(o => o.id),
      metadata: { totalLostValue: lostValue }
    });
  }

  // ============================================
  // LEAK TYPE 10: High-Value Deals At Risk
  // ============================================
  const highValueAtRisk = openOpps.filter(opp => {
    if (opp.value < THRESHOLDS.HIGH_VALUE_DEAL) return false;
    const contactActivities = activityByContact.get(opp.contactId) || [];
    const daysSinceActivity = contactActivities.length > 0
      ? (nowTime - Math.max(...contactActivities.map(a => new Date(a.createdAt).getTime()))) / dayMs
      : (nowTime - new Date(opp.createdAt).getTime()) / dayMs;
    return daysSinceActivity > 7; // High value with no activity in 7+ days
  });

  for (const opp of highValueAtRisk) {
    leaks.push({
      id: `high_value_risk_${opp.id}`,
      type: LEAK_TYPES.HIGH_VALUE_AT_RISK,
      severity: opp.value >= THRESHOLDS.CRITICAL_VALUE_DEAL ? 'CRITICAL' : 'HIGH',
      title: 'High-Value Deal At Risk',
      description: `$${opp.value.toLocaleString()} deal "${opp.name}" showing signs of going cold`,
      recommendedAction: 'Manager should personally review. Consider executive outreach or special offer',
      impactedCount: 1,
      estimatedRevenue: opp.value,
      relatedIds: [opp.id],
      metadata: { assignedTo: opp.assignedTo, stage: opp.stage }
    });
  }

  // ============================================
  // Sort and Summarize
  // ============================================
  
  // Sort by severity then revenue
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  leaks.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.estimatedRevenue - a.estimatedRevenue;
  });

  // Calculate summary
  const summary = {
    totalLeaks: leaks.length,
    criticalCount: leaks.filter(l => l.severity === 'CRITICAL').length,
    highCount: leaks.filter(l => l.severity === 'HIGH').length,
    mediumCount: leaks.filter(l => l.severity === 'MEDIUM').length,
    lowCount: leaks.filter(l => l.severity === 'LOW').length,
    totalEstimatedRevenue: leaks.reduce((sum, l) => sum + l.estimatedRevenue, 0),
    byType: Object.values(LEAK_TYPES).reduce((acc, type) => {
      const typeLeaks = leaks.filter(l => l.type === type);
      if (typeLeaks.length > 0) {
        acc[type] = {
          count: typeLeaks.length,
          revenue: typeLeaks.reduce((sum, l) => sum + l.estimatedRevenue, 0)
        };
      }
      return acc;
    }, {})
  };

  // ============================================
  // AI Analysis (if enabled)
  // ============================================
  let aiInsights = null;
  if (includeAI) {
    const aiResult = await aiAnalyze({ opportunities, activities, leads, contacts });
    aiInsights = aiResult.insights;
  }

  return {
    leaks,
    summary,
    aiInsights,
    generatedAt: now.toISOString()
  };
}

/**
 * Calculate KPIs for each rep
 */
export function calculateRepKPIs({ opportunities, activities, reps, now = new Date() }) {
  const kpis = [];
  const nowTime = now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const weekAgo = nowTime - (7 * dayMs);
  const twoWeeksAgo = nowTime - (14 * dayMs);

  for (const rep of reps) {
    const repOpps = opportunities.filter(o => o.assignedTo === rep.id);
    const repActivities = activities.filter(a => a.performedBy === rep.id);
    
    const openOpps = repOpps.filter(o => o.status === 'open');
    const wonOpps = repOpps.filter(o => o.status === 'won');
    const lostOpps = repOpps.filter(o => o.status === 'lost');
    
    const closedOpps = [...wonOpps, ...lostOpps];
    const winRate = closedOpps.length > 0 ? (wonOpps.length / closedOpps.length) * 100 : 0;
    
    const totalRevenue = wonOpps.reduce((sum, o) => sum + (o.value || 0), 0);
    const avgDealSize = wonOpps.length > 0 ? totalRevenue / wonOpps.length : 0;
    
    // Activity trends
    const activitiesThisWeek = repActivities.filter(a => new Date(a.createdAt).getTime() > weekAgo).length;
    const activitiesLastWeek = repActivities.filter(a => {
      const time = new Date(a.createdAt).getTime();
      return time > twoWeeksAgo && time <= weekAgo;
    }).length;
    const activityTrend = activitiesLastWeek > 0 
      ? ((activitiesThisWeek - activitiesLastWeek) / activitiesLastWeek) * 100 
      : 0;

    // Stale deals
    const staleDeals = openOpps.filter(o => {
      const daysSince = (nowTime - new Date(o.updatedAt).getTime()) / dayMs;
      return daysSince > 30;
    }).length;

    kpis.push({
      repId: rep.id,
      repName: rep.name,
      totalOpportunities: repOpps.length,
      openOpportunities: openOpps.length,
      wonOpportunities: wonOpps.length,
      lostOpportunities: lostOpps.length,
      winRate: Math.round(winRate * 10) / 10,
      totalRevenue,
      avgDealSize: Math.round(avgDealSize),
      avgDaysToClose: 0, // Would need close date data
      activitiesThisWeek,
      activitiesLastWeek,
      activityTrend: Math.round(activityTrend),
      responseTime: 0, // Would need first contact data
      staleDeals
    });
  }

  return kpis.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export default {
  detectLeaks,
  calculateRepKPIs
};
