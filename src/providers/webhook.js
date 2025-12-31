/**
 * PONS Generic Webhook Adapter
 * Accepts normalized data from any source via webhook
 * Use this with Zapier, Make, n8n, or direct API calls
 */

import { BaseCRMProvider } from './base.js';

// In-memory store for webhook data (replace with DB in production)
const dataStore = {
  contacts: [],
  opportunities: [],
  activities: [],
  leads: [],
  reps: [],
  lastUpdated: null
};

export class WebhookProvider extends BaseCRMProvider {
  constructor(config) {
    super(config);
    this.name = 'webhook';
    this.connected = true; // Always "connected" since it receives data
  }

  async testConnection() {
    return { 
      connected: true, 
      message: 'Webhook provider ready to receive data',
      dataStats: {
        contacts: dataStore.contacts.length,
        opportunities: dataStore.opportunities.length,
        activities: dataStore.activities.length,
        leads: dataStore.leads.length,
        reps: dataStore.reps.length,
        lastUpdated: dataStore.lastUpdated
      }
    };
  }

  /**
   * Ingest data from webhook payload
   * @param {Object} payload - Webhook payload with contacts, opportunities, etc.
   * @param {string} mode - 'replace' (default) or 'append'
   */
  async ingestData(payload, mode = 'replace') {
    const { contacts, opportunities, activities, leads, reps } = payload;

    if (mode === 'replace') {
      if (contacts) dataStore.contacts = contacts.map(c => this.normalizeContact(c));
      if (opportunities) dataStore.opportunities = opportunities.map(o => this.normalizeOpportunity(o));
      if (activities) dataStore.activities = activities.map(a => this.normalizeActivity(a));
      if (leads) dataStore.leads = leads.map(l => this.normalizeLead(l));
      if (reps) dataStore.reps = reps.map(r => this.normalizeRep(r));
    } else {
      if (contacts) dataStore.contacts.push(...contacts.map(c => this.normalizeContact(c)));
      if (opportunities) dataStore.opportunities.push(...opportunities.map(o => this.normalizeOpportunity(o)));
      if (activities) dataStore.activities.push(...activities.map(a => this.normalizeActivity(a)));
      if (leads) dataStore.leads.push(...leads.map(l => this.normalizeLead(l)));
      if (reps) dataStore.reps.push(...reps.map(r => this.normalizeRep(r)));
    }

    dataStore.lastUpdated = new Date().toISOString();

    return {
      success: true,
      ingested: {
        contacts: contacts?.length || 0,
        opportunities: opportunities?.length || 0,
        activities: activities?.length || 0,
        leads: leads?.length || 0,
        reps: reps?.length || 0
      },
      timestamp: dataStore.lastUpdated
    };
  }

  /**
   * Clear all stored data
   */
  async clearData() {
    dataStore.contacts = [];
    dataStore.opportunities = [];
    dataStore.activities = [];
    dataStore.leads = [];
    dataStore.reps = [];
    dataStore.lastUpdated = null;
    return { success: true, message: 'All data cleared' };
  }

  normalizeContact(c) {
    return {
      id: c.id || c.contact_id || `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      firstName: c.firstName || c.first_name || c.name?.split(' ')[0] || '',
      lastName: c.lastName || c.last_name || c.name?.split(' ').slice(1).join(' ') || '',
      email: c.email,
      phone: this.normalizePhone(c.phone),
      assignedTo: c.assignedTo || c.assigned_to || c.owner_id,
      source: 'webhook',
      createdAt: this.normalizeDate(c.createdAt || c.created_at) || new Date().toISOString(),
      updatedAt: this.normalizeDate(c.updatedAt || c.updated_at) || new Date().toISOString(),
      raw: c
    };
  }

  normalizeOpportunity(o) {
    return {
      id: o.id || o.opportunity_id || o.deal_id || `wh_opp_${Date.now()}`,
      name: o.name || o.title || 'Untitled',
      contactId: o.contactId || o.contact_id,
      contactName: o.contactName || o.contact_name,
      value: parseFloat(o.value || o.amount || o.deal_value || 0),
      status: this.mapStatus(o.status || o.stage_type),
      stage: o.stage || o.stage_name || o.pipeline_stage,
      assignedTo: o.assignedTo || o.assigned_to || o.owner_id,
      source: 'webhook',
      createdAt: this.normalizeDate(o.createdAt || o.created_at) || new Date().toISOString(),
      updatedAt: this.normalizeDate(o.updatedAt || o.updated_at) || new Date().toISOString(),
      lastActivityAt: this.normalizeDate(o.lastActivityAt || o.last_activity_at),
      lostReason: o.lostReason || o.lost_reason,
      raw: o
    };
  }

  normalizeActivity(a) {
    return {
      id: a.id || a.activity_id || `wh_act_${Date.now()}`,
      type: this.mapActivityType(a.type || a.activity_type),
      contactId: a.contactId || a.contact_id,
      opportunityId: a.opportunityId || a.opportunity_id,
      subject: a.subject || a.title || a.description?.substring(0, 50),
      body: a.body || a.description || a.notes,
      outcome: a.outcome || a.status || 'completed',
      performedBy: a.performedBy || a.performed_by || a.owner_id || a.user_id,
      source: 'webhook',
      createdAt: this.normalizeDate(a.createdAt || a.created_at || a.timestamp) || new Date().toISOString(),
      raw: a
    };
  }

  normalizeLead(l) {
    return {
      id: l.id || l.lead_id || `wh_lead_${Date.now()}`,
      firstName: l.firstName || l.first_name || l.name?.split(' ')[0] || '',
      lastName: l.lastName || l.last_name || l.name?.split(' ').slice(1).join(' ') || '',
      email: l.email,
      phone: this.normalizePhone(l.phone),
      status: this.mapLeadStatus(l.status),
      assignedTo: l.assignedTo || l.assigned_to || l.owner_id,
      leadSource: l.leadSource || l.lead_source || l.source || 'webhook',
      source: 'webhook',
      createdAt: this.normalizeDate(l.createdAt || l.created_at) || new Date().toISOString(),
      firstContactedAt: this.normalizeDate(l.firstContactedAt || l.first_contacted_at),
      raw: l
    };
  }

  normalizeRep(r) {
    return {
      id: r.id || r.user_id || r.rep_id,
      name: r.name || `${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`.trim(),
      email: r.email,
      phone: this.normalizePhone(r.phone),
      role: r.role || 'sales',
      active: r.active !== false,
      source: 'webhook'
    };
  }

  mapStatus(status) {
    if (!status) return 'open';
    const s = status.toLowerCase();
    if (s.includes('won') || s.includes('closed won')) return 'won';
    if (s.includes('lost') || s.includes('closed lost')) return 'lost';
    if (s.includes('abandon')) return 'abandoned';
    return 'open';
  }

  mapActivityType(type) {
    if (!type) return 'note';
    const t = type.toLowerCase();
    if (t.includes('call')) return 'call';
    if (t.includes('email')) return 'email';
    if (t.includes('sms') || t.includes('text')) return 'sms';
    if (t.includes('meet')) return 'meeting';
    if (t.includes('task')) return 'task';
    return 'note';
  }

  mapLeadStatus(status) {
    if (!status) return 'new';
    const s = status.toLowerCase();
    if (s.includes('contact')) return 'contacted';
    if (s.includes('qualif')) return 'qualified';
    if (s.includes('unqual') || s.includes('disqual')) return 'unqualified';
    return 'new';
  }

  // Data retrieval methods
  async getContacts() { return [...dataStore.contacts]; }
  async getOpportunities() { return [...dataStore.opportunities]; }
  async getActivities() { return [...dataStore.activities]; }
  async getLeads() { return [...dataStore.leads]; }
  async getReps() { return [...dataStore.reps]; }
}

export default WebhookProvider;
