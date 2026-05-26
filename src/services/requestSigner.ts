import {
  readPersistentString,
  removePersistentStrings,
  writePersistentStrings,
} from './persistentStore';

const PRIVATE_KEY_STORE_KEY = 'REGIONAL_DEVICE_PRIVATE_KEY';
const PUBLIC_KEY_STORE_KEY = 'REGIONAL_DEVICE_PUBLIC_KEY';
const SIGNATURE_CLOCK_OFFSET_STORE_KEY = 'REGIONAL_SIGNATURE_CLOCK_OFFSET_MS';

let cachedKeyPair: { privateKey: CryptoKey; publicKey: CryptoKey } | null = null;
let cachedPublicKeyBase64: string | null = null;
let cachedSignatureClockOffsetMs: number | null = null;

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeSignaturePath(path: string): string {
  try {
    return new URL(path, 'http://regional.local').pathname;
  } catch {
    const queryIndex = path.indexOf('?');
    const hashIndex = path.indexOf('#');
    const endIndexes = [queryIndex, hashIndex].filter(index => index >= 0);
    const endIndex = endIndexes.length ? Math.min(...endIndexes) : path.length;
    return path.slice(0, endIndex) || path;
  }
}

export async function generateKeyPair(): Promise<{ publicKeyBase64: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));

  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  await writePersistentStrings({
    [PRIVATE_KEY_STORE_KEY]: JSON.stringify(privateKeyJwk),
    [PUBLIC_KEY_STORE_KEY]: publicKeyBase64,
  });

  cachedKeyPair = keyPair as { privateKey: CryptoKey; publicKey: CryptoKey };
  cachedPublicKeyBase64 = publicKeyBase64;

  return { publicKeyBase64 };
}

export async function loadOrGenerateKeyPair(): Promise<{ publicKeyBase64: string }> {
  if (cachedKeyPair && cachedPublicKeyBase64) {
    return { publicKeyBase64: cachedPublicKeyBase64 };
  }

  const storedPrivateJwk = await readPersistentString(PRIVATE_KEY_STORE_KEY);
  const storedPublicBase64 = await readPersistentString(PUBLIC_KEY_STORE_KEY);

  if (storedPrivateJwk && storedPublicBase64) {
    try {
      const jwk = JSON.parse(storedPrivateJwk);
      const privateKey = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']
      );
      const publicKeyBuffer = Uint8Array.from(atob(storedPublicBase64), c => c.charCodeAt(0));
      const publicKey = await crypto.subtle.importKey(
        'spki', publicKeyBuffer, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']
      );

      cachedKeyPair = { privateKey, publicKey };
      cachedPublicKeyBase64 = storedPublicBase64;
      return { publicKeyBase64: cachedPublicKeyBase64! };
    } catch {
      // corrupted key data, regenerate
    }
  }

  return generateKeyPair();
}

export function getPublicKeyBase64(): string | null {
  return cachedPublicKeyBase64;
}

function readSignatureClockOffsetMs(): number {
  if (cachedSignatureClockOffsetMs !== null) {
    return cachedSignatureClockOffsetMs;
  }

  try {
    const raw = localStorage.getItem(SIGNATURE_CLOCK_OFFSET_STORE_KEY);
    const parsed = raw == null ? 0 : Number(raw);
    cachedSignatureClockOffsetMs = Number.isFinite(parsed) ? Math.round(parsed) : 0;
  } catch {
    cachedSignatureClockOffsetMs = 0;
  }

  return cachedSignatureClockOffsetMs;
}

function writeSignatureClockOffsetMs(offsetMs: number): void {
  cachedSignatureClockOffsetMs = Math.round(offsetMs);
  try {
    localStorage.setItem(SIGNATURE_CLOCK_OFFSET_STORE_KEY, String(cachedSignatureClockOffsetMs));
  } catch {
    // localStorage may be unavailable during isolated tests or early runtime bootstrap.
  }
}

export function getSignatureTimestampMs(): number {
  return Date.now() + readSignatureClockOffsetMs();
}

export function updateSignatureClockOffset(serverTime: unknown, clientNow = Date.now()): boolean {
  const serverTimeMs = typeof serverTime === 'number' ? serverTime : Number(serverTime);
  if (!Number.isFinite(serverTimeMs) || serverTimeMs <= 0) {
    return false;
  }

  const nextOffset = Math.round(serverTimeMs - clientNow);
  const previousOffset = readSignatureClockOffsetMs();
  writeSignatureClockOffsetMs(nextOffset);
  return Math.abs(nextOffset - previousOffset) >= 1000;
}

export async function clearKeyPair(): Promise<void> {
  cachedKeyPair = null;
  cachedPublicKeyBase64 = null;
  await removePersistentStrings([PRIVATE_KEY_STORE_KEY, PUBLIC_KEY_STORE_KEY]);
}

export interface SignatureHeaders {
  'X-Timestamp': string;
  'X-Nonce': string;
  'X-Signature': string;
  'X-Body-SHA256'?: string;
}

export async function signRequest(
  method: string,
  path: string,
  body?: string
): Promise<SignatureHeaders> {
  if (!cachedKeyPair) {
    throw new Error('密钥对未加载，请先调用 loadOrGenerateKeyPair');
  }

  const timestamp = String(getSignatureTimestampMs());
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(body ?? '');
  const signaturePath = normalizeSignaturePath(path);

  const stringToSign = [
    method.toUpperCase(),
    signaturePath,
    timestamp,
    nonce,
    bodyHash,
    ''
  ].join('\n');

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cachedKeyPair.privateKey,
    new TextEncoder().encode(stringToSign)
  );

  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  const headers: SignatureHeaders = {
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signatureBase64,
  };

  if (body) {
    headers['X-Body-SHA256'] = bodyHash;
  }

  return headers;
}

export async function signWebSocketParams(
  path: string
): Promise<{ ts: string; nonce: string; sig: string }> {
  if (!cachedKeyPair) {
    throw new Error('密钥对未加载');
  }

  const timestamp = String(getSignatureTimestampMs());
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex('');
  const signaturePath = normalizeSignaturePath(path);

  const stringToSign = [
    'GET',
    signaturePath,
    timestamp,
    nonce,
    bodyHash,
    ''
  ].join('\n');

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cachedKeyPair.privateKey,
    new TextEncoder().encode(stringToSign)
  );

  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return {
    ts: timestamp,
    nonce,
    sig: signatureBase64,
  };
}
