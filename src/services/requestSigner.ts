import { load } from '@tauri-apps/plugin-store';

const PRIVATE_KEY_STORE_KEY = 'REGIONAL_DEVICE_PRIVATE_KEY';
const PUBLIC_KEY_STORE_KEY = 'REGIONAL_DEVICE_PUBLIC_KEY';

let cachedKeyPair: { privateKey: CryptoKey; publicKey: CryptoKey } | null = null;
let cachedPublicKeyBase64: string | null = null;
let storeInstance: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!storeInstance) {
    storeInstance = await load('.settings.dat');
  }
  return storeInstance;
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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

  const store = await getStore();
  await store.set(PRIVATE_KEY_STORE_KEY, JSON.stringify(privateKeyJwk));
  await store.set(PUBLIC_KEY_STORE_KEY, publicKeyBase64);
  await store.save();

  cachedKeyPair = keyPair as { privateKey: CryptoKey; publicKey: CryptoKey };
  cachedPublicKeyBase64 = publicKeyBase64;

  return { publicKeyBase64 };
}

export async function loadOrGenerateKeyPair(): Promise<{ publicKeyBase64: string }> {
  if (cachedKeyPair && cachedPublicKeyBase64) {
    return { publicKeyBase64: cachedPublicKeyBase64 };
  }

  const store = await getStore();
  const storedPrivateJwk = await store.get<string>(PRIVATE_KEY_STORE_KEY);
  const storedPublicBase64 = await store.get<string>(PUBLIC_KEY_STORE_KEY);

  if (storedPrivateJwk && storedPublicBase64) {
    try {
      const jwk = JSON.parse(storedPrivateJwk as string);
      const privateKey = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']
      );
      const publicKeyBuffer = Uint8Array.from(atob(storedPublicBase64 as string), c => c.charCodeAt(0));
      const publicKey = await crypto.subtle.importKey(
        'spki', publicKeyBuffer, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']
      );

      cachedKeyPair = { privateKey, publicKey };
      cachedPublicKeyBase64 = storedPublicBase64 as string;
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

export async function clearKeyPair(): Promise<void> {
  cachedKeyPair = null;
  cachedPublicKeyBase64 = null;
  const store = await getStore();
  await store.delete(PRIVATE_KEY_STORE_KEY);
  await store.delete(PUBLIC_KEY_STORE_KEY);
  await store.save();
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

  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex(body ?? '');

  const stringToSign = [
    method.toUpperCase(),
    path,
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

  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = await sha256Hex('');

  const stringToSign = [
    'GET',
    path,
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
    sig: encodeURIComponent(signatureBase64),
  };
}
