// components/UI/Toast.jsx

import { useEffect } from 'react';

export function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  return (
    <div className={`toast toast--${type}`} onClick={onClose}>
      <span>{icons[type]}</span>
      <span>{message}</span>
    </div>
  );
}

let _showToast = null;
export function setToastFn(fn) { _showToast = fn; }
export function showToast(message, type = 'info') {
  if (_showToast) _showToast(message, type);
}
