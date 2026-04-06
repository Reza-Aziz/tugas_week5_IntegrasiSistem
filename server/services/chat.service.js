// services/chat.service.js — ChatService implementation
// Chat: Bi-directional Streaming RPC

const grpc = require('@grpc/grpc-js');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { validateToken } = require('../middleware/auth.middleware');

// In-memory subscriber map: rideId → Set of active call streams
const chatSubscribers = new Map();

function subscribeToRide(rideId, call) {
  if (!chatSubscribers.has(rideId)) {
    chatSubscribers.set(rideId, new Set());
  }
  chatSubscribers.get(rideId).add(call);
}

function unsubscribeFromRide(rideId, call) {
  if (chatSubscribers.has(rideId)) {
    chatSubscribers.get(rideId).delete(call);
    if (chatSubscribers.get(rideId).size === 0) {
      chatSubscribers.delete(rideId);
    }
  }
}

function broadcastToRide(rideId, message, exclude = null) {
  if (!chatSubscribers.has(rideId)) return;
  for (const call of chatSubscribers.get(rideId)) {
    if (call !== exclude) {
      try {
        call.write(message);
      } catch (e) {
        // client disconnected
      }
    }
  }
}

// Bi-directional streaming
function chat(call) {
  const db = getDb();
  let rideId = null;
  let currentUser = null;

  call.on('data', (message) => {
    try {
      // First message must provide session_token and ride_id
      if (!currentUser) {
        currentUser = validateToken(message.session_token);
        if (!currentUser) {
          call.emit('error', {
            code: grpc.status.UNAUTHENTICATED,
            message: 'Session tidak valid',
          });
          return;
        }

        rideId = message.ride_id;
        subscribeToRide(rideId, call);
        console.log(`[Chat] ${currentUser.username} joined ride ${rideId}`);

        // Send chat history on join
        const history = db
          .prepare(
            'SELECT * FROM messages WHERE ride_id = ? ORDER BY created_at ASC LIMIT 50'
          )
          .all(rideId);

        for (const msg of history) {
          try {
            call.write({
              ride_id: msg.ride_id,
              sender_id: msg.sender_id,
              sender_name: msg.sender_name,
              content: msg.content,
              timestamp: msg.created_at,
              session_token: '',
            });
          } catch (e) {}
        }
      }

      // Skip empty or system messages
      if (!message.content || message.content.trim() === '') return;

      // Save to DB
      const msgId = uuidv4();
      db.prepare(
        'INSERT INTO messages (id, ride_id, sender_id, sender_name, content) VALUES (?, ?, ?, ?, ?)'
      ).run(msgId, rideId, currentUser.id, currentUser.username, message.content);

      const outgoing = {
        ride_id: rideId,
        sender_id: currentUser.id,
        sender_name: currentUser.username,
        content: message.content,
        timestamp: new Date().toISOString(),
        session_token: '',
      };

      // Echo back to sender
      try { call.write(outgoing); } catch (e) {}

      // Broadcast to others in the ride
      broadcastToRide(rideId, outgoing, call);

      console.log(`[Chat] ${currentUser.username}: "${message.content}"`);
    } catch (err) {
      console.error('[Chat] Error:', err);
    }
  });

  call.on('end', () => {
    if (rideId) {
      unsubscribeFromRide(rideId, call);
      console.log(`[Chat] ${currentUser?.username} left ride ${rideId}`);
    }
    call.end();
  });

  call.on('error', (err) => {
    if (rideId) unsubscribeFromRide(rideId, call);
    console.error('[Chat] Stream error:', err.message);
  });
}

function getChatHistory(call, callback) {
  const db = getDb();
  const { ride_id, session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user) {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Session tidak valid' });
    }

    const messages = db
      .prepare(
        'SELECT * FROM messages WHERE ride_id = ? ORDER BY created_at ASC LIMIT 100'
      )
      .all(ride_id);

    const chatMessages = messages.map((m) => ({
      ride_id: m.ride_id,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      content: m.content,
      timestamp: m.created_at,
      session_token: '',
    }));

    callback(null, { messages: chatMessages });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

module.exports = { chat, getChatHistory };
