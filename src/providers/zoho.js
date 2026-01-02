/**
 * PONS Zoho CRM Adapter
 * Connects to Zoho CRM API v2 to fetch contacts, deals, and activities
 */

import { BaseCRMProvider } from './base.js';

export class ZohoProvider extends BaseCRMProvider {
  constructor(config) {
    super(config);
    this.name = 'zoho';
    this.accessToken = config.accessToken || process.env.ZOHO_ACCESS_TOKEN;
    this.apiDomain = config.apiDomain || 'https://www.zohoapis.com';
  }

  get headers() {
    return {
      'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  async testConnection() {
    try {
      const response = await this.safeFetch(
        `${this.apiDomain}/crm/v2/users?type=CurrentUser`,
        { headers: this.headers }
      );
      this.connected = true;
      return { connected: true };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async getContacts(options = {}) {
    const { limit = 200 } = options;
    const contacts = [];
    let page = 1;

    do {
      const response = await this.safeFetch(
        `${this.apiDomain}/crm/v2/Contacts?page=${page}&per_page=${Math.min(limit, 200)}`,
        { headers: this.headers }
      );

      if (!response.data) break;

      for (const c of response.data) {
        contacts.push(this.normalizeContact(c));
      }

      if (!response.info?.more_records) break;
      page++;
    } while (contacts.length < 1000);

    return contacts;
  }

  normalizeContact(contact) {
    return {
      id: String(contact.id),
      firstName: contact.First_Name || '',
      lastName: contact.Last_Name || '',
      email: contact.Email,
      phone: this.normalizePhone(contact.Phone || contact.Mobile),
      assignedTo: String(contact.Owner?.id || ''),
      source: 'zoho',
      createdAt: this.normalizeDate(contact.Created_Time),
      updatedAt: this.normalizeDate(contact.Modified_Time),
      leadSource: contact.Lead_Source,
      raw: contact
    };
  }

  async getOpportunities(options = {}) {
    const { limit = 200 } = options;
    const deals = [];
    let page = 1;

    do {
      const response = await this.safeFetch(
        `${this.apiDomain}/crm/v2/Deals?page=${page}&per_page=${Math.min(limit, 200)}`,
        { headers: this.headers }
      );

      if (!response.data) break;

      for (const d of response.data) {
        deals.push(this.normalizeDeal(d));
      }

      if (!response.info?.more_records) break;
      page++;
    } while (deals.length < 1000);

    return deals;
  }

  normalizeDeal(deal) {
    const stageMap = {
      'Closed Won': 'won',
      'Closed Lost': 'lost'
    };

    return {
      id: String(deal.id),
      name: deal.Deal_Name || 'Untitled Deal',
      contactId: String(deal.Contact_Name?.id || ''),
      value: parseFloat(deal.Amount) || 0,
      status: stageMap[deal.Stage] || 'open',
      stage: deal.Stage,
      assignedTo: String(deal.Owner?.id || ''),
      source: 'zoho',
      createdAt: this.normalizeDate(deal.Created_Time),
      updatedAt: this.normalizeDate(deal.Modified_Time),
      expectedCloseDate: this.normalizeDate(deal.Closing_Date),
      probability: deal.Probability,
      lostReason: deal.Reason_For_Loss__s,
      raw: deal
    };
  }

  async getActivities(options = {}) {
    const activities = [];

    // Fetch Tasks
    try {
      const tasksResponse = await this.safeFetch(
        `${this.apiDomain}/crm/v2/Tasks?per_page=200`,
        { headers: this.headers }
      );

      for (const t of tasksResponse.data || []) {
        activities.push(this.normalizeTask(t));
      }
    } catch (e) {
      console.warn('[Zoho] Tasks fetch failed:', e.message);
    }

    // Fetch Calls
    try {
      const callsResponse = await this.safeFetch(
        `${this.apiDomain}/crm/v2/Calls?per_page=200`,
        { headers: this.headers }
      );

      for (const c of callsResponse.data || []) {
        activities.push(this.normalizeCall(c));
      }
    } catch (e) {
      console.warn('[Zoho] Calls fetch failed:', e.message);
    }

    // Fetch Meetings
    try {
      const meetingsResponse = await this.safeFetch(
        `${this.apiDomain}/crm/v2/Events?per_page=200`,
        { headers: this.headers }
      );

      for (const m of meetingsResponse.data || []) {
        activities.push(this.normalizeMeeting(m));
      }
    } catch (e) {
      console.warn('[Zoho] Events fetch failed:', e.message);
    }

    return activities;
  }

  normalizeTask(task) {
    return {
      id: String(task.id),
      type: 'task',
      contactId: String(task.Who_Id?.id || ''),
      dealId: String(task.What_Id?.id || ''),
      subject: task.Subject || 'Task',
      body: task.Description,
      outcome: task.Status === 'Completed' ? 'completed' : 'pending',
      performedBy: String(task.Owner?.id || ''),
      source: 'zoho',
      createdAt: this.normalizeDate(task.Created_Time),
      dueAt: this.normalizeDate(task.Due_Date),
      raw: task
    };
  }

  normalizeCall(call) {
    return {
      id: String(call.id),
      type: 'call',
      contactId: String(call.Who_Id?.id || ''),
      dealId: String(call.What_Id?.id || ''),
      subject: call.Subject || 'Call',
      body: call.Description,
      outcome: call.Call_Result || 'unknown',
      duration: call.Call_Duration_in_seconds,
      performedBy: String(call.Owner?.id || ''),
      source: 'zoho',
      createdAt: this.normalizeDate(call.Created_Time),
      raw: call
    };
  }

  normalizeMeeting(meeting) {
    return {
      id: String(meeting.id),
      type: 'meeting',
      contactId: String(meeting.Who_Id?.id || ''),
      dealId: String(meeting.What_Id?.id || ''),
      subject: meeting.Event_Title || 'Meeting',
      body: meeting.Description,
      outcome: meeting.Check_In_State ? 'completed' : 'scheduled',
      performedBy: String(meeting.Owner?.id || ''),
      source: 'zoho',
      createdAt: this.normalizeDate(meeting.Created_Time),
      startAt: this.normalizeDate(meeting.Start_DateTime),
      endAt: this.normalizeDate(meeting.End_DateTime),
      raw: meeting
    };
  }

  async getLeads(options = {}) {
    const { limit = 200 } = options;
    const leads = [];
    let page = 1;

    do {
      const response = await this.safeFetch(
        `${this.apiDomain}/crm/v2/Leads?page=${page}&per_page=${Math.min(limit, 200)}`,
        { headers: this.headers }
      );

      if (!response.data) break;

      for (const l of response.data) {
        leads.push(this.normalizeLead(l));
      }

      if (!response.info?.more_records) break;
      page++;
    } while (leads.length < 1000);

    return leads;
  }

  normalizeLead(lead) {
    return {
      id: String(lead.id),
      firstName: lead.First_Name || '',
      lastName: lead.Last_Name || '',
      email: lead.Email,
      phone: this.normalizePhone(lead.Phone || lead.Mobile),
      company: lead.Company,
      status: lead.Lead_Status || 'new',
      assignedTo: String(lead.Owner?.id || ''),
      leadSource: lead.Lead_Source || 'unknown',
      source: 'zoho',
      createdAt: this.normalizeDate(lead.Created_Time),
      updatedAt: this.normalizeDate(lead.Modified_Time),
      raw: lead
    };
  }

  async getReps() {
    try {
      const response = await this.safeFetch(
        `${this.apiDomain}/crm/v2/users?type=AllUsers`,
        { headers: this.headers }
      );

      return (response.users || []).map(u => ({
        id: String(u.id),
        name: u.full_name,
        email: u.email,
        phone: u.phone,
        role: u.role?.name || 'sales',
        active: u.status === 'active',
        source: 'zoho'
      }));
    } catch (e) {
      console.warn('[Zoho] Could not fetch users:', e.message);
      return [];
    }
  }
}

export default ZohoProvider;
