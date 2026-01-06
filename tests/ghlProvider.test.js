import test from 'node:test';
import assert from 'node:assert/strict';

import { GoHighLevelProvider } from '../src/providers/ghl.js';

test('GHL provider accepts snake_case config keys', () => {
  const provider = new GoHighLevelProvider({
    api_key: 'Bearer abc123',
    location_id: 'loc_456'
  });

  assert.equal(provider.accessToken, 'abc123');
  assert.equal(provider.locationId, 'loc_456');
  assert.equal(provider.headers.Authorization, 'Bearer abc123');
});

test('GHL provider fails fast when missing token/location', async () => {
  const provider = new GoHighLevelProvider({});

  // stub fetch to ensure we don't make network calls
  global.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  const result = await provider.testConnection();
  assert.equal(result.connected, false);
  assert.match(result.error, /Missing GHL access token/);
});
