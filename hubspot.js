/**
 * @typedef {import('./types.js').CRMClient} CRMClient
 */

/**
 * Creates a CRM client for HubSpot.
 * @param {object} config
 * @param {string} config.apiToken - HubSpot Private App Token.
 * @param {string} [config.baseUrl] - The base URL for the HubSpot API.
 * @returns {CRMClient}
 */
export function createHubSpotClient(config) {
  if (!config.apiToken) {
    throw new Error("HubSpot API token is required.");
  }
  const baseUrl = config.baseUrl || 'https://api.hubapi.com';

  // Stubbed implementation. Ready for real HTTP calls.
  return {
    async fetchLeads() {
      console.log(`Fetching leads (contacts) from HubSpot at ${baseUrl}... (stubbed)`);
      // Example: const res = await fetch(`${baseUrl}/crm/v3/objects/contacts`, { headers: { 'Authorization': `Bearer ${config.apiToken}` } });
      // const data = await res.json();
      // return normalizeLeads(data.results);
      return [];
    },
    async fetchDeals() {
      console.log(`Fetching deals from HubSpot at ${baseUrl}... (stubbed)`);
      return [];
    },
    async fetchActivities() {
      console.log(`Fetching activities from HubSpot at ${baseUrl}... (stubbed)`);
      return [];
    },
  };
}

// Normalization functions would go here, e.g., function normalizeLeads(hubspotContacts) { ... }