// services/auth.service.js — AuthService implementation

const grpc = require('@grpc/grpc-js');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');

function register(call, callback) {
  const db = getDb();
  const { username, password, role } = call.request;

  try {
    if (!username || !password || !role) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Username, password, dan role harus diisi',
      });
    }

    if (!['CUSTOMER', 'DRIVER'].includes(role)) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Role harus CUSTOMER atau DRIVER',
      });
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(username);
    if (existing) {
      return callback({
        code: grpc.status.ALREADY_EXISTS,
        message: 'Username sudah terdaftar',
      });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const userId = uuidv4();

    db.prepare(
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)'
    ).run(userId, username, hashedPassword, role);

    console.log(`[Auth] Registered: ${username} (${role})`);
    callback(null, {
      user_id: userId,
      message: `Berhasil daftar sebagai ${role}`,
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function login(call, callback) {
  const db = getDb();
  const { username, password } = call.request;

  try {
    if (!username || !password) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Username dan password harus diisi',
      });
    }

    const user = db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username);
    if (!user) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'User tidak ditemukan',
      });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return callback({
        code: grpc.status.UNAUTHENTICATED,
        message: 'Password salah',
      });
    }

    const token = uuidv4();
    db.prepare(
      'UPDATE users SET session_token = ?, status = ? WHERE id = ?'
    ).run(token, 'ONLINE', user.id);

    console.log(`[Auth] Login: ${username}`);
    callback(null, {
      user_id: user.id,
      session_token: token,
      role: user.role,
      username: user.username,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function logout(call, callback) {
  const db = getDb();
  const { session_token } = call.request;

  try {
    const result = db
      .prepare(
        "UPDATE users SET session_token = NULL, status = 'OFFLINE' WHERE session_token = ?"
      )
      .run(session_token);

    if (result.changes === 0) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Session tidak ditemukan',
      });
    }

    callback(null, { message: 'Berhasil logout' });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

module.exports = { register, login, logout };
