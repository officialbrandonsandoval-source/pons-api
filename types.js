/**
 * @typedef {object} Lead
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} phone
 * @property {string} createdAt
 */

/**
 * @typedef {object} Deal
 * @property {string} id
 * @property {string} name
 * @property {number} value
 * @property {'open' | 'won' | 'lost'} status
 * @property {string} createdAt
 * @property {string | null} closedAt
 * @property {string} contactId - The ID of the associated contact/lead.
 */

/**
 * @typedef {object} Activity
 * @property {string} id
 * @property {string} type - e.g., 'call', 'email', 'meeting'
 * @property {string} subject
 * @property {string} createdAt
 * @property {string} contactId
 */

/**
 * @typedef {object} CRMClient
 * @property {() => Promise<Lead[]>} fetchLeads
 * @property {() => Promise<Deal[]>} fetchDeals
 * @property {() => Promise<Activity[]>} fetchActivities
 */

export {};