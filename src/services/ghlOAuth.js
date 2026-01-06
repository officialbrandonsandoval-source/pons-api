import crypto from 'node:crypto';

function base64UrlEncode(bufferOrString) {
  const buffer = Buffer.isBuffer(bufferOrString)
    ? bufferOrString
    : Buffer.from(String(bufferOrString), 'utf8');
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToString(base64url) {
  const padded = String(base64url)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function signState(payload, secret) {
  if (!secret) throw new Error('Missing state secret');
  const json = JSON.stringify(payload);
  const data = base64UrlEncode(json);
  const sig = crypto
    .createHmac('sha256', String(secret))
    .update(data)
    .digest();
  return `${data}.${base64UrlEncode(sig)}`;
}

export function verifyState(state, secret) {
  if (!secret) throw new Error('Missing state secret');
  const [data, sig] = String(state || '').split('.');
  if (!data || !sig) return null;

  const expected = crypto
    .createHmac('sha256', String(secret))
    .update(data)
    .digest();

  // Constant-time compare on the base64url-encoded signature.
  const expectedSig = base64UrlEncode(expected);
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const providedBuf = Buffer.from(sig, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return null;
  const ok = crypto.timingSafeEqual(expectedBuf, providedBuf);
  if (!ok) return null;

  try {
    return JSON.parse(base64UrlDecodeToString(data));
  } catch {
    return null;
  }
}

export function buildGhlAuthorizeUrl({
  authorizeUrl,
  clientId,
  redirectUri,
  scope,
  state
}) {
  if (!authorizeUrl) throw new Error('Missing authorizeUrl');
  if (!clientId) throw new Error('Missing clientId');
  if (!redirectUri) throw new Error('Missing redirectUri');

  const url = new URL(authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  if (scope) url.searchParams.set('scope', scope);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeGhlAuthorizationCode({
  tokenUrl,
  code,
  clientId,
  clientSecret,
  redirectUri
}) {
  if (!tokenUrl) throw new Error('Missing tokenUrl');
  if (!code) throw new Error('Missing code');
  if (!clientId) throw new Error('Missing clientId');
  if (!clientSecret) throw new Error('Missing clientSecret');
  if (!redirectUri) throw new Error('Missing redirectUri');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GHL token exchange failed (HTTP ${response.status}): ${text}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GHL token exchange returned non-JSON: ${text}`);
  }

  const now = Date.now();
  const expiresIn = Number(data.expires_in || data.expiresIn || 0);
  const expiresAt = expiresIn ? new Date(now + expiresIn * 1000).toISOString() : null;

  return {
    accessToken: data.access_token || data.accessToken,
    refreshToken: data.refresh_token || data.refreshToken,
    tokenType: data.token_type || data.tokenType,
    scope: data.scope,
    expiresIn: expiresIn || null,
    expiresAt,
    locationId: data.locationId || data.location_id || null,
    companyId: data.companyId || data.company_id || null,
    raw: data
  };
}

export function isAllowedReturnUrl(returnUrl, allowedOrigins = []) {
  if (!returnUrl) return false;
  let url;
  try {
    url = new URL(returnUrl);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return false;
  if (!allowedOrigins.length) return true;
  return allowedOrigins.includes(url.origin);
}

export function buildFragmentRedirectUrl(returnUrl, fragmentParams) {
  const url = new URL(returnUrl);
  const fragment = new URLSearchParams(fragmentParams);
  url.hash = fragment.toString();
  return url.toString();
}
