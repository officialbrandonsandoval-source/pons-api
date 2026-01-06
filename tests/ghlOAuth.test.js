import test from 'node:test';
import assert from 'node:assert/strict';

import {
  signState,
  verifyState,
  buildGhlAuthorizeUrl,
  buildFragmentRedirectUrl,
  isAllowedReturnUrl
} from '../src/services/ghlOAuth.js';

test('ghlOAuth signState/verifyState roundtrip', () => {
  const secret = 'test_secret';
  const payload = { iat: 123, returnUrl: 'https://app.example.com/cb' };
  const state = signState(payload, secret);

  const parsed = verifyState(state, secret);
  assert.deepEqual(parsed, payload);
});

test('ghlOAuth verifyState rejects tampered state', () => {
  const secret = 'test_secret';
  const state = signState({ iat: 123, returnUrl: null }, secret);

  const tampered = state.replace(/.$/, state.endsWith('A') ? 'B' : 'A');
  const parsed = verifyState(tampered, secret);
  assert.equal(parsed, null);
});

test('buildGhlAuthorizeUrl sets required params', () => {
  const url = buildGhlAuthorizeUrl({
    authorizeUrl: 'https://example.com/oauth/authorize',
    clientId: 'cid',
    redirectUri: 'https://api.example.com/auth/ghl/callback',
    scope: 'locations.readonly',
    state: 'abc'
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('client_id'), 'cid');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://api.example.com/auth/ghl/callback');
  assert.equal(parsed.searchParams.get('scope'), 'locations.readonly');
  assert.equal(parsed.searchParams.get('state'), 'abc');
});

test('isAllowedReturnUrl enforces allowlist origins', () => {
  assert.equal(isAllowedReturnUrl('https://a.com/x', ['https://a.com']), true);
  assert.equal(isAllowedReturnUrl('https://b.com/x', ['https://a.com']), false);
  assert.equal(isAllowedReturnUrl('javascript:alert(1)', ['https://a.com']), false);
});

test('buildFragmentRedirectUrl puts tokens in fragment', () => {
  const url = buildFragmentRedirectUrl('https://app.example.com/return', {
    access_token: 'at',
    location_id: 'loc'
  });
  assert.match(url, /^https:\/\/app\.example\.com\/return#/);
  assert.ok(url.includes('access_token=at'));
  assert.ok(url.includes('location_id=loc'));
});
