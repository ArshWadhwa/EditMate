const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const CLIENT_ID_KEY = 'editmate.clientId';

/** Anonymous per-browser id that scopes saved presets until EditMate has accounts. */
function clientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    // getRandomValues works on plain-HTTP LAN addresses too (randomUUID needs a secure context).
    id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      signal,
      headers: {
        'X-Client-Id': clientId(),
        ...(body && { 'Content-Type': 'application/json' }),
      },
      body: body && JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Can’t reach the EditMate API');
  }

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload.error ?? `Request failed (${response.status})`, payload.details);
  return payload;
}

export const api = {
  health: (signal) => request('/health', { signal }),
  listPresets: () => request('/presets').then((r) => r.presets),
  createPreset: (preset) => request('/presets', { method: 'POST', body: preset }).then((r) => r.preset),
  deletePreset: (id) => request(`/presets/${id}`, { method: 'DELETE' }),
};
