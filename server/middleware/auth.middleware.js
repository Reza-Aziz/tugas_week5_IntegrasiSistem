// middleware/auth.middleware.js — Token validation helper

const { getDb } = require('../db/init');

function validateToken(sessionToken) {
  const db = getDb();
  if (!sessionToken) return null;
  const user = db
    .prepare('SELECT * FROM users WHERE session_token = ?')
    .get(sessionToken);
  return user || null;
}

function requireAuth(sessionToken, callback) {
  const user = validateToken(sessionToken);
  if (!user) {
    const grpc = require('@grpc/grpc-js');
    callback({
      code: grpc.status.UNAUTHENTICATED,
      message: 'Session tidak valid atau sudah expired',
    });
    return null;
  }
  return user;
}

module.exports = { validateToken, requireAuth };
