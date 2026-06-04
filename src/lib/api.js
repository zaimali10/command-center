// API wrapper for Hermes /api/* — auto-detects local proxy vs GitHub Pages.
export const API = {
  baseUrl: '',
  live: false,
  async init() {
    try {
      const host = document.location.hostname;
      const isLocal = host === 'localhost' ||
                      host === '127.0.0.1' ||
                      host === '192.168.1.30' ||
                      host.startsWith('192.168.');
      if (!isLocal) {
        // On GitHub Pages — try the LAN IP for live data.
        this.baseUrl = 'http://192.168.1.30:9119';
      }
      const status = await this.get('/api/status');
      this.live = !!status;
    } catch {
      this.live = false;
    }
    return this.live;
  },
  async get(path) {
    try {
      const r = await fetch(this.baseUrl + path, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  },
};
