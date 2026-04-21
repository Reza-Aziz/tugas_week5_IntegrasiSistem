// pages/CustomerPage.jsx — Customer dashboard: booking, tracking, chat

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { locationApi, rideApi, trackDriver, connectGlobalEvents } from '../api/gateway';
import { RideMap } from '../components/Map/RideMap';
import { ChatWindow } from '../components/Chat/ChatWindow';
import { showToast } from '../components/UI/Toast';
import {
  MapPin, Flag, Plus, Trash2, Navigation, MessageCircle,
  ChevronsRight, LogOut, History, X, RefreshCw, Moon, Sun
} from 'lucide-react';
import logoImg from '../assets/logo.png';
import { useTheme } from '../context/ThemeContext';

const STATUS_LABELS = {
  PENDING: 'Mencari Driver',
  ACCEPTED: 'Driver Menuju',
  IN_PROGRESS: 'Dalam Perjalanan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export function CustomerPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Data
  const [locations, setLocations] = useState([]);
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [waypoints, setWaypoints] = useState([]);
  const [wpForm, setWpForm] = useState({ lat: '', lng: '', name: '' });
  const [pricing, setPricing] = useState(null);

  // Autocomplete states
  const [pickupQuery, setPickupQuery] = useState('');
  const [pickupResults, setPickupResults] = useState([]);
  const [isPickupOpen, setIsPickupOpen] = useState(false);
  const [pickupLoading, setPickupLoading] = useState(false);

  const [dropoffQuery, setDropoffQuery] = useState('');
  const [dropoffResults, setDropoffResults] = useState([]);
  const [isDropoffOpen, setIsDropoffOpen] = useState(false);
  const [dropoffLoading, setDropoffLoading] = useState(false);

  // State
  const [view, setView] = useState('booking'); // 'booking' | 'tracking' | 'history' | 'chat'
  const [activeRide, setActiveRide] = useState(null);
  const [driverPos, setDriverPos] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [loadingBook, setLoadingBook] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [surge, setSurge] = useState(1);
  const eventsRef = useRef(null);
  const trackingRef = useRef(null);

  /* ─ Load locations ─────────────────────────────── */
  useEffect(() => {
    locationApi.list().then((d) => setLocations(d.locations || [])).catch(() => {});
  }, []);

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

  /* ─ Search Autocomplete Hooks ─────────────────────── */
  useEffect(() => {
    if (pickupQuery.length < 3) {
      if (pickupQuery.length === 0) setPickup('');
      setPickupResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setPickupLoading(true);
      locationApi.search(pickupQuery).then(res => {
        setPickupResults(res.results || []);
        setIsPickupOpen(true);
      }).catch(() => {}).finally(() => setPickupLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [pickupQuery]);

  useEffect(() => {
    if (dropoffQuery.length < 3) {
      if (dropoffQuery.length === 0) setDropoff('');
      setDropoffResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setDropoffLoading(true);
      locationApi.search(dropoffQuery).then(res => {
        setDropoffResults(res.results || []);
        setIsDropoffOpen(true);
      }).catch(() => {}).finally(() => setDropoffLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [dropoffQuery]);

  const handleSelectLocation = (loc, type) => {
    setLocations(prev => {
      if (!prev.find(l => l.id === loc.id)) return [...prev, loc];
      return prev;
    });

    if (type === 'pickup') {
      setPickup(loc.id);
      setPickupQuery(loc.name);
      setIsPickupOpen(false);
    } else {
      setDropoff(loc.id);
      setDropoffQuery(loc.name);
      setIsDropoffOpen(false);
    }
  };

  /* ─ Load active ride on mount ───────────────────── */
  useEffect(() => {
    async function initActiveRide() {
      try {
        const data = await rideApi.listRides(user.session_token);
        const active = data.rides?.find(r => ['PENDING', 'ACCEPTED', 'IN_PROGRESS'].includes(r.status));
        if (active) {
          const fullData = await rideApi.getRide(active.ride_id, user.session_token);
          setActiveRide({
            ride_id: active.ride_id,
            total_price: active.total_price,
            ...fullData
          });
          setView('tracking');
        }
      } catch (err) {}
    }
    initActiveRide();
  }, [user.session_token]);

  /* ─ Event-Driven Status & Surge (WebSocket Push) ────────────────── */
  const isFirstSurgeRef = useRef(true);
  const activeRideRef = useRef(activeRide);
  const hasBothPointsRef = useRef(false);

  useEffect(() => {
    activeRideRef.current = activeRide;
  }, [activeRide]);

  useEffect(() => {
    hasBothPointsRef.current = !!(pickup && dropoff);
  }, [pickup, dropoff]);

  useEffect(() => {
    if (!user) return;
    eventsRef.current = connectGlobalEvents({
      token: user.session_token,
      role: 'CUSTOMER',
      onSurge: (multiplier) => {
        setSurge((prev) => {
          if (isFirstSurgeRef.current) {
            isFirstSurgeRef.current = false;
            return multiplier;
          }
          if (!activeRideRef.current && hasBothPointsRef.current && multiplier > prev) {
            showToast('⚠️ Harga berubah karena permintaan tinggi!', 'warning');
          }
          return multiplier;
        });
      },
      onRideStatus: (data) => {
        setActiveRide((prev) => {
          if (!prev || prev.ride_id !== data.ride_id) return prev;
          return { ...prev, ...data };
        });
      }
    });

    return () => eventsRef.current?.close();
  }, [user]);

  // Handle side effects like tracking connection/cleanup and ride completion
  useEffect(() => {
    if (!activeRide) {
      if (trackingRef.current) { trackingRef.current(); trackingRef.current = null; }
      return;
    }

    if (['COMPLETED', 'CANCELLED'].includes(activeRide.status)) {
      if (trackingRef.current) { trackingRef.current(); trackingRef.current = null; }
      
      if (activeRide.status === 'COMPLETED') {
        showToast('🏁 Perjalanan selesai! Terima kasih.', 'success');
      } else if (activeRide.status === 'CANCELLED') {
        showToast('❌ Perjalanan dibatalkan.', 'warning');
      }
      const timer = setTimeout(() => {
        setActiveRide(null);
        setDriverPos(null);
        setView('booking');
      }, 1500);
      return () => clearTimeout(timer);
    } else if (['ACCEPTED', 'IN_PROGRESS'].includes(activeRide.status)) {
      if (!trackingRef.current) {
        trackingRef.current = trackDriver(
          activeRide.ride_id,
          user.session_token,
          (loc) => setDriverPos(loc),
          () => console.log('Tracking stream ended'),
          (err) => console.error('[Track]', err)
        );
      }
    }
  }, [activeRide?.status, activeRide?.ride_id, user.session_token]);

  useEffect(() => {
    if (activeRide?.ride_id) {
       eventsRef.current?.watchRide(activeRide.ride_id);
    } else {
       eventsRef.current?.unwatchRide();
    }
  }, [activeRide?.ride_id]);

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
        surge_multiplier: surge,
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

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      if (trackingRef.current) {
        trackingRef.current();
      }
    };
  }, []);

  /* ─ Cancel ride ─────────────────────────────────── */
  async function cancelRide() {
    if (!activeRide) return;
    try {
      await rideApi.cancelRide(activeRide.ride_id, user.session_token);
      setActiveRide(null);
      setDriverPos(null);
      if (trackingRef.current) { trackingRef.current(); trackingRef.current = null; }
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

          <div className="input-group" style={{ position: 'relative' }}>
            <label className="input-label">📍 Titik Jemput</label>
            <input 
              className="input-field" 
              placeholder="Cari stasiun, mall, jalan..."
              value={pickupQuery}
              onChange={(e) => setPickupQuery(e.target.value)}
              onFocus={() => { if (pickupResults.length > 0) setIsPickupOpen(true); }}
              onBlur={() => setTimeout(() => setIsPickupOpen(false), 200)}
            />
            {pickupLoading && <span style={{ position: 'absolute', right: '12px', top: '34px', fontSize: 12 }}>⏳</span>}
            {isPickupOpen && pickupResults.length > 0 && (
              <div className="autocomplete-dropdown glass-card" style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                maxHeight: 200, overflowY: 'auto', padding: '8px 0', marginTop: 4, display: 'flex', flexDirection: 'column'
              }}>
                {pickupResults.map(l => (
                  <div key={l.id} className="autocomplete-item"
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onClick={() => handleSelectLocation(l, 'pickup')}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{l.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="input-group" style={{ position: 'relative' }}>
            <label className="input-label">🏁 Tujuan</label>
            <input 
              className="input-field" 
              placeholder="Cari stasiun, mall, jalan..."
              value={dropoffQuery}
              onChange={(e) => setDropoffQuery(e.target.value)}
              onFocus={() => { if (dropoffResults.length > 0) setIsDropoffOpen(true); }}
              onBlur={() => setTimeout(() => setIsDropoffOpen(false), 200)}
            />
            {dropoffLoading && <span style={{ position: 'absolute', right: '12px', top: '34px', fontSize: 12 }}>⏳</span>}
            {isDropoffOpen && dropoffResults.length > 0 && (
              <div className="autocomplete-dropdown glass-card" style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                maxHeight: 200, overflowY: 'auto', padding: '8px 0', marginTop: 4, display: 'flex', flexDirection: 'column'
              }}>
                {dropoffResults.map(l => (
                  <div key={l.id} className="autocomplete-item"
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onClick={() => handleSelectLocation(l, 'dropoff')}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{l.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.address}</div>
                  </div>
                ))}
              </div>
            )}
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
                <span className="price-display" style={{ color: surge > 1 ? 'var(--color-error)' : undefined }}>
                   Rp{Math.round(pricing.total_price * surge).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          )}

          {activeRide && (
            <div className="glass-card" style={{ padding: 'var(--space-3)', borderColor: 'var(--color-warning)', marginTop: 'auto', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning)' }}>⚠️ Anda sedang memiliki pesanan aktif.</span>
            </div>
          )}

          <button
            className="btn-primary"
            onClick={bookRide}
            disabled={loadingBook || !pickup || !dropoff || !!activeRide}
            style={{ padding: 'var(--space-4)', marginTop: activeRide ? '0' : 'auto' }}
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
          {['PENDING', 'ACCEPTED'].includes(activeRide.status) && (
            <button className="btn-danger" onClick={cancelRide}>
              <X size={14} /> BATALKAN RIDE
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
          <button onClick={toggleTheme} title="Toggle Theme"
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 4 }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
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
          pickup={
            pickupLoc ? { lat: pickupLoc.coord.lat, lng: pickupLoc.coord.lng, name: pickupLoc.name } :
            activeRide?.pickup_lat ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng, name: 'Titik Jemput' } : null
          }
          dropoff={
            dropoffLoc ? { lat: dropoffLoc.coord.lat, lng: dropoffLoc.coord.lng, name: dropoffLoc.name } :
            activeRide?.dropoff_lat ? { lat: activeRide.dropoff_lat, lng: activeRide.dropoff_lng, name: 'Tujuan' } : null
          }
          waypoints={waypoints.length > 0 ? waypoints : activeRide?.waypoints || []}
          driverPos={driverPos}
          flyTo={driverPos || pickupLoc?.coord || (activeRide?.pickup_lat ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng } : null)}
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
