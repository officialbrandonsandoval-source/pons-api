/**
 * PONS GoHighLevel CRM Adapter
 * Connects to GHL API to fetch contacts, opportunities, and activities
 */

import { BaseCRMProvider } from './base.js';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

export class GoHighLevelProvider extends BaseCRMProvider {
  constructor(config) {
    super(config);
    this.name = 'ghl';
    this.apiKey = config.apiKey || process.env.GHL_API_KEY;
    this.locationId = config.locationId || process.env.GHL_LOCATION_ID;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json'
    };
  }

  async testConnection() {
    try {
      const response = await this.safeFetch(
        `${GHL_API_BASE}/locations/${this.locationId}`,
        { headers: this.headers }
      );
      this.connected = true;
      return { connected: true, locationName: response.name };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async getContacts(options = {}) {
    const { limit = 100 } = options;
    const contacts = [];
    let startAfter = null;

    do {
      const url = new URL(`${GHL_API_BASE}/contacts/`);
      url.searchParams.set('locationId', this.locationId);
      url.searchParams.set('limit', String(limit));
      if (startAfter) url.searchParams.set('startAfter', startAfter);

      const response = await this.safeFetch(url.toString(), { headers: this.headers });
      
      for (const c of response.contacts || []) {
        contacts.push(this.normalizeContact(c));
      }

      startAfter = response.meta?.nextPageUrl ? response.meta.startAfter : null;
    } while (startAfter && contacts.length < 1000); // Cap at 1000

    return contacts;
  }

  normalizeContact(ghlContact) {
    return {
      id: ghlContact.id,
      firstName: ghlContact.firstName || '',
      lastName: ghlContact.lastName || '',
      email: ghlContact.email,
      phone: this.normalizePhone(ghlContact.phone),
      assignedTo: ghlContact.assignedTo,
      source: 'ghl',
      createdAt: this.normalizeDate(ghlContact.dateAdded),
      updatedAt: this.normalizeDate(ghlContact.dateUpdated),
      tags: ghlContact.tags || [],
      raw: ghlContact
    };
  }

  async getOpportunities(options = {}) {
    const { limit = 100 } = options;
    const opportunities = [];
    let startAfter = null;

    do {
      const url = new URL(`${GHL_API_BASE}/opportunities/search`);
      url.searchParams.set('location_id', this.locationId);
      url.searchParams.set('limit', String(limit));
      if (startAfter) url.searchParams.set('startAfter', startAfter);

      const response = await this.safeFetch(url.toString(), { headers: this.headers });
      
      for (const o of response.opportunities || []) {
        opportunities.push(this.normalizeOpportunity(o));
      }

      startAfter = response.meta?.nextPageUrl ? response.meta.startAfter : null;
    } while (startAfter && opportunities.length < 1000);

    return opportunities;
  }

  normalizeOpportunity(ghlOpp) {
    // Map GHL status to normalized status
    const statusMap = {
      'open': 'open',
      'won': 'won',
      'lost': 'lost',
      'abandoned': 'abandoned'
    };

    return {
      id: ghlOpp.id,
      name: ghlOpp.name || 'Untitled',
      contactId: ghlOpp.contactId,
      contactName: ghlOpp.contact?.name,
      value: ghlOpp.monetaryValue || 0,
      status: statusMap[ghlOpp.status?.toLowerCase()] || 'open',
      stage: ghlOpp.pipelineStageId,
      assignedTo: ghlOpp.assignedTo,
      source: 'ghl',
      createdAt: this.normalizeDate(ghlOpp.createdAt),
      updatedAt: this.normalizeDate(ghlOpp.updatedAt),
      lastActivityAt: this.normalizeDate(ghlOpp.lastActivityAt),
      lostReason: ghlOpp.lostReasonId,
      raw: ghlOpp
    };
  }

  async getActivities(options = {}) {
    // GHL doesn't have a direct activities endpoint
    // We'll fetch from tasks and notes
    const activities = [];

    // Fetch tasks
    try {
      const tasksUrl = `${GHL_API_BASE}/contacts/tasks?locationId=${this.locationId}`;
      const tasksResponse = await this.safeFetch(tasksUrl, { headers: this.headers });
      
      for (const task of tasksResponse.tasks || []) {
        activities.push({
          id: task.id,
          type: 'task',
          contactId: task.contactId,
          subject: task.title || task.body?.substring(0, 50),
          body: task.body,
          outcome: task.completed ? 'completed' : 'pending',
          performedBy: task.assignedTo,
          source: 'ghl',
          createdAt: this.normalizeDate(task.dateAdded),
          raw: task
        });
      }
    } catch (e) {
      console.warn('[GHL] Could not fetch tasks:', e.message);
    }

    // Fetch notes (conversations)
    try {
      const notesUrl = `${GHL_API_BASE}/conversations/search?locationId=${this.locationId}`;
      const notesResponse = await this.safeFetch(notesUrl, { headers: this.headers });
      
      for (const conv of notesResponse.conversations || []) {
        activities.push({
          id: conv.id,
          type: conv.type || 'note',
          contactId: conv.contactId,
          subject: conv.snippet?.substring(0, 50),
          body: conv.snippet,
          outcome: 'completed',
          performedBy: conv.assignedTo,
          source: 'ghl',
          createdAt: this.normalizeDate(conv.dateUpdated),
          raw: conv
        });
      }
    } catch (e) {
      console.warn('[GHL] Could not fetch conversations:', e.message);
    }

    return activities;
  }

  async getLeads(options = {}) {
    // In GHL, leads are contacts with specific tags or pipeline stages
    const contacts = await this.getContacts(options);
    
    // Filter to contacts that look like leads (no closed opportunity)
    return contacts
      .filter(c => c.tags?.includes('lead') || !c.hasClosedDeal)
      .map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        status: c.tags?.includes('contacted') ? 'contacted' : 'new',
        assignedTo: c.assignedTo,
        leadSource: c.raw?.source || 'unknown',
        source: 'ghl',
        createdAt: c.createdAt,
        firstContactedAt: null, // Would need activity lookup
        raw: c.raw
      }));
  }

  async getReps() {
    try {
      const url = `${GHL_API_BASE}/users/?locationId=${this.locationId}`;
      const response = await this.safeFetch(url, { headers: this.headers });
      
      return (response.users || []).map(u => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        phone: u.phone,
        role: u.role || 'sales',
        active: !u.deleted,
        source: 'ghl'
      }));
    } catch (e) {
      console.warn('[GHL] Could not fetch users:', e.message);
      return [];
    }
  }
}

export default GoHighLevelProvider;
