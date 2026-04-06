// pages/CustomerPage.jsx — Customer dashboard: booking, tracking, chat

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { locationApi, rideApi, trackDriver } from '../api/gateway';
import { RideMap } from '../components/Map/RideMap';
import { ChatWindow } from '../components/Chat/ChatWindow';
import { showToast } from '../components/UI/Toast';
import {
  MapPin, Flag, Plus, Trash2, Navigation, MessageCircle,
  ChevronsRight, LogOut, History, X, RefreshCw,
} from 'lucide-react';
import logoImg from '../assets/logo.png';

const STATUS_LABELS = {
  PENDING: 'Mencari Driver',
  ACCEPTED: 'Driver Menuju',
  IN_PROGRESS: 'Dalam Perjalanan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export function CustomerPage() {
  const { user, logout } = useAuth();

  // Data
  const [locations, setLocations] = useState([]);
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [waypoints, setWaypoints] = useState([]);
  const [wpForm, setWpForm] = useState({ lat: '', lng: '', name: '' });
  const [pricing, setPricing] = useState(null);

  // State
  const [view, setView] = useState('booking'); // 'booking' | 'tracking' | 'history' | 'chat'
  const [activeRide, setActiveRide] = useState(null);
  const [driverPos, setDriverPos] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [loadingBook, setLoadingBook] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [trackCleanup, setTrackCleanup] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  /* ─ Load locations ─────────────────────────────── */
  useEffect(() => {
    locationApi.list().then((d) => setLocations(d.locations || [])).catch(() => {});
  }, []);

  /* ─ Get pricing when pickup/dropoff changes ─────── */
  useEffect(() => {
    if (!pickup || !dropoff) { setPricing(null); return; }
    const pLoc = locations.find((l) => l.id === pickup);
    const dLoc = locations.find((l) => l.id === dropoff);
    if (!pLoc || !dLoc) return;

    locationApi.pricing({
      origin: pLoc.coord,
      destination: dLoc.coord,
      waypoints: waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
    }).then(setPricing).catch(() => {});
  }, [pickup, dropoff, waypoints, locations]);

  /* ─ Poll ride status when activeRide exists ─────── */
  useEffect(() => {
    if (!activeRide || ['COMPLETED', 'CANCELLED'].includes(activeRide.status)) return;

    const interval = setInterval(async () => {
      try {
        const data = await rideApi.getRide(activeRide.ride_id, user.session_token);
        setActiveRide((prev) => ({ ...prev, ...data }));
        if (data.status === 'ACCEPTED' && !trackCleanup) {
          startTracking(activeRide.ride_id);
        }
        if (['COMPLETED', 'CANCELLED'].includes(data.status)) {
          clearInterval(interval);
          if (data.status === 'COMPLETED') {
            showToast('🏁 Perjalanan selesai! Terima kasih.', 'success');
          }
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRide?.ride_id, trackCleanup]);

  /* ─ Map display state ──────────────────────────── */
  const pickupLoc = locations.find((l) => l.id === pickup);
  const dropoffLoc = locations.find((l) => l.id === dropoff);

  /* ─ Book ride ───────────────────────────────────── */
  async function bookRide() {
    if (!pickup || !dropoff) {
      showToast('Pilih titik jemput dan tujuan dulu', 'warning');
      return;
    }
    setLoadingBook(true);
    try {
      const data = await rideApi.requestRide({
        session_token: user.session_token,
        pickup_location_id: pickup,
        dropoff_location_id: dropoff,
        waypoints: waypoints.map((w) => ({ lat: w.lat, lng: w.lng, name: w.name })),
      }, user.session_token);

      setActiveRide({ ride_id: data.ride_id, status: 'PENDING', total_price: data.total_price });
      setView('tracking');
      showToast(`✅ Ride dipesan! ${data.message}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingBook(false);
    }
  }

  /* ─ Start SSE tracking ──────────────────────────── */
  function startTracking(rideId) {
    const cleanup = trackDriver(
      rideId,
      user.session_token,
      (loc) => {
        setDriverPos(loc);
        setActiveRide((prev) => prev ? { ...prev, status: 'IN_PROGRESS' } : prev);
      },
      () => {
        setDriverPos(null);
        setActiveRide((prev) => prev ? { ...prev, status: 'COMPLETED' } : prev);
        showToast('🏁 Driver telah sampai! Perjalanan selesai.', 'success');
      },
      (err) => console.error('[Track]', err)
    );
    setTrackCleanup(() => cleanup);
  }

  /* ─ Cancel ride ─────────────────────────────────── */
  async function cancelRide() {
    if (!activeRide) return;
    try {
      await rideApi.cancelRide(activeRide.ride_id, user.session_token);
      setActiveRide(null);
      setDriverPos(null);
      if (trackCleanup) { trackCleanup(); setTrackCleanup(null); }
      setView('booking');
      showToast('Ride dibatalkan', 'warning');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  /* ─ Load history ─────────────────────────────────── */
  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await rideApi.listRides(user.session_token);
      setRideHistory(data.rides || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (view === 'history') loadHistory();
  }, [view]);

  /* ─ Add waypoint ─────────────────────────────────── */
  function addWaypoint() {
    const lat = parseFloat(wpForm.lat);
    const lng = parseFloat(wpForm.lng);
    if (isNaN(lat) || isNaN(lng)) {
      showToast('Masukkan koordinat yang valid', 'warning');
      return;
    }
    setWaypoints((w) => [...w, { lat, lng, name: wpForm.name || `Waypoint ${w.length + 1}` }]);
    setWpForm({ lat: '', lng: '', name: '' });
    showToast('⭕ Waypoint ditambahkan', 'success');
  }

  /* ─ Sidebar content ─────────────────────────────── */
  function renderSidebarContent() {
    if (view === 'booking') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1, overflow: 'auto' }}>
          <div>
            <h2 style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--weight-bold)',
              letterSpacing: 'var(--tracking-tight)',
              marginBottom: 'var(--space-1)',
            }}>
              Mau kemana? 🗺️
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              Pilih titik jemput dan tujuan
            </p>
          </div>

          <div className="input-group">
            <label className="input-label">📍 Titik Jemput</label>
            <select className="select-field" value={pickup} onChange={(e) => setPickup(e.target.value)}>
              <option value="">-- Pilih lokasi --</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">🏁 Tujuan</label>
            <select className="select-field" value={dropoff} onChange={(e) => setDropoff(e.target.value)}>
              <option value="">-- Pilih lokasi --</option>
              {locations.filter((l) => l.id !== pickup).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Waypoints */}
          {waypoints.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span className="input-label">⭕ Waypoints</span>
              {waypoints.map((wp, i) => (
                <div key={i} className="glass-card stagger-item" style={{ padding: 'var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--text-sm)' }}>⭕ {wp.name}</span>
                  <button onClick={() => setWaypoints((w) => w.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add waypoint */}
          <details style={{ cursor: 'pointer' }}>
            <summary style={{
              color: 'var(--brand-primary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              userSelect: 'none',
              listStyle: 'none',
            }}>
              <Plus size={14} /> Tambah Waypoint (Client Streaming)
            </summary>
            <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <input className="input-field" placeholder="Nama waypoint" value={wpForm.name}
                onChange={(e) => setWpForm((f) => ({ ...f, name: e.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <input className="input-field" placeholder="Lat (-6.xxx)" value={wpForm.lat}
                  onChange={(e) => setWpForm((f) => ({ ...f, lat: e.target.value }))} />
                <input className="input-field" placeholder="Lng (106.xxx)" value={wpForm.lng}
                  onChange={(e) => setWpForm((f) => ({ ...f, lng: e.target.value }))} />
              </div>
              <button className="btn-secondary" onClick={addWaypoint} style={{ padding: 'var(--space-2)' }}>
                <Plus size={14} /> Tambah
              </button>
            </div>
          </details>

          {/* Pricing */}
          {pricing && (
            <div className="glass-card neon-glow" style={{ animation: 'slide-up 0.3s var(--ease-bounce)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>📏 Jarak</span>
                <span className="font-mono" style={{ fontSize: 'var(--text-sm)' }}>{pricing.distance_km} km</span>
              </div>
              {pricing.waypoint_surcharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>⭕ Surcharge</span>
                  <span className="font-mono" style={{ fontSize: 'var(--text-sm)' }}>Rp{pricing.waypoint_surcharge.toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="divider" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>💰 Total</span>
                <span className="price-display">Rp{Math.round(pricing.total_price).toLocaleString('id-ID')}</span>
              </div>
            </div>
          )}

          <button
            className="btn-primary"
            onClick={bookRide}
            disabled={loadingBook || !pickup || !dropoff}
            style={{ padding: 'var(--space-4)', marginTop: 'auto' }}
          >
            {loadingBook
              ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Memesan...</>
              : <><ChevronsRight size={16} /> PESAN SEKARANG</>}
          </button>
        </div>
      );
    }

    if (view === 'tracking' && activeRide) {
      const statusKey = activeRide.status?.toLowerCase().replace('_', '_') || 'pending';
      const badgeClass = `status-badge status-badge--${activeRide.status?.toLowerCase()}`;

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1 }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-2)' }}>
              Status Ride
            </h2>
            <span className={badgeClass}>
              {STATUS_LABELS[activeRide.status] || activeRide.status}
            </span>
          </div>

          {/* Ride info */}
          <div className="glass-card">
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', letterSpacing: 'var(--tracking-wide)' }}>RIDE ID</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {activeRide.ride_id}
            </div>
          </div>

          {activeRide.driver_name && (
            <div className="glass-card" style={{ animation: 'slide-right 0.3s var(--ease-bounce)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)', letterSpacing: 'var(--tracking-wide)' }}>DRIVER</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--map-driver)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                  boxShadow: '0 0 16px rgba(59,130,246,0.4)',
                }}>🚗</div>
                <div>
                  <div style={{ fontWeight: 'var(--weight-semibold)' }}>{activeRide.driver_name}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>⭐ 4.8 • Toyota Avanza</div>
                </div>
              </div>
            </div>
          )}

          {activeRide.total_price > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Total</span>
              <span className="price-display">Rp{Math.round(activeRide.total_price).toLocaleString('id-ID')}</span>
            </div>
          )}

          <div className="divider" />

          {/* Chat button */}
          {activeRide.status !== 'PENDING' && (
            <button className="btn-secondary" onClick={() => setView('chat')}>
              <MessageCircle size={16} /> BUKA CHAT
            </button>
          )}

          {/* Cancel */}
          {!['COMPLETED', 'CANCELLED'].includes(activeRide.status) && (
            <button className="btn-danger" onClick={cancelRide}>
              <X size={14} /> BATALKAN RIDE
            </button>
          )}

          {['COMPLETED', 'CANCELLED'].includes(activeRide.status) && (
            <button className="btn-primary" onClick={() => { setActiveRide(null); setDriverPos(null); setView('booking'); }}>
              Pesan Lagi
            </button>
          )}

          {activeRide.status === 'PENDING' && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center', animation: 'pulse-dot 2s infinite' }}>
              ⏳ Menunggu driver menerima ride...
            </p>
          )}
        </div>
      );
    }

    if (view === 'history') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)' }}>Riwayat</h2>
            <button onClick={loadHistory} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <RefreshCw size={16} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {loadingHistory ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 80 }} />
              ))
            ) : rideHistory.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 40 }}>Belum ada riwayat perjalanan</p>
            ) : rideHistory.map((ride, i) => (
              <div key={ride.ride_id} className="glass-card stagger-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
                    {ride.pickup_name} → {ride.dropoff_name}
                  </span>
                  <span className={`status-badge status-badge--${ride.status?.toLowerCase()}`}>
                    {ride.status}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                    {new Date(ride.created_at).toLocaleString('id-ID')}
                  </span>
                  <span className="font-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--brand-primary)' }}>
                    Rp{Math.round(ride.total_price).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (view === 'chat' && activeRide) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <button onClick={() => setView('tracking')}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 'var(--space-4) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            ← Kembali ke Status
          </button>
          <ChatWindow rideId={activeRide.ride_id} />
        </div>
      );
    }

    return null;
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Navbar */}
        <div style={{
          padding: 'var(--space-5) var(--space-5) var(--space-4)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}>
          <img src={logoImg} alt="JalanYuk" style={{
            width: 36, height: 36, borderRadius: '50%',
            objectFit: 'cover', flexShrink: 0,
            boxShadow: '0 0 16px rgba(0,210,106,0.3)',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)' }}>JalanYuk</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              👤 {user?.username}
            </div>
          </div>
          <button onClick={logout} title="Logout"
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            <LogOut size={16} />
          </button>
        </div>

        {/* View tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          padding: '0 var(--space-3)',
        }}>
          {[
            { key: 'booking', icon: <MapPin size={14} />, label: 'Pesan' },
            { key: 'tracking', icon: <Navigation size={14} />, label: 'Status', show: !!activeRide },
            { key: 'history', icon: <History size={14} />, label: 'Riwayat' },
          ].filter((t) => t.show !== false).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              style={{
                flex: 1,
                padding: 'var(--space-3) var(--space-2)',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${view === tab.key ? 'var(--brand-primary)' : 'transparent'}`,
                color: view === tab.key ? 'var(--brand-primary)' : 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                letterSpacing: 'var(--tracking-wide)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                transition: 'all 0.2s',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0 }}>
          {renderSidebarContent()}
        </div>
      </aside>

      {/* Map */}
      <main style={{ position: 'relative', height: '100%' }}>
        <RideMap
          locations={locations}
          pickup={pickupLoc ? { lat: pickupLoc.coord.lat, lng: pickupLoc.coord.lng, name: pickupLoc.name } : null}
          dropoff={dropoffLoc ? { lat: dropoffLoc.coord.lat, lng: dropoffLoc.coord.lng, name: dropoffLoc.name } : null}
          waypoints={waypoints}
          driverPos={driverPos}
          flyTo={driverPos || pickupLoc?.coord}
        />

        {/* Floating status bubble on map when tracking */}
        {activeRide && view !== 'tracking' && (
          <div style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            zIndex: 1000,
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-3) var(--space-5)',
            animation: 'slide-right 0.3s var(--ease-bounce)',
            cursor: 'pointer',
          }} onClick={() => setView('tracking')}>
            <span className={`status-badge status-badge--${activeRide.status?.toLowerCase()}`}>
              {STATUS_LABELS[activeRide.status]}
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
