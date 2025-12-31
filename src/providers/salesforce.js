/**
 * PONS Salesforce CRM Adapter
 * Connects to Salesforce REST API to fetch contacts, opportunities, and activities
 */

import { BaseCRMProvider } from './base.js';

export class SalesforceProvider extends BaseCRMProvider {
  constructor(config) {
    super(config);
    this.name = 'salesforce';
    this.clientId = config.clientId || process.env.SALESFORCE_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.SALESFORCE_CLIENT_SECRET;
    this.refreshToken = config.refreshToken || process.env.SALESFORCE_REFRESH_TOKEN;
    this.instanceUrl = config.instanceUrl || process.env.SALESFORCE_INSTANCE_URL;
    this.accessToken = null;
  }

  async getAccessToken() {
    if (this.accessToken) return this.accessToken;

    const tokenUrl = 'https://login.salesforce.com/services/oauth2/token';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      throw new Error(`Salesforce auth failed: ${await response.text()}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.instanceUrl = data.instance_url || this.instanceUrl;
    return this.accessToken;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async query(soql) {
    await this.getAccessToken();
    const url = `${this.instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(soql)}`;
    const response = await this.safeFetch(url, { headers: this.headers });
    return response.records || [];
  }

  async testConnection() {
    try {
      await this.getAccessToken();
      await this.query('SELECT Id FROM Account LIMIT 1');
      this.connected = true;
      return { connected: true };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async getContacts(options = {}) {
    const soql = `
      SELECT Id, FirstName, LastName, Email, Phone, OwnerId, CreatedDate, LastModifiedDate
      FROM Contact
      ORDER BY CreatedDate DESC
      LIMIT 1000
    `;
    
    const records = await this.query(soql);
    return records.map(c => this.normalizeContact(c));
  }

  normalizeContact(sfContact) {
    return {
      id: sfContact.Id,
      firstName: sfContact.FirstName || '',
      lastName: sfContact.LastName || '',
      email: sfContact.Email,
      phone: this.normalizePhone(sfContact.Phone),
      assignedTo: sfContact.OwnerId,
      source: 'salesforce',
      createdAt: this.normalizeDate(sfContact.CreatedDate),
      updatedAt: this.normalizeDate(sfContact.LastModifiedDate),
      raw: sfContact
    };
  }

  async getOpportunities(options = {}) {
    const soql = `
      SELECT Id, Name, Amount, StageName, OwnerId, ContactId, CreatedDate, 
             LastModifiedDate, CloseDate, IsClosed, IsWon, LossReason
      FROM Opportunity
      ORDER BY CreatedDate DESC
      LIMIT 1000
    `;
    
    const records = await this.query(soql);
    return records.map(o => this.normalizeOpportunity(o));
  }

  normalizeOpportunity(sfOpp) {
    let status = 'open';
    if (sfOpp.IsClosed) {
      status = sfOpp.IsWon ? 'won' : 'lost';
    }

    return {
      id: sfOpp.Id,
      name: sfOpp.Name || 'Untitled',
      contactId: sfOpp.ContactId,
      value: sfOpp.Amount || 0,
      status,
      stage: sfOpp.StageName,
      assignedTo: sfOpp.OwnerId,
      source: 'salesforce',
      createdAt: this.normalizeDate(sfOpp.CreatedDate),
      updatedAt: this.normalizeDate(sfOpp.LastModifiedDate),
      lastActivityAt: null, // Would need separate query
      lostReason: sfOpp.LossReason,
      raw: sfOpp
    };
  }

  async getActivities(options = {}) {
    const activities = [];

    // Fetch Tasks
    const taskSoql = `
      SELECT Id, Subject, Description, Status, OwnerId, WhoId, CreatedDate, ActivityDate
      FROM Task
      ORDER BY CreatedDate DESC
      LIMIT 500
    `;
    
    const tasks = await this.query(taskSoql);
    for (const t of tasks) {
      activities.push({
        id: t.Id,
        type: 'task',
        contactId: t.WhoId,
        subject: t.Subject,
        body: t.Description,
        outcome: t.Status === 'Completed' ? 'completed' : 'pending',
        performedBy: t.OwnerId,
        source: 'salesforce',
        createdAt: this.normalizeDate(t.CreatedDate),
        raw: t
      });
    }

    // Fetch Events (meetings)
    const eventSoql = `
      SELECT Id, Subject, Description, OwnerId, WhoId, CreatedDate, ActivityDate
      FROM Event
      ORDER BY CreatedDate DESC
      LIMIT 500
    `;
    
    const events = await this.query(eventSoql);
    for (const e of events) {
      activities.push({
        id: e.Id,
        type: 'meeting',
        contactId: e.WhoId,
        subject: e.Subject,
        body: e.Description,
        outcome: 'completed',
        performedBy: e.OwnerId,
        source: 'salesforce',
        createdAt: this.normalizeDate(e.CreatedDate),
        raw: e
      });
    }

    return activities;
  }

  async getLeads(options = {}) {
    const soql = `
      SELECT Id, FirstName, LastName, Email, Phone, Status, OwnerId, 
             LeadSource, CreatedDate, LastModifiedDate
      FROM Lead
      WHERE IsConverted = false
      ORDER BY CreatedDate DESC
      LIMIT 1000
    `;
    
    const records = await this.query(soql);
    return records.map(l => ({
      id: l.Id,
      firstName: l.FirstName || '',
      lastName: l.LastName || '',
      email: l.Email,
      phone: this.normalizePhone(l.Phone),
      status: this.mapLeadStatus(l.Status),
      assignedTo: l.OwnerId,
      leadSource: l.LeadSource || 'unknown',
      source: 'salesforce',
      createdAt: this.normalizeDate(l.CreatedDate),
      firstContactedAt: null,
      raw: l
    }));
  }

  mapLeadStatus(sfStatus) {
    const statusMap = {
      'New': 'new',
      'Working': 'contacted',
      'Qualified': 'qualified',
      'Unqualified': 'unqualified'
    };
    return statusMap[sfStatus] || 'new';
  }

  async getReps() {
    const soql = `
      SELECT Id, Name, Email, IsActive
      FROM User
      WHERE IsActive = true AND UserType = 'Standard'
      LIMIT 100
    `;
    
    const records = await this.query(soql);
    return records.map(u => ({
      id: u.Id,
      name: u.Name,
      email: u.Email,
      phone: null,
      role: 'sales',
      active: u.IsActive,
      source: 'salesforce'
    }));
  }
}

export default SalesforceProvider;
