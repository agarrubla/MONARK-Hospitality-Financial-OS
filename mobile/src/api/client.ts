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
