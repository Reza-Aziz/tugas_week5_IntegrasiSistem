// App.jsx — Root app with auth routing and toast system

import { useState, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CustomerPage } from './pages/CustomerPage';
import { DriverPage } from './pages/DriverPage';
import { Toast, setToastFn } from './components/UI/Toast';

function AppContent() {
  const { user } = useAuth();
  const [toast, setToast] = useState(null);

  const showToastFn = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  // Register global toast function
  useState(() => { setToastFn(showToastFn); });

  if (!user) return <LoginPage />;
  if (user.role === 'DRIVER') return <DriverPage />;
  return <CustomerPage />;

  return (
    <>
      {user?.role === 'DRIVER' ? <DriverPage /> : user ? <CustomerPage /> : <LoginPage />}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}

import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  const [toast, setToast] = useState(null);

  const showToastFn = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  // Make toast available globally
  setToastFn(showToastFn);

  return (
    <ThemeProvider>
      <AuthProvider>
        <InnerApp setToast={setToast} toast={toast} />
      </AuthProvider>
    </ThemeProvider>
  );
}

function InnerApp({ setToast, toast }) {
  const { user } = useAuth();

  const showToastFn = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, [setToast]);

  setToastFn(showToastFn);

  return (
    <>
      {!user && <LoginPage />}
      {user?.role === 'CUSTOMER' && <CustomerPage />}
      {user?.role === 'DRIVER' && <DriverPage />}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
