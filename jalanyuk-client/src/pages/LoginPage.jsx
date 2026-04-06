// pages/LoginPage.jsx — Auth page with login & register

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/UI/Toast';
import { LogIn, UserPlus, Car, User } from 'lucide-react';
import logoImg from '../assets/logo.png';

export function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ username: '', password: '', role: 'CUSTOMER' });
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.username || !form.password) {
      showToast('Username dan password harus diisi', 'warning');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.username, form.password);
        showToast(`Selamat datang, ${form.username}! 👋`, 'success');
      } else {
        await register(form.username, form.password, form.role);
        showToast('Akun berhasil dibuat! Silakan login.', 'success');
        setMode('login');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-mesh" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: 'var(--space-6)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        animation: 'slide-up 0.6s var(--ease-bounce)',
      }}>
        {/* Logo & Branding */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
          <img
            src={logoImg}
            alt="JalanYuk Logo"
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              objectFit: 'cover',
              margin: '0 auto var(--space-4)',
              boxShadow: '0 0 48px rgba(0,210,106,0.4)',
              animation: 'float 3s ease-in-out infinite',
              display: 'block',
            }}
          />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-3xl)',
            fontWeight: 'var(--weight-extrabold)',
            letterSpacing: 'var(--tracking-tight)',
            color: 'var(--text-primary)',
          }}>
            JalanYuk
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            Mau kemana hari ini?
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-glass)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 'var(--radius-2xl)',
          padding: 'var(--space-8)',
          boxShadow: 'var(--shadow-xl)',
        }}>
          {/* Mode Toggle */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-8)',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-1)',
          }}>
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: mode === m ? 'var(--brand-primary)' : 'transparent',
                  color: mode === m ? 'var(--text-on-brand)' : 'var(--text-secondary)',
                  fontWeight: 'var(--weight-semibold)',
                  fontSize: 'var(--text-sm)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  letterSpacing: 'var(--tracking-wide)',
                }}
              >
                {m === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="input-group">
              <label className="input-label">👤 Username</label>
              <input
                className="input-field"
                type="text"
                name="username"
                placeholder="Masukkan username"
                value={form.username}
                onChange={handleChange}
                autoComplete="username"
              />
            </div>

            <div className="input-group">
              <label className="input-label">🔒 Password</label>
              <input
                className="input-field"
                type="password"
                name="password"
                placeholder="Masukkan password"
                value={form.password}
                onChange={handleChange}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {/* Role selector (register only) */}
            {mode === 'register' && (
              <div className="input-group">
                <label className="input-label">Saya adalah:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  {[
                    { value: 'CUSTOMER', label: 'Customer', icon: '🧑' },
                    { value: 'DRIVER', label: 'Driver', icon: '🚗' },
                  ].map(({ value, label, icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, role: value }))}
                      style={{
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: `2px solid ${form.role === value ? 'var(--brand-primary)' : 'rgba(255,255,255,0.08)'}`,
                        background: form.role === value ? 'rgba(0,210,106,0.1)' : 'var(--bg-elevated)',
                        color: form.role === value ? 'var(--brand-primary)' : 'var(--text-secondary)',
                        fontWeight: 'var(--weight-semibold)',
                        fontSize: 'var(--text-sm)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <span>{icon}</span> {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ marginTop: 'var(--space-2)', padding: 'var(--space-4)' }}
            >
              {loading ? (
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              ) : mode === 'login' ? (
                <><LogIn size={16} /> MASUK</>
              ) : (
                <><UserPlus size={16} /> DAFTAR</>
              )}
            </button>
          </form>

          <p style={{
            textAlign: 'center',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            marginTop: 'var(--space-6)',
          }}>
            {mode === 'login' ? (
              <>Belum punya akun? <button onClick={() => setMode('register')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: 'inherit' }}>Daftar</button></>
            ) : (
              <>Sudah punya akun? <button onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', cursor: 'pointer', fontSize: 'inherit' }}>Masuk</button></>
            )}
          </p>
        </div>

        {/* Built with gRPC badge */}
        <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
          <span style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            background: 'var(--bg-elevated)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            ⚡ Powered by gRPC + Node.js
          </span>
        </div>
      </div>
    </div>
  );
}
