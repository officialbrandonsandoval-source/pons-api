const INACTIVITY_THRESHOLD_DAYS = 7;

/**
 * Ingests CRM data and identifies potential leaks.
 * @param {object} crmData - An object containing leads, opportunities, and activities.
 * @returns {Array} - An array of leak objects.
 */
export function detectLeaks(crmData) {
    const { opportunities } = crmData;
    const leaks = [];
    const now = new Date();

    opportunities.forEach(opp => {
        const daysSinceLastInteraction = (now - new Date(opp.lastInteraction)) / (1000 * 60 * 60 * 24);

        if (daysSinceLastInteraction > INACTIVITY_THRESHOLD_DAYS) {
            const revenue_at_risk = opp.value;
            // Priority score: higher for more value and longer inactivity
            const priority_score = (revenue_at_risk / 1000) + (daysSinceLastInteraction - INACTIVITY_THRESHOLD_DAYS);

            leaks.push({
                id: `stale_opportunity_${opp.id}`,
                severity: "CRITICAL",
                revenue_at_risk,
                cause: `Opportunity '${opp.id}' has been inactive for ${Math.floor(daysSinceLastInteraction)} days.`,
                recommended_action: "Review opportunity and schedule a follow-up activity immediately.",
                priority_score: Math.round(priority_score),
            });
        }
    });

    return leaks;
}