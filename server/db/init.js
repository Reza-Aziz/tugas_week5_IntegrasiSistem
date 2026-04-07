// db/init.js — SQLite database initialization
// Uses node-sqlite3-wasm (pure WASM, no native binding required)

const { Database } = require('node-sqlite3-wasm');
const path = require('path');

const DB_PATH = path.join(__dirname, 'jalanyuk.db');

let _db = null;

// ─── DB Wrapper ─────────────────────────────────────────────────────────────
// Wraps node-sqlite3-wasm to provide a better-sqlite3-compatible prepare() API.
// This way all service files can call db.prepare(sql).run(params) / .get() / .all()

class DbWrapper {
  constructor(rawDb) {
    this._db = rawDb;
  }

  exec(sql) {
    this._db.exec(sql);
  }

  prepare(sql) {
    const rawDb = this._db;
    return {
      run: (...args) => {
        const params = flattenParams(args);
        rawDb.run(sql, params);
        // Return changes count via SQLite changes() function
        const res = rawDb.get('SELECT changes() as c');
        return { changes: res ? res.c : 0 };
      },
      get: (...args) => {
        const params = flattenParams(args);
        return rawDb.get(sql, params) || null;
      },
      all: (...args) => {
        const params = flattenParams(args);
        return rawDb.all(sql, params) || [];
      },
    };
  }

  // Simple transaction: just run function immediately (single-threaded, synchronous)
  transaction(fn) {
    return (arg) => {
      this._db.exec('BEGIN');
      try {
        fn(arg);
        this._db.exec('COMMIT');
      } catch (e) {
        this._db.exec('ROLLBACK');
        throw e;
      }
    };
  }
}

function flattenParams(args) {
  if (args.length === 0) return [];
  if (Array.isArray(args[0])) return args[0];
  return args;
}

// ─── Init ────────────────────────────────────────────────────────────────────

function getDb() {
  if (!_db) {
    const rawDb = new Database(DB_PATH);
    _db = new DbWrapper(rawDb);
    initSchema();
    seedLocations();
  }
  return _db;
}

function initSchema() {
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'DRIVER')),
      session_token TEXT,
      lat REAL DEFAULT -7.282,
      lng REAL DEFAULT 112.795,
      status TEXT DEFAULT 'OFFLINE' CHECK(status IN ('ONLINE', 'OFFLINE', 'BUSY')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      category TEXT DEFAULT 'POPULAR'
    );

    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES users(id),
      driver_id TEXT REFERENCES users(id),
      pickup_location_id TEXT NOT NULL REFERENCES locations(id),
      dropoff_location_id TEXT NOT NULL REFERENCES locations(id),
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED')),
      total_price REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS waypoints (
      id TEXT PRIMARY KEY,
      ride_id TEXT NOT NULL REFERENCES rides(id),
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      name TEXT,
      order_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      ride_id TEXT NOT NULL REFERENCES rides(id),
      sender_id TEXT NOT NULL REFERENCES users(id),
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('[DB] Schema initialized');
}

function seedLocations() {
  const row = _db.prepare('SELECT COUNT(*) as c FROM locations').get();
  if (row && row.c > 0) return;

  const locations = [
    ['loc-01', 'ITS (Gedung Rektorat)', 'Kampus ITS Sukolilo, Surabaya', -7.2823, 112.7949, 'POPULAR'],
    ['loc-02', 'Gerbang Utama ITS', 'Jl. Arif Rahman Hakim, Sukolilo, Surabaya', -7.2798, 112.7905, 'POPULAR'],
    ['loc-03', 'Galaxy Mall Surabaya', 'Jl. Dharmahusada Indah Timur, Mulyorejo', -7.2754, 112.7820, 'POPULAR'],
    ['loc-04', 'Pakuwon City Mall', 'Kejawan Putih Tambak, Mulyorejo', -7.2758, 112.8080, 'POPULAR'],
    ['loc-05', 'Stasiun Gubeng', 'Pacar Keling, Tambaksari, Surabaya', -7.2655, 112.7520, 'POPULAR'],
    ['loc-06', 'Tunjungan Plaza', 'Jl. Jenderal Basuki Rachmat, Surabaya', -7.2625, 112.7400, 'POPULAR'],
    ['loc-07', 'Pantai Kenjeran Lama', 'Jl. Pantai Kenjeran, Bulak, Surabaya', -7.2405, 112.7975, 'POPULAR'],
    ['loc-08', 'Bandara Internasional Juanda', 'Sidoarjo, Jawa Timur', -7.3795, 112.7830, 'POPULAR'],
  ];

  const insertTx = _db.transaction((locs) => {
    for (const [id, name, address, lat, lng, category] of locs) {
      _db.prepare(
        'INSERT OR IGNORE INTO locations (id, name, address, lat, lng, category) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, name, address, lat, lng, category);
    }
  });
  insertTx(locations);
  console.log('[DB] Seeded popular Surabaya locations');
}

module.exports = { getDb };
