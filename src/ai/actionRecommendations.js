/**
 * PONS Action Recommendations Engine
 * Generates specific, actionable recommendations with revenue impact
 */

/**
 * Generate action recommendations from analysis data
 */
export function generateRecommendations(data, options = {}) {
  const {
    leaks = [],
    leadScores = { leads: [] },
    dealPriority = { deals: [] },
    wastedEffort = {}
  } = data;

  const recommendations = [];

  // 1. Critical leak actions
  for (const leak of leaks.filter(l => l.severity === 'CRITICAL')) {
    recommendations.push({
      id: `rec_${leak.id}`,
      priority: 1,
      type: 'CRITICAL_LEAK',
      action: leak.recommendedAction,
      reason: leak.description,
      revenueImpact: leak.estimatedRevenue,
      timeframe: 'Today',
      category: 'Revenue Protection'
    });
  }

  // 2. High-value deal actions
  const criticalDeals = dealPriority.deals?.filter(d => d.priority === 'CRITICAL') || [];
  for (const deal of criticalDeals.slice(0, 3)) {
    recommendations.push({
      id: `rec_deal_${deal.dealId}`,
      priority: 2,
      type: 'DEAL_ACTION',
      action: deal.nextAction.action,
      reason: `${deal.dealName} - $${deal.value.toLocaleString()} at ${deal.stage}`,
      revenueImpact: deal.value,
      timeframe: 'This Week',
      category: 'Deal Acceleration'
    });
  }

  // 3. Hot lead engagement
  const hotLeads = leadScores.leads?.filter(l => l.grade === 'A') || [];
  if (hotLeads.length > 0) {
    recommendations.push({
      id: 'rec_hot_leads',
      priority: 3,
      type: 'LEAD_ENGAGEMENT',
      action: `Engage ${hotLeads.length} hot leads immediately`,
      reason: 'High-score leads ready for conversion',
      revenueImpact: hotLeads.length * 12000,
      timeframe: 'Today',
      category: 'Lead Conversion'
    });
  }

  // 4. Stale pipeline cleanup
  const staleDeals = dealPriority.deals?.filter(d => d.breakdown.decayPenalty <= -15) || [];
  if (staleDeals.length > 0) {
    const staleValue = staleDeals.reduce((sum, d) => sum + d.value, 0);
    recommendations.push({
      id: 'rec_stale_pipeline',
      priority: 4,
      type: 'PIPELINE_CLEANUP',
      action: `Review ${staleDeals.length} stale deals - close or re-engage`,
      reason: `$${staleValue.toLocaleString()} sitting idle in pipeline`,
      revenueImpact: staleValue,
      timeframe: 'This Week',
      category: 'Pipeline Health'
    });
  }

  // 5. Wasted effort correction
  if (wastedEffort.wastedPercentage > 15) {
    recommendations.push({
      id: 'rec_wasted_effort',
      priority: 5,
      type: 'PROCESS_IMPROVEMENT',
      action: 'Review activity targeting - high wasted effort detected',
      reason: `${wastedEffort.wastedPercentage}% of activities on dead/unresponsive contacts`,
      revenueImpact: 0,
      timeframe: 'This Week',
      category: 'Efficiency'
    });
  }

  // Sort by priority
  recommendations.sort((a, b) => a.priority - b.priority);

  return {
    recommendations,
    summary: {
      total: recommendations.length,
      criticalActions: recommendations.filter(r => r.priority === 1).length,
      totalRevenueImpact: recommendations.reduce((sum, r) => sum + r.revenueImpact, 0)
    },
    generatedAt: new Date().toISOString()
  };
}

/**
 * Get single most important action
 */
export function getTopAction(data) {
  const { recommendations } = generateRecommendations(data);
  
  if (recommendations.length === 0) {
    return {
      action: 'All clear - maintain current momentum',
      reason: 'No urgent actions identified',
      revenueImpact: 0
    };
  }

  return recommendations[0];
}

/**
 * Generate "What will hurt revenue if ignored?" report
 */
export function getIgnoreRisks(data) {
  const {
    leaks = [],
    dealPriority = { deals: [] }
  } = data;

  const risks = [];

  // Critical leaks
  for (const leak of leaks.filter(l => l.severity === 'CRITICAL' || l.severity === 'HIGH')) {
    risks.push({
      risk: leak.title,
      description: leak.description,
      revenueAtRisk: leak.estimatedRevenue,
      daysToImpact: leak.severity === 'CRITICAL' ? 7 : 14,
      mitigation: leak.recommendedAction
    });
  }

  // Stale high-value deals
  const staleHighValue = (dealPriority.deals || [])
    .filter(d => d.value >= 50000 && d.breakdown.decayPenalty <= -10);
  
  for (const deal of staleHighValue) {
    risks.push({
      risk: `${deal.dealName} going cold`,
      description: `$${deal.value.toLocaleString()} deal with no recent activity`,
      revenueAtRisk: deal.value,
      daysToImpact: 7,
      mitigation: deal.nextAction.action
    });
  }

  // Sort by revenue at risk
  risks.sort((a, b) => b.revenueAtRisk - a.revenueAtRisk);

  const totalRisk = risks.reduce((sum, r) => sum + r.revenueAtRisk, 0);

  return {
    risks,
    totalRevenueAtRisk: totalRisk,
    criticalRisks: risks.filter(r => r.daysToImpact <= 7).length,
    generatedAt: new Date().toISOString()
  };
}

export default { generateRecommendations, getTopAction, getIgnoreRisks };
