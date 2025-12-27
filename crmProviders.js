// Mock data and functions for CRM providers

const mockLeads = [{ id: 'L1', value: 1000, lastInteraction: new Date('2025-11-01') }];
const mockOpportunities = [
    { id: 'O1', value: 5000, status: 'won', createdAt: new Date('2025-09-01'), closedAt: new Date('2025-10-15'), lastInteraction: new Date('2025-10-15') },
    { id: 'O2', value: 12000, status: 'lost', createdAt: new Date('2025-09-10'), closedAt: new Date('2025-10-20'), lastInteraction: new Date('2025-10-20') },
    { id: 'O3', value: 8000, status: 'open', createdAt: new Date('2025-10-05'), closedAt: null, lastInteraction: new Date('2025-11-05') },
    { id: 'O4', value: 25000, status: 'won', createdAt: new Date('2025-08-15'), closedAt: new Date('2025-10-01'), lastInteraction: new Date('2025-10-01') },
    { id: 'O5', value: 3000, status: 'open', createdAt: new Date('2025-10-25'), closedAt: null, lastInteraction: new Date('2025-11-10') },
];
const mockActivities = [{ id: 'A1', relatedTo: 'L1', date: new Date('2025-11-01') }];

const salesforceConnector = {
    getLeads: async () => mockLeads,
    getOpportunities: async () => mockOpportunities,
    getActivities: async () => mockActivities,
};

const hubspotConnector = {
    getLeads: async () => mockLeads,
    getOpportunities: async () => mockOpportunities,
    getActivities: async () => mockActivities,
};

const pipedriveConnector = {
    getLeads: async () => mockLeads,
    getOpportunities: async () => mockOpportunities,
    getActivities: async () => mockActivities,
};

const mockConnector = {
    getLeads: async () => mockLeads,
    getOpportunities: async () => mockOpportunities,
    getActivities: async () => mockActivities,
};

const crmConnectors = {
    salesforce: salesforceConnector,
    hubspot: hubspotConnector,
    pipedrive: pipedriveConnector,
    mock: mockConnector,
};

const getConnector = (crm) => {
    const connector = crmConnectors[crm.toLowerCase()];
    if (!connector) throw new Error('Invalid CRM provider');
    return connector;
}

export const getLeads = async (crm) => getConnector(crm).getLeads();
export const getOpportunities = async (crm) => getConnector(crm).getOpportunities();
export const getActivities = async (crm) => getConnector(crm).getActivities();