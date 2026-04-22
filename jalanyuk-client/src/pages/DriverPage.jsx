// pages/DriverPage.jsx — Driver dashboard: pending rides, active ride, chat

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { driverApi, locationApi, rideApi, trackDriver, connectGlobalEvents } from '../api/gateway';
import { RideMap } from '../components/Map/RideMap';
import { ChatWindow } from '../components/Chat/ChatWindow';
import { showToast } from '../components/UI/Toast';
import { useTheme } from '../context/ThemeContext';
import { RefreshCw, LogOut, CheckCircle, MessageCircle, Car, Moon, Sun, History, Navigation } from 'lucide-react';

export function DriverPage() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [locations, setLocations] = useState([]);
  const [pendingRides, setPendingRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null); 
  const [view, setView] = useState('pending'); // 'pending' | 'active' | 'chat' | 'history'
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [driverPos, setDriverPos] = useState(null);
  const [trackCleanup, setTrackCleanup] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const lastCompletedRideIdRef = useRef(null);

  useEffect(() => {
    if (activeRide && !trackCleanup) {
      const cleanup = trackDriver(
        activeRide.ride_id,
        user.session_token,
        (loc) => setDriverPos(loc),
        () => console.log('[DriverPage] Tracking ended, keeping last position'),
        (err) => console.error(err)
      );
      setTrackCleanup(() => cleanup);
    } else if (!activeRide && trackCleanup) {
      trackCleanup();
      setTrackCleanup(null);
      setDriverPos(null);
    }
  }, [activeRide?.ride_id]);

  const R = 6371e3; // meters
  function calcDistanceMeters(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  const distMeters = (activeRide?.dropoff_lat && driverPos)
    ? calcDistanceMeters(driverPos.lat, driverPos.lng, activeRide.dropoff_lat, activeRide.dropoff_lng)
    : Infinity;

  const canComplete = activeRide?.status === 'IN_PROGRESS' && distMeters <= 300; 


  /* ─ Event-Driven Pending Rides (WebSocket Push) ────────────────── */
  const eventsRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    eventsRef.current = connectGlobalEvents({
      token: user.session_token,
      role: 'DRIVER',
      onPendingRides: (rides) => {
        setPendingRides(rides);
        setLoading(false);
      },
      onTipReceived: (msg) => {
        // Broad check since driver might have already cleared activeRide
        showToast(`🎉 Pelanggan memberi Tip Rp${msg.tip.toLocaleString('id-ID')} dan Bintang ${msg.rating}!`, 'success');
        loadHistory(true);
      }
    });

    return () => eventsRef.current?.close();
  }, [user]);

  useEffect(() => {
    locationApi.list().then((d) => setLocations(d.locations || [])).catch(() => {});
    loadPending(true); 
    loadHistory(true);
  }, []);

  async function loadPending(silent = false) {
    if (!silent) setLoading(true);
    try {
      const data = await driverApi.listPending(user.session_token);
      setPendingRides(data.rides || []);
    } catch (err) {
      if (!silent) showToast(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function loadHistory(silent = false) {
    if (!silent) setLoadingHistory(true);
    try {
      const data = await rideApi.listRides(user.session_token);
      setRideHistory(data.rides || []);
    } catch (err) {
      if (!silent) showToast(err.message, 'error');
    } finally {
      if (!silent) setLoadingHistory(false);
    }
  }

  useEffect(() => {
    if (view === 'history') loadHistory();
  }, [view]);

  async function acceptRide(rideId) {
    setAccepting(rideId);
    try {
      const data = await driverApi.acceptRide(rideId, user.session_token);
      setActiveRide({
        ride_id: rideId,
        customer_name: data.customer_name,
        pickup_lat: data.pickup_lat,
        pickup_lng: data.pickup_lng,
        dropoff_lat: data.dropoff_lat,
        dropoff_lng: data.dropoff_lng,
        waypoints: data.waypoints || [],
        status: 'ACCEPTED',
        service_type: data.service_type || 'STANDARD',
      });
      setView('active');
      showToast(`Ride diterima! Jemput ${data.customer_name}`, 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAccepting(null);
    }
  }

  async function pickupPassenger() {
    if (!activeRide) return;
    try {
      await driverApi.pickupRide(activeRide.ride_id, user.session_token);
      setActiveRide((prev) => ({ ...prev, status: 'IN_PROGRESS' }));
      showToast('Menuju tujuan akhir!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function completeRide() {
    if (!activeRide) return;
    setCompleting(true);
    try {
      lastCompletedRideIdRef.current = activeRide.ride_id;
      await driverApi.completeRide(activeRide.ride_id, user.session_token);
      setActiveRide(null);
      setView('pending');
      showToast('Perjalanan selesai! Bagus.', 'success');
      loadPending();
      loadHistory(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCompleting(false);
    }
  }

  function formatPrice(p) {
    return 'Rp' + Math.round(p).toLocaleString('id-ID');
  }

  const todayEarnings = rideHistory
    .filter(r => r.status === 'COMPLETED' && new Date(r.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, r) => sum + r.total_price + (r.tip || 0), 0);

  function renderContent() {
    if (view === 'chat' && activeRide) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <button onClick={() => setView('active')}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 'var(--space-4) 0', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
            ← Kembali ke Ride
          </button>
          <ChatWindow rideId={activeRide.ride_id} />
        </div>
      );
    }

    if (view === 'active' && activeRide) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1 }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-2)' }}>Ride Aktif</h2>
            <span className="status-badge status-badge--in_progress">IN PROGRESS</span>
          </div>

          <div className="glass-card neon-glow" style={{ animation: 'slide-up 0.4s var(--ease-bounce)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)', letterSpacing: 'var(--tracking-wide)' }}>PENUMPANG</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--bg-elevated)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>🧑</div>
              <div>
                <div style={{ fontWeight: 'var(--weight-semibold)' }}>{activeRide.customer_name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {activeRide.status === 'IN_PROGRESS' ? 'Dalam perjalanan' : 'Menunggu dijemput'}
                </div>
              </div>
            </div>
          </div>

          <div className="divider" />

          <button className="btn-secondary" onClick={() => setView('chat')}>
            <MessageCircle size={16} /> CHAT PENUMPANG
          </button>
          
          {activeRide.status === 'ACCEPTED' ? (
            <button
              className="btn-primary"
              onClick={pickupPassenger}
              style={{ padding: 'var(--space-4)', background: 'var(--brand-primary)' }}
            >
              <CheckCircle size={16} /> JEMPUT PENUMPANG
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={completeRide}
              disabled={completing || !canComplete}
              style={{ padding: 'var(--space-4)', opacity: (!canComplete && !completing) ? 0.6 : 1 }}
            >
              {completing
                ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Memproses...</>
                : <><CheckCircle size={16} /> SELESAIKAN RIDE {activeRide.status === 'IN_PROGRESS' && !canComplete ? (distMeters === Infinity ? '(Mencari sinyal...)' : `(${Math.round(distMeters)}m lagi)`) : ''}</>}
            </button>
          )}
        </div>
      );
    }

    if (view === 'history') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)' }}>Riwayat & Pendapatan</h2>
            <button onClick={() => loadHistory()} disabled={loadingHistory} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <RefreshCw size={16} style={{ animation: loadingHistory ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          <div className="glass-card neon-glow" style={{ background: 'linear-gradient(135deg, #10B981, #059669)', color: 'white' }}>
            <div style={{ fontSize: 'var(--text-xs)', opacity: 0.8, marginBottom: 4 }}>TOTAL PENDAPATAN HARI INI</div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)' }}>{formatPrice(todayEarnings)}</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {loadingHistory ? (
              [...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 80 }} />)
            ) : rideHistory.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 40 }}>Belum ada riwayat perjalanan</p>
            ) : (
              rideHistory.map((ride) => (
                <div key={ride.ride_id} className="glass-card stagger-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                      {ride.pickup_name} → {ride.dropoff_name}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 'var(--weight-bold)', color: 'var(--brand-primary)' }}>{formatPrice(ride.total_price)}</div>
                      {ride.tip > 0 && <div style={{ fontSize: 10, color: '#10B981' }}>+ Tip {formatPrice(ride.tip)}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                      {new Date(ride.created_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                    </div>
                    {ride.rating > 0 && <div style={{ fontSize: 10 }}>{'⭐'.repeat(ride.rating)}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    // Pending rides list
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)' }}>Ride Tersedia</h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-primary)' }}>Live updates via WebSocket</p>
          </div>
          <button
            onClick={() => loadPending()}
            disabled={loading}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
          >
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)
          ) : pendingRides.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>🗺️</div>
              <p style={{ color: 'var(--text-tertiary)' }}>Belum ada ride yang menunggu...</p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--space-2)' }}>Dashboard akan refresh otomatis</p>
            </div>
          ) : (
            pendingRides.map((ride, i) => (
              <div key={ride.ride_id} className="glass-card stagger-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 'var(--space-3)' }}>
                    <div style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📍 {ride.pickup_name}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🏁 {ride.dropoff_name} {ride.service_type === 'MOTOR' ? '🏍️' : '🚗'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="price-display" style={{ fontSize: 'var(--text-lg)' }}>
                      {formatPrice(ride.total_price)}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      📏 {ride.distance_km.toFixed(2)} km
                    </div>
                  </div>
                </div>
                <div style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  👤 {ride.customer_name}
                </div>
                <button
                  className="btn-primary"
                  style={{ padding: 'var(--space-2) var(--space-4)' }}
                  disabled={accepting === ride.ride_id}
                  onClick={() => acceptRide(ride.ride_id)}
                >
                  {accepting === ride.ride_id
                    ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Memproses...</>
                    : <><Car size={14} /> AMBIL RIDE</>}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  const driverPickup = activeRide?.pickup_lat
    ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng, name: 'Pickup Point' }
    : null;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Header */}
        <div style={{
          padding: 'var(--space-5)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
            boxShadow: '0 0 16px rgba(59,130,246,0.4)',
          }}>🚗</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)' }}>Driver Mode</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🟢 {user?.username}
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
            { key: 'pending', icon: <Car size={14} />, label: 'Order' },
            { key: 'active', icon: <Navigation size={14} />, label: 'Status', show: !!activeRide },
            { key: 'history', icon: <History size={14} />, label: 'Histori' },
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

        {/* Active ride indicator */}
        {activeRide && view !== 'active' && (
          <div
            onClick={() => setView('active')}
            style={{
              cursor: 'pointer',
              padding: 'var(--space-3) var(--space-5)',
              background: 'rgba(0,210,106,0.08)',
              borderBottom: '1px solid rgba(0,210,106,0.15)',
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-primary)', animation: 'pulse-dot 2s infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--brand-primary)', fontWeight: 'var(--weight-semibold)' }}>
              Ride aktif — {activeRide.customer_name}
            </span>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', overflow: 'auto', minHeight: 0 }}>
          {renderContent()}
        </div>
      </aside>

      {/* Map */}
      <main style={{ position: 'relative', height: '100%' }}>
        <RideMap
          locations={locations}
          pickup={driverPickup}
          dropoff={activeRide?.dropoff_lat ? { lat: activeRide.dropoff_lat, lng: activeRide.dropoff_lng, name: 'Tujuan' } : null}
          waypoints={activeRide?.waypoints || []}
          driverPos={driverPos}
          driverVehicle={activeRide?.service_type || 'STANDARD'}
          flyTo={driverPos || driverPickup}
        />
      </main>
    </div>
  );
}
