/**
 * PONS CRM Provider Index
 * Factory for creating CRM provider instances
 */

import { GoHighLevelProvider } from './ghl.js';
import { HubSpotProvider } from './hubspot.js';
import { SalesforceProvider } from './salesforce.js';
import { WebhookProvider } from './webhook.js';

const providers = {
  ghl: GoHighLevelProvider,
  hubspot: HubSpotProvider,
  salesforce: SalesforceProvider,
  webhook: WebhookProvider
};

/**
 * Get a CRM provider instance
 * @param {string} name - Provider name (ghl, hubspot, salesforce, webhook)
 * @param {Object} config - Provider configuration
 * @returns {BaseCRMProvider}
 */
export function getProvider(name, config = {}) {
  const Provider = providers[name?.toLowerCase()];
  if (!Provider) {
    throw new Error(`Unknown CRM provider: ${name}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return new Provider(config);
}

/**
 * List available providers
 */
export function listProviders() {
  return Object.keys(providers);
}

export {
  GoHighLevelProvider,
  HubSpotProvider,
  SalesforceProvider,
  WebhookProvider
};

export default { getProvider, listProviders };
