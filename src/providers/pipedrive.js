/**
 * Pipedrive CRM Provider
 * Connects to Pipedrive API for deal and activity data
 */

const axios = require('axios');

class PipedriveProvider {
  constructor(config = {}) {
    this.apiToken = config.apiToken || process.env.PIPEDRIVE_API_TOKEN;
    this.baseUrl = 'https://api.pipedrive.com/v1';
    this.name = 'pipedrive';
  }

  async connect(credentials) {
    this.apiToken = credentials.apiToken || credentials.api_key;
    return this.validate();
  }

  async validate() {
    try {
      const response = await axios.get(`${this.baseUrl}/users/me`, {
        params: { api_token: this.apiToken }
      });
      return { success: true, provider: this.name, user: response.data.data?.name || 'Connected' };
    } catch (error) {
      return { success: false, provider: this.name, error: error.response?.data?.error || error.message };
    }
  }

  async getDeals(filters = {}) {
    try {
      const params = { api_token: this.apiToken, status: filters.status || 'open', limit: filters.limit || 500 };
      const response = await axios.get(`${this.baseUrl}/deals`, { params });
      return (response.data.data || []).map(deal => this.normalizeContact(deal));
    } catch (error) {
      console.error('Pipedrive getDeals error:', error.message);
      return [];
    }
  }

  async getActivities(filters = {}) {
    try {
      const params = { api_token: this.apiToken, limit: filters.limit || 500 };
      if (filters.startDate) params.start_date = filters.startDate;
      const response = await axios.get(`${this.baseUrl}/activities`, { params });
      return response.data.data || [];
    } catch (error) {
      console.error('Pipedrive getActivities error:', error.message);
      return [];
    }
  }

  normalizeContact(deal) {
    return {
      id: deal.id?.toString(),
      name: deal.title || deal.person_name || 'Unknown',
      email: deal.person_id?.email?.[0]?.value || '',
      phone: deal.person_id?.phone?.[0]?.value || '',
      stage: deal.stage_id?.toString() || '',
      stageName: deal.stage_name || '',
      value: deal.value || 0,
      currency: deal.currency || 'USD',
      status: deal.status || 'open',
      probability: deal.probability || 0,
      expectedCloseDate: deal.expected_close_date || null,
      createdAt: deal.add_time || null,
      updatedAt: deal.update_time || null,
      lastActivityDate: deal.last_activity_date || null,
      nextActivityDate: deal.next_activity_date || null,
      ownerId: deal.user_id?.id?.toString() || '',
      ownerName: deal.user_id?.name || '',
      source: this.name,
      raw: deal
    };
  }

  async fetchForLeakDetection() {
    const [deals, activities] = await Promise.all([
      this.getDeals(),
      this.getActivities({ startDate: this.getDateDaysAgo(90) })
    ]);
    return {
      contacts: deals,
      activities: activities.map(a => ({ id: a.id?.toString(), type: a.type, subject: a.subject, done: a.done, dueDate: a.due_date, dealId: a.deal_id?.toString(), createdAt: a.add_time })),
      provider: this.name
    };
  }

  getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}

module.exports = PipedriveProvider;
