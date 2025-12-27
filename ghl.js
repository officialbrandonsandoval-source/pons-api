/**
 * @typedef {import('./types.js').CRMClient} CRMClient
 */

/**
 * Creates a CRM client for GoHighLevel (GHL).
 * @param {object} config
 * @param {string} config.apiToken - GHL API Token.
 * @param {string} [config.baseUrl] - The base URL for the GHL API.
 * @returns {CRMClient}
 */
export function createGHLClient(config) {
  if (!config.apiToken) {
    throw new Error("GHL API token is required.");
  }
  const baseUrl = config.baseUrl || 'https://services.leadconnectorhq.com';

  // Stubbed implementation. Ready for real HTTP calls.
  return {
    async fetchLeads() {
      console.log(`Fetching leads from GHL at ${baseUrl}... (stubbed)`);
      // Example: const res = await fetch(`${baseUrl}/contacts/`, { headers: { 'Authorization': `Bearer ${config.apiToken}` } });
      // const data = await res.json();
      // return normalizeLeads(data.contacts);
      return [];
    },
    async fetchDeals() {
      console.log(`Fetching deals (opportunities) from GHL at ${baseUrl}... (stubbed)`);
      return [];
    },
    async fetchActivities() {
      console.log(`Fetching activities from GHL at ${baseUrl}... (stubbed)`);
      return [];
    },
  };
}

// Normalization functions would go here, e.g., function normalizeLeads(ghlContacts) { ... }