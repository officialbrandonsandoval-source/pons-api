/**
 * PONS API Type Definitions
 * These types are used across all CRM providers for unified data handling
 */

/**
 * @typedef {Object} Contact
 * @property {string} id - Unique identifier
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} [assignedTo] - Rep ID
 * @property {string} source - CRM source (ghl, hubspot, salesforce, webhook)
 * @property {string} createdAt - ISO date string
 * @property {string} updatedAt - ISO date string
 * @property {Object} [raw] - Original CRM data
 */

/**
 * @typedef {Object} Opportunity
 * @property {string} id
 * @property {string} name
 * @property {string} contactId
 * @property {string} [contactName]
 * @property {number} value - Dollar amount
 * @property {string} status - 'open' | 'won' | 'lost' | 'abandoned'
 * @property {string} stage - Pipeline stage
 * @property {string} [assignedTo] - Rep ID
 * @property {string} source
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [lastActivityAt]
 * @property {Object} [raw]
 */

/**
 * @typedef {Object} Activity
 * @property {string} id
 * @property {string} type - 'call' | 'email' | 'sms' | 'meeting' | 'note' | 'task'
 * @property {string} contactId
 * @property {string} [opportunityId]
 * @property {string} subject
 * @property {string} [body]
 * @property {string} [outcome] - 'completed' | 'no_answer' | 'left_voicemail' | 'scheduled'
 * @property {string} performedBy - Rep ID
 * @property {string} source
 * @property {string} createdAt
 * @property {Object} [raw]
 */

/**
 * @typedef {Object} Lead
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} status - 'new' | 'contacted' | 'qualified' | 'unqualified'
 * @property {string} [assignedTo]
 * @property {string} leadSource - Where the lead came from
 * @property {string} source
 * @property {string} createdAt
 * @property {string} [firstContactedAt]
 * @property {Object} [raw]
 */

/**
 * @typedef {Object} Rep
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} [phone]
 * @property {string} role - 'sales' | 'manager' | 'admin'
 * @property {boolean} active
 * @property {string} source
 */

/**
 * @typedef {Object} Leak
 * @property {string} id - Unique leak identifier
 * @property {string} type - Leak type code
 * @property {'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'} severity
 * @property {string} title - Human readable title
 * @property {string} description - Detailed description
 * @property {string} recommendedAction - What to do about it
 * @property {number} impactedCount - Number of records affected
 * @property {number} estimatedRevenue - Estimated dollar impact
 * @property {string[]} [relatedIds] - IDs of related records
 * @property {Object} [metadata] - Additional context
 */

/**
 * @typedef {Object} RepKPI
 * @property {string} repId
 * @property {string} repName
 * @property {number} totalOpportunities
 * @property {number} openOpportunities
 * @property {number} wonOpportunities
 * @property {number} lostOpportunities
 * @property {number} winRate - Percentage
 * @property {number} totalRevenue
 * @property {number} avgDealSize
 * @property {number} avgDaysToClose
 * @property {number} activitiesThisWeek
 * @property {number} activitiesLastWeek
 * @property {number} activityTrend - Percentage change
 * @property {number} responseTime - Avg hours to first contact
 * @property {number} staleDeals - Number of deals with no activity 30+ days
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {Leak[]} leaks
 * @property {RepKPI[]} repKPIs
 * @property {Object} summary
 * @property {string} aiInsights - Gemini-generated analysis
 * @property {string} generatedAt
 */

/**
 * @typedef {Object} ValidationResult
 * @property {'PASS' | 'FAIL' | 'HOLD'} status
 * @property {string[]} failures - List of validation failures
 * @property {string} recommendedAction
 * @property {Object} [metadata]
 */

/**
 * Leak type constants
 */
export const LEAK_TYPES = {
  STALE_OPPORTUNITY: 'STALE_OPPORTUNITY',
  UNTOUCHED_LEAD: 'UNTOUCHED_LEAD',
  SLOW_RESPONSE: 'SLOW_RESPONSE',
  ABANDONED_DEAL: 'ABANDONED_DEAL',
  MISSING_FOLLOW_UP: 'MISSING_FOLLOW_UP',
  NO_ACTIVITY_REP: 'NO_ACTIVITY_REP',
  UNASSIGNED_LEAD: 'UNASSIGNED_LEAD',
  DEAD_PIPELINE: 'DEAD_PIPELINE',
  LOST_WITHOUT_REASON: 'LOST_WITHOUT_REASON',
  HIGH_VALUE_AT_RISK: 'HIGH_VALUE_AT_RISK',
  QUOTE_NO_FOLLOW_UP: 'QUOTE_NO_FOLLOW_UP',
  GHOST_CUSTOMER: 'GHOST_CUSTOMER',
};

/**
 * Severity thresholds
 */
export const THRESHOLDS = {
  STALE_DAYS: 30,
  RESPONSE_HOURS: 24,
  HIGH_VALUE_DEAL: 10000,
  CRITICAL_VALUE_DEAL: 50000,
  MIN_WEEKLY_ACTIVITIES: 10,
};

export default {
  LEAK_TYPES,
  THRESHOLDS,
};
