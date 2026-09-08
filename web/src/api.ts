export class Api {
  accessToken: string | null = localStorage.getItem('gadv_access');
  refreshToken: string | null = localStorage.getItem('gadv_refresh');
  onUser: ((u: any | null) => void) | null = null;
  // Same-origin by default (the backend serves this app). Override with
  // VITE_API_BASE at build time to host the SPA separately from the API.
  apiBase: string = (import.meta as any).env?.VITE_API_BASE ?? '';

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
    const res = await fetch(`${this.apiBase}/api/v1${path}`, { ...opts, headers, body });
    if (res.status === 401 && retry && this.refreshToken) {
      const ok = await this.tryRefresh();
      if (ok) return this.fetch(path, opts, false);
      this.setTokens(null, null);
      this.onUser?.(null);
      throw new Error('Session expired — please log in again');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data?.error?.message ?? `Request failed (${res.status})`), {
        status: res.status, code: data?.error?.code, details: data?.error?.details,
      });
    }
    return data;
  }

  async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiBase}/api/v1/auth/refresh`, {
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
