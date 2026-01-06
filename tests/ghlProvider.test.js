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

test('GHL provider can derive locationId from JWT token payload', async () => {
  // Minimal unsigned JWT-like string: header.payload.signature
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ locationId: 'loc_from_jwt' })).toString('base64url');
  const token = `${header}.${payload}.sig`;

  const provider = new GoHighLevelProvider({
    accessToken: token
  });

  global.fetch = async (url) => {
    // Ensure it used the derived locationId
    assert.match(String(url), /\/locations\/loc_from_jwt/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ name: 'Test Location' }),
      json: async () => ({ name: 'Test Location' })
    };
  };

  const result = await provider.testConnection();
  assert.equal(result.connected, true);
});

test('GHL provider works with token + explicit locationId', async () => {
  const jwtLikeToken = 'aaa.bbb.ccc';
  const provider = new GoHighLevelProvider({
    apiKey: jwtLikeToken,
    locationId: 'loc_explicit'
  });

  let called = 0;
  global.fetch = async (url, options) => {
    called += 1;
    assert.match(String(url), /\/locations\/loc_explicit$/);
    assert.equal(options?.headers?.Authorization, `Bearer ${jwtLikeToken}`);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ name: 'Explicit Location' }),
      json: async () => ({ name: 'Explicit Location' })
    };
  };

  const result = await provider.testConnection();
  assert.equal(result.connected, true);
  assert.equal(result.locationName, 'Explicit Location');
  assert.equal(called, 1);
});

test('GHL provider rejects non-JWT tokens with a clear message', async () => {
  const provider = new GoHighLevelProvider({
    apiKey: 'not-a-jwt',
    locationId: 'loc_123'
  });

  global.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  const result = await provider.testConnection();
  assert.equal(result.connected, false);
  assert.match(result.error, /must be a JWT/i);
});
