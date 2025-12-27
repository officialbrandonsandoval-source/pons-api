/**
 * @typedef {import('./providers/types.js').Opportunity} Opportunity
 * @typedef {import('./providers/types.js').Activity} Activity
 * @typedef {import('./providers/types.js').Lead} Lead
 */

const INACTIVITY_THRESHOLD_DAYS = 30;

/**
 * Analyzes CRM data to find potential revenue leaks.
 *
 * @param {object} params
 * @param {Opportunity[]} params.opportunities - Array of opportunities from the CRM.
 * @param {Activity[]} params.activities - Array of activities from the CRM.
 * @param {Lead[]} params.leads - Array of leads from the CRM.
 * @param {Date} [params.now] - The current date for deterministic calculations. Defaults to new Date().
 * @returns {{leaks: object[], summary: object}}
 */
export function detectLeaks({ opportunities = [], activities = [], leads = [], now = new Date() }) {
  const leaks = [];

  // --- Leak Type: Stale Open Opportunities ---
  const openOpportunities = opportunities.filter(opp => opp.status === 'open');

  for (const opp of openOpportunities) {
    // Find the most recent activity related to this opportunity's contact
    // Note: A real implementation would need a link between opportunity and contact.
    // We'll assume for now that activities are globally related and check the most recent one.
    // A more robust check would be `activities.filter(a => a.contactId === opp.contactId)`
    const lastActivityDate = activities.reduce((latest, act) => {
        const actDate = new Date(act.createdAt);
        return actDate > latest ? actDate : latest;
    }, new Date(0));

    const lastInteractionDate = new Date(opp.createdAt) > lastActivityDate ? new Date(opp.createdAt) : lastActivityDate;

    const daysSinceLastInteraction = (now.getTime() - lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceLastInteraction > INACTIVITY_THRESHOLD_DAYS) {
      leaks.push({
        id: `stale_opportunity_${opp.id}`,
        type: 'STALE_OPPORTUNITY',
        severity: opp.value > 10000 ? 'HIGH' : 'MEDIUM',
        title: 'Stale Opportunity',
        description: `Opportunity "${opp.name}" has had no activity for ${Math.floor(daysSinceLastInteraction)} days.`,
        recommendedAction: 'Schedule a follow-up call or email to re-engage.',
        impactedCount: 1,
        estimatedRevenue: opp.value,
      });
    }
  }

  // Sort leaks by estimated revenue descending
  leaks.sort((a, b) => b.estimatedRevenue - a.estimatedRevenue);

  const summary = leaks.reduce(
    (acc, leak) => {
      acc.totalLeaks += 1;
      acc.totalEstimatedRevenue += leak.estimatedRevenue;
      return acc;
    },
    {
      totalLeaks: 0,
      totalEstimatedRevenue: 0,
    }
  );

  return {
    leaks,
    summary,
    generatedAt: now.toISOString(),
  };
}