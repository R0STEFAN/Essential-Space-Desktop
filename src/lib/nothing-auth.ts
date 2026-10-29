import type { NothingUser } from '@/types';
import { nothingFetch } from './nothing-fetch';
import { parseNothingJwt } from './crypto';
import { saveDbAuth, clearDbAuth } from './db';

const SSO_ORIGIN = 'https://account.nothing.tech';
const API_V2_BASE = 'https://account.nothing.tech/api/v2';
const CLIENT_ID = 'account-app-native';
const REDIRECT_URI = 'nothing-account-app://oauth2/callback';
const DEVICE_API_KEY = 'YDU0vfkpb2MBU4kjx1r1WvGMRaMVJ8dj4ByhgPECE6PbdstiVFBectExlaKDrwSk';
const USER_AGENT = 'Dart/3.5 (dart:io)';

interface CachedDeviceIdentity {
  deviceId: string;
  privateKey: CryptoKey;
  publicSpkiBase64: string;
  deviceInfoB64: string;
  nextRotationAt: number;
}

export interface AuthflowSession {
  id: string;
  email: string;
  privateKey: CryptoKey;
  publicSpkiBase64: string;
  deviceInfoB64: string;
  deviceId: string;
  xRef: string;
  loginFlow: string;
  codeVerifier: string;
  codeChallenge: string;
  oauthState: string;
  stateToken: string;
  cookies: Record<string, string>;
  createdAt: number;
}

let cachedIdentity: CachedDeviceIdentity | null = null;
const authSessions = new Map<string, AuthflowSession>();

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [k, v] of authSessions.entries()) {
    if (now - v.createdAt > 15 * 60 * 1000) authSessions.delete(k);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function stringToBase64(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}

function base64UrlDecodeToString(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function formatCookieHeader(cookieJar: Record<string, string>): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function extractSetCookies(res: Response, cookieJar: Record<string, string>) {
  let setCookies: string[] = [];
  if (Array.isArray((res as any).rawHeaders)) {
    for (const [k, v] of (res as any).rawHeaders) {
      if (typeof k === 'string' && k.toLowerCase() === 'set-cookie' && v) {
        setCookies.push(v);
      }
    }
  }
  if (!setCookies.length && typeof (res.headers as any).getSetCookie === 'function') {
    setCookies = (res.headers as any).getSetCookie() || [];
  }
  if (!setCookies.length) {
    const raw = res.headers.get('set-cookie');
    if (raw) setCookies = [raw];
  }

  for (const raw of setCookies) {
    if (!raw) continue;
    const pair = String(raw).split(';')[0];
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const k = pair.substring(0, eqIdx).trim();
      const v = pair.substring(eqIdx + 1).trim();
      cookieJar[k] = v;
    }
  }
}

async function buildAppSignature(
  apiKey: string,
  nonce: string,
  timestamp: string,
  path: string,
  body: string
): Promise<string> {
  const bodyBytes = new TextEncoder().encode(body || '');
  const bodyHashBuf = await crypto.subtle.digest('SHA-256', bodyBytes);
  const hashArray = Array.from(new Uint8Array(bodyHashBuf));
  const bodyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const params: Record<string, string> = {
    body: bodyHash,
    nonce,
    path: encodeURIComponent(path),
    timestamp,
  };

  const parts = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`);
  parts.push(`apiKey=${apiKey}`);

  const signingStr = parts.join('&');
  const keyBytes = new TextEncoder().encode(apiKey);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(signingStr));
  return base64UrlEncodeBytes(new Uint8Array(sigBuf));
}

async function signBodyEcdsa(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
  const msg = new TextEncoder().encode(`${timestamp}.${body || ''}`);
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    msg
  );
  return base64UrlEncodeBytes(new Uint8Array(sigBuf));
}

async function buildDeviceHeaders(
  identity: { privateKey: CryptoKey; deviceId: string; deviceInfoB64: string },
  path: string,
  bodyStr: string,
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const devSig = await signBodyEcdsa(identity.privateKey, ts, bodyStr);
  const appSig = await buildAppSignature(DEVICE_API_KEY, nonce, ts, path, bodyStr);

  return {
    'Content-Type': 'application/json',
    'Accept-Language': 'en',
    'X-Device-Id': identity.deviceId,
    'X-Device-Info': identity.deviceInfoB64,
    'X-Request-Timestamp': ts,
    'X-Nonce': nonce,
    'X-App-Signature': appSig,
    'X-Device-Signature': devSig,
    'User-Agent': USER_AGENT,
    'Origin': SSO_ORIGIN,
    ...extraHeaders,
  };
}

const DEVICE_STORAGE_KEY = 'nothing_device_identity';

interface PersistedDeviceIdentity {
  deviceId: string;
  privateKeyJwk: JsonWebKey;
  publicSpkiBase64: string;
  deviceInfoB64: string;
  nextRotationAt: number;
}

async function getOrCreateDeviceIdentity(cookies: Record<string, string>): Promise<CachedDeviceIdentity> {
  if (cachedIdentity && Date.now() < cachedIdentity.nextRotationAt) {
    return cachedIdentity;
  }

  // Check persistent storage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const rawPersisted = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (rawPersisted) {
        const parsed: PersistedDeviceIdentity = JSON.parse(rawPersisted);
        if (
          parsed.deviceId &&
          parsed.privateKeyJwk &&
          parsed.deviceInfoB64 &&
          Date.now() < parsed.nextRotationAt
        ) {
          const privateKey = await crypto.subtle.importKey(
            'jwk',
            parsed.privateKeyJwk,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign']
          );
          cachedIdentity = {
            deviceId: parsed.deviceId,
            privateKey,
            publicSpkiBase64: parsed.publicSpkiBase64,
            deviceInfoB64: parsed.deviceInfoB64,
            nextRotationAt: parsed.nextRotationAt,
          };
          return cachedIdentity;
        }
      }
    } catch (e) {
      console.warn('Failed to restore persisted device identity:', e);
    }
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const spkiDer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicSpkiBase64 = bytesToBase64(new Uint8Array(spkiDer));

  const deviceInfoObj = {
    platform: 'ANDROID',
    identifier: crypto.randomUUID().replace(/-/g, ''),
    client_type: 'APP',
    device_model: 'AIN24',
    device_brand: 'Nothing',
    device_manufacturer: 'Nothing',
    device_architecture: 'arm64-v8a',
    device_hardware: 'qcom',
    device_board: 'taro',
    os_version: '14',
    is_first: true,
    screen_resolution: '1080x2412',
    timezone: 'Europe/Kyiv',
    language: 'en',
    is_emulator: false,
    is_jail_broken: false,
    is_hooked: false,
    is_debug_mode: false,
    network_type: 'wifi',
    public_key: publicSpkiBase64,
  };
  const deviceInfoStr = JSON.stringify(deviceInfoObj);
  const deviceInfoB64 = stringToBase64(deviceInfoStr);

  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const appSig = await buildAppSignature(
    DEVICE_API_KEY,
    nonce,
    ts,
    '/api/v2/device/report',
    deviceInfoStr
  );

  const reportRes = await nothingFetch(`${API_V2_BASE}/device/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Timestamp': ts,
      'X-Nonce': nonce,
      'X-App-Signature': appSig,
      'User-Agent': USER_AGENT,
      'Origin': SSO_ORIGIN,
    },
    body: deviceInfoStr,
  });

  extractSetCookies(reportRes, cookies);
  if (!reportRes.ok) {
    cachedIdentity = null;
    try {
      localStorage.removeItem(DEVICE_STORAGE_KEY);
    } catch {}
    if (reportRes.status === 429) {
      throw new Error(
        'Nothing Cloud temporarily rate-limited requests from your IP address (HTTP 429). Please wait for cooldown or sign in with Bearer Token.'
      );
    }
    const errText = await reportRes.text();
    throw new Error(`Nothing device registration failed (${reportRes.status}): ${errText}`);
  }

  const reportData = (await reportRes.json()) as any;
  cachedIdentity = {
    deviceId: reportData.device_id,
    privateKey: keyPair.privateKey,
    publicSpkiBase64,
    deviceInfoB64,
    nextRotationAt: reportData.next_key_rotation_at
      ? new Date(reportData.next_key_rotation_at).getTime()
      : Date.now() + 25 * 24 * 60 * 60 * 1000,
  };

  // Persist identity to avoid repetitive /device/report calls
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
      const persisted: PersistedDeviceIdentity = {
        deviceId: reportData.device_id,
        privateKeyJwk,
        publicSpkiBase64,
        deviceInfoB64,
        nextRotationAt: cachedIdentity.nextRotationAt,
      };
      localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(persisted));
    } catch (e) {
      console.warn('Failed to persist device identity:', e);
    }
  }

  return cachedIdentity;
}

async function initAuthflowSession(email: string): Promise<AuthflowSession> {
  cleanupExpiredSessions();

  const cookies: Record<string, string> = {};
  const identity = await getOrCreateDeviceIdentity(cookies);
  const { deviceId, privateKey, publicSpkiBase64, deviceInfoB64 } = identity;

  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncodeBytes(verifierBytes);

  const challengeDigest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = base64UrlEncodeBytes(new Uint8Array(challengeDigest));

  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const oauthState = base64UrlEncodeBytes(stateBytes);

  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    state: oauthState,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authRes = await nothingFetch(`${API_V2_BASE}/oauth2/authorize?${authorizeParams.toString()}`, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      ...(Object.keys(cookies).length ? { Cookie: formatCookieHeader(cookies) } : {}),
    },
    redirect: 'manual',
  });

  extractSetCookies(authRes, cookies);
  const location = authRes.headers.get('location') || '';
  let xRef = '';
  let loginFlow = 'default';

  if (location) {
    try {
      const locUrl = new URL(location, SSO_ORIGIN);
      xRef = locUrl.searchParams.get('x_ref') || '';
      loginFlow = locUrl.searchParams.get('login_flow') || 'default';
    } catch {}
  }
  if (!xRef && cookies['__Host-oauth_session_id']) {
    xRef = cookies['__Host-oauth_session_id'];
  }

  const afPath = '/api/v2/authflow';
  const afBody = JSON.stringify({ type: 'login', name: loginFlow || 'default' });
  const afHeaders = await buildDeviceHeaders(identity, afPath, afBody, {
    ...(xRef ? { 'X-OAuth-Session-Id': xRef } : {}),
    ...(Object.keys(cookies).length ? { Cookie: formatCookieHeader(cookies) } : {}),
  });

  const afRes = await nothingFetch(`${API_V2_BASE}/authflow`, {
    method: 'POST',
    headers: afHeaders,
    body: afBody,
  });

  extractSetCookies(afRes, cookies);
  const afData = (await afRes.json().catch(() => ({}))) as any;
  if (!afRes.ok || !afData.state_token) {
    throw new Error(afData.message || 'Failed to start Nothing Account authentication flow');
  }

  const session: AuthflowSession = {
    id: crypto.randomUUID(),
    email,
    privateKey,
    publicSpkiBase64,
    deviceInfoB64,
    deviceId,
    xRef,
    loginFlow,
    codeVerifier,
    codeChallenge,
    oauthState,
    stateToken: afData.state_token,
    cookies,
    createdAt: Date.now(),
  };

  authSessions.set(session.id, session);
  return session;
}

async function postAuthflowInput(
  session: AuthflowSession,
  inputPayload: Record<string, any>
): Promise<{ status: number; data: any }> {
  const bodyStr = JSON.stringify({
    state_token: session.stateToken,
    input: inputPayload,
  });
  const inputPath = '/api/v2/authflow/state/input';
  const headers = await buildDeviceHeaders(session, inputPath, bodyStr, {
    ...(session.xRef ? { 'X-OAuth-Session-Id': session.xRef } : {}),
    ...(Object.keys(session.cookies).length ? { Cookie: formatCookieHeader(session.cookies) } : {}),
  });

  const res = await nothingFetch(`${API_V2_BASE}/authflow/state/input`, {
    method: 'POST',
    headers,
    body: bodyStr,
  });

  extractSetCookies(res, session.cookies);
  const data = (await res.json().catch(() => ({}))) as any;
  if (data?.state_token) {
    session.stateToken = data.state_token;
  }
  return { status: res.status, data };
}

async function resolveAuthorizationCode(session: AuthflowSession, actionData: any): Promise<string> {
  if (actionData?.authorization_code) {
    return actionData.authorization_code;
  }

  let currentUrl: string = actionData?.redirect_url || actionData?.redirectUrl || '';
  if (currentUrl) {
    const parsedInitial = new URL(currentUrl, SSO_ORIGIN);
    const directCode = parsedInitial.searchParams.get('code');
    if (directCode) return directCode;
    currentUrl = parsedInitial.toString();
  } else {
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email offline_access',
      state: session.oauthState,
      code_challenge: session.codeChallenge,
      code_challenge_method: 'S256',
    });
    currentUrl = `${API_V2_BASE}/oauth2/authorize?${authorizeParams.toString()}`;
  }

  for (let hop = 0; hop < 6; hop++) {
    const res = await nothingFetch(currentUrl, {
      method: 'GET',
      headers: {
        Cookie: formatCookieHeader(session.cookies),
        'User-Agent': USER_AGENT,
      },
      redirect: 'manual',
    });
    extractSetCookies(res, session.cookies);

    const loc = res.headers.get('location');
    if (!loc) break;

    const nextUrl = new URL(loc, SSO_ORIGIN);
    const code = nextUrl.searchParams.get('code');
    if (code) return code;

    currentUrl = nextUrl.toString();
  }

  throw new Error('Could not obtain OAuth2 authorization code from Nothing Account');
}

async function exchangeCodeForUser(session: AuthflowSession, code: string): Promise<NothingUser> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: session.codeVerifier,
  });
  const bodyStr = params.toString();
  const tokenPath = '/api/v2/oauth2/token';
  const headers = await buildDeviceHeaders(session, tokenPath, bodyStr, {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(Object.keys(session.cookies).length ? { Cookie: formatCookieHeader(session.cookies) } : {}),
  });

  const tokenRes = await nothingFetch(`${API_V2_BASE}/oauth2/token`, {
    method: 'POST',
    headers,
    body: bodyStr,
  });

  const tokenData = (await tokenRes.json().catch(() => ({}))) as any;
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.message ||
        `Nothing token exchange failed (${tokenRes.status})`
    );
  }

  authSessions.delete(session.id);

  let uuid = `nt_user_${Date.now()}`;
  let email = session.email;
  let userName = 'Nothing User';

  try {
    const parts = tokenData.access_token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(base64UrlDecodeToString(parts[1]));
      if (payload.uuid) uuid = payload.uuid;
      else if (payload.sub) uuid = `sub_${payload.sub}`;
      if (payload.email) email = payload.email;
      if (payload.given_name || payload.family_name) {
        userName = [payload.given_name, payload.family_name].filter(Boolean).join(' ');
      }
    }
  } catch {}

  const user: NothingUser = {
    uuid,
    email,
    userName,
    token: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
  };

  await saveDbAuth(user);
  return user;
}

function isOtpAction(action: any): boolean {
  if (!action) return false;
  return (
    action.type === 'verify_identity' ||
    action.type === 'verify_oob_otp_data' ||
    Boolean(
      action.data &&
        ['verify_oob_otp_data', 'verify_identification_data'].includes(action.data.type)
    )
  );
}

/**
 * Sign in using Nothing Account credentials (email + password)
 */
export async function loginWithCredentials(
  email: string,
  pass: string
): Promise<{ success: boolean; user?: NothingUser; requiresOtp?: boolean; sessionId?: string; maskedEmail?: string; error?: string }> {
  try {
    const session = await initAuthflowSession(email);

    // Step 1: Submit identification (email)
    const idRes = await postAuthflowInput(session, {
      identification: 'email',
      login_id: email,
    });
    let action = idRes.data?.action;

    // Step 2: Handle password submission
    if (action?.type === 'authenticate' || action?.data?.type === 'authenticate') {
      const pwdRes = await postAuthflowInput(session, {
        authentication: 'primary_password',
        password: pass,
      });

      if (![200, 201].includes(pwdRes.status) || pwdRes.data?.error) {
        throw new Error(pwdRes.data?.message || 'Invalid Nothing Account credentials');
      }
      action = pwdRes.data?.action;
    }

    // Step 3: Check if 2FA OTP is required
    if (isOtpAction(action)) {
      let maskedEmail = email;
      const opts = action?.data?.options || action?.options;
      if (Array.isArray(opts)) {
        const emailOpt = opts.find((o: any) => o.type === 'oob_otp' || o.identification === 'email');
        if (emailOpt?.masked_display_name) maskedEmail = emailOpt.masked_display_name;
      }

      return {
        success: false,
        requiresOtp: true,
        sessionId: session.id,
        maskedEmail,
      };
    }

    // Step 4: Complete OAuth flow
    const code = await resolveAuthorizationCode(session, action?.data || action);
    const user = await exchangeCodeForUser(session, code);

    return { success: true, user };
  } catch (err: any) {
    console.error('Login error:', err);
    return { success: false, error: err?.message || 'Login failed' };
  }
}

/**
 * Verify 2FA OTP code
 */
export async function verifyOtp(
  sessionId: string,
  otpCode: string
): Promise<{ success: boolean; user?: NothingUser; error?: string }> {
  try {
    const session = authSessions.get(sessionId);
    if (!session) {
      throw new Error('Authentication session expired. Please sign in again.');
    }

    const res = await postAuthflowInput(session, {
      authentication: 'secondary_oob_otp',
      code: otpCode.trim(),
    });

    if (![200, 201].includes(res.status) || res.data?.error) {
      throw new Error(res.data?.message || 'Invalid verification code');
    }

    const action = res.data?.action;
    const code = await resolveAuthorizationCode(session, action?.data || action);
    const user = await exchangeCodeForUser(session, code);

    return { success: true, user };
  } catch (err: any) {
    console.error('OTP error:', err);
    return { success: false, error: err?.message || 'Verification failed' };
  }
}

/**
 * Sign in directly using a Nothing Bearer Token
 */
export async function loginWithToken(
  token: string
): Promise<{ success: boolean; user?: NothingUser; error?: string }> {
  try {
    let cleanToken = token.trim().replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '');
    let refreshToken: string | undefined = undefined;

    if (cleanToken.startsWith('{') && cleanToken.endsWith('}')) {
      try {
        const parsedJson = JSON.parse(cleanToken);
        if (parsedJson.token || parsedJson.accessToken) {
          cleanToken = (parsedJson.token || parsedJson.accessToken).trim();
        }
        if (parsedJson.refreshToken) {
          refreshToken = String(parsedJson.refreshToken).trim();
        }
      } catch {}
    }

    const parsed = parseNothingJwt(cleanToken);

    if (!parsed) {
      return { success: false, error: 'Invalid JWT token format' };
    }

    const user: NothingUser = {
      uuid: parsed.uuid,
      email: parsed.email,
      userName: parsed.userName || 'Nothing User',
      token: cleanToken,
      refreshToken,
    };

    await saveDbAuth(user);
    return { success: true, user };
  } catch (err: any) {
    console.error('Token login error:', err);
    return { success: false, error: err?.message || 'Token sign-in failed' };
  }
}

/**
 * Log out user
 */
export async function logout(): Promise<void> {
  await clearDbAuth();
}
