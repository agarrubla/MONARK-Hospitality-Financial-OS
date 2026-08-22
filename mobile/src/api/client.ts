/**
 * HTTP client for the MONARK cloud API. The bearer token lives on-device;
 * everything else lives on the server, protected by RLS per organization.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE = 'https://monark-api-production.up.railway.app';

const TOKEN_KEY = 'monark.session.token';

export const getToken = (): Promise<string | null> => AsyncStorage.getItem(TOKEN_KEY);
export const setToken = (t: string): Promise<void> => AsyncStorage.setItem(TOKEN_KEY, t);
export const clearToken = (): Promise<void> => AsyncStorage.removeItem(TOKEN_KEY);

/**
 * Device credentials for the silent module session. This module runs inside
 * the MONARK super app: identity will come from the super-app login later,
 * so for now each device provisions its own account transparently.
 */
const DEV_EMAIL_KEY = 'monark.device.email';
const DEV_PASS_KEY = 'monark.device.pass';

export async function getDeviceCreds(): Promise<{ email: string; password: string } | null> {
  const [email, password] = await Promise.all([
    AsyncStorage.getItem(DEV_EMAIL_KEY),
    AsyncStorage.getItem(DEV_PASS_KEY),
  ]);
  return email && password ? { email, password } : null;
}

export async function saveDeviceCreds(creds: { email: string; password: string }): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(DEV_EMAIL_KEY, creds.email),
    AsyncStorage.setItem(DEV_PASS_KEY, creds.password),
  ]);
}

export async function createDeviceCreds(): Promise<{ email: string; password: string }> {
  const rand = (len: number): string => {
    let s = '';
    while (s.length < len) s += Math.random().toString(36).slice(2) + Date.now().toString(36);
    return s.slice(0, len);
  };
  const creds = { email: `device-${rand(20)}@monark.local`, password: rand(40) };
  await Promise.all([
    AsyncStorage.setItem(DEV_EMAIL_KEY, creds.email),
    AsyncStorage.setItem(DEV_PASS_KEY, creds.password),
  ]);
  return creds;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor — revisa tu internet e intenta de nuevo.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(res.status, json.error ?? `Error del servidor (${res.status}).`);
  }
  return json;
}
