/**
 * PONS CRM Provider Base
 * Abstract interface that all CRM adapters must implement
 */

export class BaseCRMProvider {
  constructor(config) {
    this.name = 'base';
    this.config = config;
    this.connected = false;
  }

  /**
   * Test connection to the CRM
   * @returns {Promise<{connected: boolean, error?: string}>}
   */
  async testConnection() {
    throw new Error('Not implemented');
  }

  /**
   * Fetch all contacts
   * @param {Object} options - Pagination, filters
   * @returns {Promise<Array>} Normalized contacts
   */
  async getContacts(options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Fetch all opportunities/deals
   * @param {Object} options
   * @returns {Promise<Array>} Normalized opportunities
   */
  async getOpportunities(options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Fetch all activities
   * @param {Object} options
   * @returns {Promise<Array>} Normalized activities
   */
  async getActivities(options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Fetch all leads
   * @param {Object} options
   * @returns {Promise<Array>} Normalized leads
   */
  async getLeads(options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Fetch team/rep information
   * @returns {Promise<Array>} Normalized reps
   */
  async getReps() {
    throw new Error('Not implemented');
  }

  /**
   * Fetch all data needed for analysis
   * @returns {Promise<Object>} { contacts, opportunities, activities, leads, reps }
   */
  async getAllData() {
    const [contacts, opportunities, activities, leads, reps] = await Promise.all([
      this.getContacts(),
      this.getOpportunities(),
      this.getActivities(),
      this.getLeads(),
      this.getReps()
    ]);

    return { contacts, opportunities, activities, leads, reps };
  }

  /**
   * Normalize a date to ISO string
   */
  normalizeDate(date) {
    if (!date) return null;
    try {
      return new Date(date).toISOString();
    } catch {
      return null;
    }
  }

  /**
   * Normalize a phone number (basic cleanup)
   */
  normalizePhone(phone) {
    if (!phone) return null;
    return phone.replace(/[^\d+]/g, '');
  }

  /**
   * Safe fetch wrapper with error handling
   */
  async safeFetch(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[${this.name}] Fetch error:`, error.message);
      throw error;
    }
  }
}

export default BaseCRMProvider;
