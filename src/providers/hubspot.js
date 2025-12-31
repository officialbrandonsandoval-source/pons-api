/**
 * PONS HubSpot CRM Adapter
 * Connects to HubSpot API v3 to fetch contacts, deals, and activities
 */

import { BaseCRMProvider } from './base.js';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export class HubSpotProvider extends BaseCRMProvider {
  constructor(config) {
    super(config);
    this.name = 'hubspot';
    this.accessToken = config.accessToken || process.env.HUBSPOT_ACCESS_TOKEN;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async testConnection() {
    try {
      const response = await this.safeFetch(
        `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=1`,
        { headers: this.headers }
      );
      this.connected = true;
      return { connected: true };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async getContacts(options = {}) {
    const { limit = 100 } = options;
    const contacts = [];
    let after = null;

    do {
      const url = new URL(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('properties', 'firstname,lastname,email,phone,hubspot_owner_id,createdate,lastmodifieddate');
      if (after) url.searchParams.set('after', after);

      const response = await this.safeFetch(url.toString(), { headers: this.headers });
      
      for (const c of response.results || []) {
        contacts.push(this.normalizeContact(c));
      }

      after = response.paging?.next?.after || null;
    } while (after && contacts.length < 1000);

    return contacts;
  }

  normalizeContact(hsContact) {
    const props = hsContact.properties || {};
    return {
      id: hsContact.id,
      firstName: props.firstname || '',
      lastName: props.lastname || '',
      email: props.email,
      phone: this.normalizePhone(props.phone),
      assignedTo: props.hubspot_owner_id,
      source: 'hubspot',
      createdAt: this.normalizeDate(props.createdate),
      updatedAt: this.normalizeDate(props.lastmodifieddate),
      raw: hsContact
    };
  }

  async getOpportunities(options = {}) {
    const { limit = 100 } = options;
    const deals = [];
    let after = null;

    do {
      const url = new URL(`${HUBSPOT_API_BASE}/crm/v3/objects/deals`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('properties', 'dealname,amount,dealstage,hubspot_owner_id,createdate,closedate,hs_lastmodifieddate,closed_lost_reason');
      url.searchParams.set('associations', 'contacts');
      if (after) url.searchParams.set('after', after);

      const response = await this.safeFetch(url.toString(), { headers: this.headers });
      
      for (const d of response.results || []) {
        deals.push(this.normalizeDeal(d));
      }

      after = response.paging?.next?.after || null;
    } while (after && deals.length < 1000);

    return deals;
  }

  normalizeDeal(hsDeal) {
    const props = hsDeal.properties || {};
    
    // Map HubSpot stage to status
    let status = 'open';
    const stage = props.dealstage?.toLowerCase() || '';
    if (stage.includes('won') || stage.includes('closed won')) status = 'won';
    else if (stage.includes('lost') || stage.includes('closed lost')) status = 'lost';

    // Get associated contact
    const contactAssoc = hsDeal.associations?.contacts?.results?.[0];

    return {
      id: hsDeal.id,
      name: props.dealname || 'Untitled Deal',
      contactId: contactAssoc?.id,
      value: parseFloat(props.amount) || 0,
      status,
      stage: props.dealstage,
      assignedTo: props.hubspot_owner_id,
      source: 'hubspot',
      createdAt: this.normalizeDate(props.createdate),
      updatedAt: this.normalizeDate(props.hs_lastmodifieddate),
      lastActivityAt: this.normalizeDate(props.notes_last_updated),
      lostReason: props.closed_lost_reason,
      raw: hsDeal
    };
  }

  async getActivities(options = {}) {
    const activities = [];
    
    // Fetch engagements (calls, emails, meetings, notes)
    const engagementTypes = ['calls', 'emails', 'meetings', 'notes'];
    
    for (const type of engagementTypes) {
      try {
        const url = new URL(`${HUBSPOT_API_BASE}/crm/v3/objects/${type}`);
        url.searchParams.set('limit', '100');
        url.searchParams.set('associations', 'contacts');
        
        const response = await this.safeFetch(url.toString(), { headers: this.headers });
        
        for (const eng of response.results || []) {
          activities.push(this.normalizeEngagement(eng, type));
        }
      } catch (e) {
        console.warn(`[HubSpot] Could not fetch ${type}:`, e.message);
      }
    }

    return activities;
  }

  normalizeEngagement(hsEngagement, type) {
    const props = hsEngagement.properties || {};
    const contactAssoc = hsEngagement.associations?.contacts?.results?.[0];

    const typeMap = {
      'calls': 'call',
      'emails': 'email',
      'meetings': 'meeting',
      'notes': 'note'
    };

    return {
      id: hsEngagement.id,
      type: typeMap[type] || type,
      contactId: contactAssoc?.id,
      subject: props.hs_call_title || props.hs_email_subject || props.hs_meeting_title || 'Activity',
      body: props.hs_call_body || props.hs_email_text || props.hs_note_body,
      outcome: props.hs_call_disposition || 'completed',
      performedBy: props.hubspot_owner_id,
      source: 'hubspot',
      createdAt: this.normalizeDate(props.hs_timestamp || props.createdate),
      raw: hsEngagement
    };
  }

  async getLeads(options = {}) {
    // In HubSpot, leads can be contacts in early lifecycle stages
    const contacts = await this.getContacts(options);
    
    // Fetch lifecycle stage for each (batch for efficiency)
    // For now, treat all contacts without deals as potential leads
    const deals = await this.getOpportunities({ limit: 1000 });
    const contactsWithDeals = new Set(deals.map(d => d.contactId).filter(Boolean));

    return contacts
      .filter(c => !contactsWithDeals.has(c.id))
      .map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        status: 'new',
        assignedTo: c.assignedTo,
        leadSource: c.raw?.properties?.hs_lead_source || 'unknown',
        source: 'hubspot',
        createdAt: c.createdAt,
        firstContactedAt: null,
        raw: c.raw
      }));
  }

  async getReps() {
    try {
      const url = `${HUBSPOT_API_BASE}/crm/v3/owners`;
      const response = await this.safeFetch(url, { headers: this.headers });
      
      return (response.results || []).map(o => ({
        id: o.id,
        name: `${o.firstName} ${o.lastName}`.trim(),
        email: o.email,
        phone: null,
        role: 'sales',
        active: o.archived !== true,
        source: 'hubspot'
      }));
    } catch (e) {
      console.warn('[HubSpot] Could not fetch owners:', e.message);
      return [];
    }
  }
}

export default HubSpotProvider;
