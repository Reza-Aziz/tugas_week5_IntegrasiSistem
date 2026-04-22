// api/gateway.js — HTTP/WebSocket client for Express Gateway

const BASE_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws/chat';

// ─── Generic fetch helper ───────────────────────────────────────────────────

async function apiFetch(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  register: (body) => apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: (token) => apiFetch('/api/auth/logout', { method: 'POST', body: JSON.stringify({ session_token: token }) }),
};

// ─── Locations ──────────────────────────────────────────────────────────────

export const locationApi = {
  list: () => apiFetch('/api/locations'),
  pricing: (body) => apiFetch('/api/locations/pricing', { method: 'POST', body: JSON.stringify(body) }),
  search: (q) => apiFetch(`/api/locations/search?q=${encodeURIComponent(q)}`),
};

// ─── Rides ──────────────────────────────────────────────────────────────────

export const rideApi = {
  requestRide: (body, token) =>
    apiFetch('/api/rides', { method: 'POST', body: JSON.stringify(body) }, token),
  listRides: (token) => apiFetch('/api/rides', {}, token),
  getRide: (id, token) => apiFetch(`/api/rides/${id}`, {}, token),
  cancelRide: (id, token) => apiFetch(`/api/rides/${id}`, { method: 'DELETE' }, token),
  rateRide: (id, token, rating, tip) => apiFetch(`/api/rides/${id}/rate`, { method: 'POST', body: JSON.stringify({ rating, tip }) }, token),
};

// ─── Driver ─────────────────────────────────────────────────────────────────

export const driverApi = {
  listPending: (token) => apiFetch('/api/driver/pending', {}, token),
  acceptRide: (rideId, token) =>
    apiFetch(`/api/driver/accept/${rideId}`, { method: 'POST', body: JSON.stringify({ session_token: token }) }, token),
  pickupRide: (rideId, token) =>
    apiFetch(`/api/driver/pickup/${rideId}`, { method: 'POST', body: JSON.stringify({ session_token: token }) }, token),
  completeRide: (rideId, token) =>
    apiFetch(`/api/driver/complete/${rideId}`, { method: 'POST', body: JSON.stringify({ session_token: token }) }, token),
};

// ─── TrackDriver — WebSocket Bridge ──────────────────────────────────────────

export function trackDriver(rideId, token, onLocation, onEnd, onError) {
  const WS_DRIVER_URL = import.meta.env.VITE_WS_DRIVER_URL || 'ws://localhost:3000/ws/driver';
  const ws = new WebSocket(WS_DRIVER_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'START_TRACKING', ride_id: rideId, session_token: token }));
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'END') {
        ws.close();
        onEnd?.();
      } else if (data.type === 'ERROR') {
        ws.close();
        onError?.(data.message);
      } else {
        onLocation?.(data);
      }
    } catch (err) {}
  };

  ws.onerror = (err) => {
    onError?.('WebSocket connection error');
  };

  return () => ws.close();
}

// ─── Chat — WebSocket (bidirectional streaming) ──────────────────────────────

export class ChatWebSocket {
  constructor(rideId, token, onMessage, onError) {
    this.ws = new WebSocket(WS_URL);
    this.rideId = rideId;
    this.token = token;
    this.onMessage = onMessage;
    this.onError = onError;
    this.ready = false;

    this.ws.onopen = () => {
      this.ready = true;
      // Send initial message to authenticate and join ride
      this.send('', rideId, token);
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ERROR') {
          onError?.(msg.message);
        } else {
          onMessage?.(msg);
        }
      } catch (err) {}
    };

    this.ws.onerror = () => {
      onError?.('WebSocket connection error');
    };

    this.ws.onclose = () => {
      this.ready = false;
    };
  }

  send(content, rideId = this.rideId, token = this.token) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ride_id: rideId, content, session_token: token }));
    }
  }

  sendTyping(username, userId, rideId = this.rideId, token = this.token) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'TYPING', sender_name: username, sender_id: userId, ride_id: rideId, session_token: token }));
    }
  }

  close() {
    this.ws.close();
  }
}

// ─── Global Events ──────────────────────────────────────────────────────────

  export function connectGlobalEvents({ token, role, onSurge, onRideStatus, onPendingRides, onTipReceived }) {
    const WS_EVENTS_URL = import.meta.env.VITE_WS_EVENTS_URL || 'ws://localhost:3000/ws/events';
    const ws = new WebSocket(WS_EVENTS_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'AUTH', session_token: token, role }));
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'SURGE_UPDATE') onSurge?.(msg.multiplier);
      if (msg.type === 'RIDE_STATUS') onRideStatus?.(msg.ride);
      if (msg.type === 'PENDING_RIDES') onPendingRides?.(msg.rides);
      if (msg.type === 'TIP_RECEIVED') onTipReceived?.(msg);
    } catch {}
  };

  return {
    watchRide: (rideId) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'WATCH_RIDE', ride_id: rideId })),
    unwatchRide: () => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'UNWATCH_RIDE' })),
    close: () => ws.close()
  };
}

export { BASE_URL };
