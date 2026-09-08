// Central API configuration — the ONLY place that knows where the API lives.
//
// Production: the app is served from https://www.gadaviral.com and uses a
// root-relative namespace so in-production requests resolve to
//   https://www.gadaviral.com/wp-json/gadaviral/v1/
//
// Development (local): if you run the SPA on localhost for development the
// UI will point at the live website backend so local testing uses the real
// API. This makes local UI behave like the deployed app without needing a
// separate local API. If you prefer the original root-relative behaviour,
// change the condition below or set a VITE_API_BASE in your dev environment.

const PROD_API = '/wp-json/gadaviral/v1';
const LIVE_API = 'https://www.gadaviral.com/wp-json/gadaviral/v1';

function isLocalhost() {
  try {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export const API_BASE = isLocalhost() ? LIVE_API : PROD_API;

/** Build an absolute URL for a namespaced API path, e.g. apiUrl('auth/login'). */
export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, '')}`;
}

export class Api {
  accessToken: string | null = localStorage.getItem('gadv_access');
  refreshToken: string | null = localStorage.getItem('gadv_refresh');
  onUser: ((u: any | null) => void) | null = null;

  setTokens(access: string | null, refresh?: string | null) {
    this.accessToken = access;
    if (access) localStorage.setItem('gadv_access', access);
    else localStorage.removeItem('gadv_access');
    if (refresh !== undefined) {
      this.refreshToken = refresh;
      if (refresh) localStorage.setItem('gadv_refresh', refresh);
      else localStorage.removeItem('gadv_refresh');
    }
  }

  async fetch(path: string, opts: any = {}, retry = true): Promise<any> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await fetch(apiUrl(path), { ...opts, headers, body });
    if (res.status === 401 && retry && this.refreshToken) {
      const ok = await this.tryRefresh();
      if (ok) return this.fetch(path, opts, false);
      this.setTokens(null, null);
      this.onUser?.(null);
      throw new Error('Session expired — please log in again');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // WordPress REST errors look like {code, message, data:{status}}; the
      // previous API used {error:{code, message, details}}. Support both so
      // the API's own human-readable message always reaches the UI.
      const message: string | undefined = data?.error?.message ?? data?.message;
      throw Object.assign(new Error(message ?? `Request failed (${res.status})`), {
        status: res.status,
        code: data?.error?.code ?? data?.code,
        details: data?.error?.details ?? data?.data,
      });
    }
    return data;
  }

  async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(apiUrl('auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.setTokens(data.accessToken, data.refreshToken);
      this.onUser?.(data.user);
      return true;
    } catch {
      return false;
    }
  }

  get(path: string) { return this.fetch(path); }
  post(path: string, body?: any) { return this.fetch(path, { method: 'POST', body }); }
  put(path: string, body?: any) { return this.fetch(path, { method: 'PUT', body }); }
  patch(path: string, body?: any) { return this.fetch(path, { method: 'PATCH', body }); }
  del(path: string) { return this.fetch(path, { method: 'DELETE' }); }
  upload(path: string, formData: FormData, method = 'POST') {
    return this.fetch(path, { method, body: formData });
  }
}

export const api = new Api();
