/**
 * PONS Leak Detector Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectLeaks, calculateRepKPIs } from '../src/services/leakDetector.js';

describe('Leak Detector', () => {
  const now = new Date('2025-01-01T12:00:00Z');
  const dayMs = 1000 * 60 * 60 * 24;

  it('detects stale opportunities', async () => {
    const opportunities = [{
      id: 'opp_1',
      name: 'Big Deal',
      contactId: 'contact_1',
      value: 50000,
      status: 'open',
      stage: 'negotiation',
      createdAt: new Date(now.getTime() - 60 * dayMs).toISOString(), // 60 days ago
      updatedAt: new Date(now.getTime() - 60 * dayMs).toISOString()
    }];

    const result = await detectLeaks({
      opportunities,
      activities: [],
      leads: [],
      contacts: [],
      reps: [],
      now,
      includeAI: false
    });

    assert.ok(result.leaks.length > 0, 'Should detect at least one leak');
    assert.equal(result.leaks[0].type, 'STALE_OPPORTUNITY');
    assert.equal(result.leaks[0].severity, 'CRITICAL'); // $50k deal
  });

  it('detects untouched leads', async () => {
    const leads = [{
      id: 'lead_1',
      firstName: 'John',
      lastName: 'Doe',
      status: 'new',
      leadSource: 'website',
      createdAt: new Date(now.getTime() - 3 * dayMs).toISOString(), // 3 days ago
      firstContactedAt: null
    }];

    const result = await detectLeaks({
      opportunities: [],
      activities: [],
      leads,
      contacts: [],
      reps: [],
      now,
      includeAI: false
    });

    const untouchedLeak = result.leaks.find(l => l.type === 'UNTOUCHED_LEAD');
    assert.ok(untouchedLeak, 'Should detect untouched lead');
  });

  it('detects unassigned leads', async () => {
    const leads = [
      { id: 'lead_1', firstName: 'John', lastName: 'Doe', status: 'new', assignedTo: null, createdAt: now.toISOString() },
      { id: 'lead_2', firstName: 'Jane', lastName: 'Doe', status: 'new', assignedTo: null, createdAt: now.toISOString() },
    ];

    const result = await detectLeaks({
      opportunities: [],
      activities: [],
      leads,
      contacts: [],
      reps: [],
      now,
      includeAI: false
    });

    const unassignedLeak = result.leaks.find(l => l.type === 'UNASSIGNED_LEAD');
    assert.ok(unassignedLeak, 'Should detect unassigned leads');
    assert.equal(unassignedLeak.impactedCount, 2);
  });

  it('calculates rep KPIs correctly', () => {
    const opportunities = [
      { id: 'opp_1', assignedTo: 'rep_1', status: 'won', value: 10000 },
      { id: 'opp_2', assignedTo: 'rep_1', status: 'won', value: 20000 },
      { id: 'opp_3', assignedTo: 'rep_1', status: 'lost', value: 5000 },
      { id: 'opp_4', assignedTo: 'rep_1', status: 'open', value: 15000 },
    ];

    const activities = [
      { id: 'act_1', performedBy: 'rep_1', createdAt: now.toISOString() },
      { id: 'act_2', performedBy: 'rep_1', createdAt: now.toISOString() },
    ];

    const reps = [{ id: 'rep_1', name: 'Test Rep', active: true }];

    const kpis = calculateRepKPIs({
      opportunities,
      activities,
      reps,
      now
    });

    assert.equal(kpis.length, 1);
    assert.equal(kpis[0].wonOpportunities, 2);
    assert.equal(kpis[0].lostOpportunities, 1);
    assert.equal(kpis[0].totalRevenue, 30000);
    assert.equal(kpis[0].winRate, 66.7); // 2/3 = 66.67%
  });

  it('returns summary with correct totals', async () => {
    const opportunities = [
      { id: 'opp_1', status: 'open', value: 10000, createdAt: new Date(now.getTime() - 60 * dayMs).toISOString() },
      { id: 'opp_2', status: 'open', value: 20000, createdAt: new Date(now.getTime() - 60 * dayMs).toISOString() },
    ];

    const result = await detectLeaks({
      opportunities,
      activities: [],
      leads: [],
      contacts: [],
      reps: [],
      now,
      includeAI: false
    });

    assert.ok(result.summary.totalLeaks >= 2);
    assert.ok(result.summary.totalEstimatedRevenue >= 30000);
    assert.ok(result.generatedAt);
  });
});
