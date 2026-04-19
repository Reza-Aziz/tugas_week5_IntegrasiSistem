// App.jsx — Root app with auth routing and toast system

import { useState, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { CustomerPage } from './pages/CustomerPage';
import { DriverPage } from './pages/DriverPage';
import { Toast, setToastFn } from './components/UI/Toast';
import { ThemeProvider } from './context/ThemeContext';

function InnerApp() {
  const { user } = useAuth();
  const [toast, setToast] = useState(null);

  const showToastFn = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  useEffect(() => {
    setToastFn(showToastFn);
  }, [showToastFn]);

  return (
    <>
      {!user ? (
        <LoginPage />
      ) : user.role === 'DRIVER' ? (
        <DriverPage />
      ) : (
        <CustomerPage />
      )}
      
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

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </ThemeProvider>
  );
}
