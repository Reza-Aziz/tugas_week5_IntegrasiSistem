// components/Chat/ChatWindow.jsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatWebSocket } from '../../api/gateway';
import { useAuth } from '../../context/AuthContext';
import { Send, X } from 'lucide-react';

export function ChatWindow({ rideId, onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [typingName, setTypingName] = useState(null);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!rideId || !user) return;

    const ws = new ChatWebSocket(
      rideId,
      user.session_token,
      (msg) => {
        if (msg.type === 'TYPING') {
          if (msg.sender_name && msg.sender_id !== user.user_id) {
            setTypingName(msg.sender_name);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setTypingName(null), 2000);
          }
          return;
        }

        if (msg.content) {
          setMessages((prev) => {
            // Deduplicate by checking last few messages
            const isDuplicate = prev.slice(-5).some(
              (m) => m.content === msg.content && m.sender_id === msg.sender_id &&
                Math.abs(new Date(m.timestamp) - new Date(msg.timestamp)) < 2000
            );
            if (isDuplicate) return prev;
            return [...prev, msg];
          });
        }
      },
      (err) => console.error('[Chat]', err)
    );

    wsRef.current = ws;
    setConnected(true);

    return () => {
      ws.close();
      setConnected(false);
    };
  }, [rideId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingName]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || !wsRef.current) return;
    wsRef.current.send(text);
    setInput('');
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else {
      if (wsRef.current && user) {
        wsRef.current.sendTyping(user.username, user.user_id);
      }
    }
  };

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-surface)',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-4)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span>💬</span>
          <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>Chat</span>
          {connected && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--brand-primary)',
              animation: 'pulse-dot 2s infinite',
            }} />
          )}
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 'var(--text-sm)',
            marginTop: 'auto',
            marginBottom: 'auto',
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
            Belum ada pesan. Mulai percakapan!
          </div>
        )}

        {messages.map((msg, i) => {
          const isSelf = msg.sender_id === user?.user_id;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
              {!isSelf && (
                <span style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  marginBottom: 4,
                  marginLeft: 4,
                }}>
                  {msg.sender_name}
                </span>
              )}
              <div className={`chat-bubble chat-bubble--${isSelf ? 'sent' : 'received'}`}>
                {msg.content}
                <div className="chat-bubble__time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          );
        })}
        {typingName && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
             <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 4, marginLeft: 4 }}>
                {typingName} sedang mengetik...
             </span>
             <div className="chat-bubble chat-bubble--received" style={{ display: 'inline-block', width: 'fit-content' }}>
               <span style={{ animation: 'fade 1.5s infinite' }}>●</span>
               <span style={{ animation: 'fade 1.5s infinite 0.2s', marginLeft: 2 }}>●</span>
               <span style={{ animation: 'fade 1.5s infinite 0.4s', marginLeft: 2 }}>●</span>
             </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        gap: 'var(--space-2)',
      }}>
        <input
          type="text"
          className="input-field"
          placeholder="Ketik pesan..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          style={{
            background: 'var(--brand-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '0 var(--space-4)',
            color: 'var(--text-on-brand)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            transition: 'all 0.2s ease',
            flexShrink: 0,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
