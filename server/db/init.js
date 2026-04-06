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
      lat REAL DEFAULT -6.2088,
      lng REAL DEFAULT 106.8456,
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
    ['loc-01', 'Monas', 'Jl. Medan Merdeka, Jakarta Pusat', -6.1754, 106.8272, 'POPULAR'],
    ['loc-02', 'Grand Indonesia', 'Jl. MH Thamrin, Jakarta Pusat', -6.1952, 106.8215, 'POPULAR'],
    ['loc-03', 'Stasiun Gambir', 'Jl. Medan Merdeka Timur, Gambir', -6.1767, 106.8308, 'POPULAR'],
    ['loc-04', 'Blok M Plaza', 'Jl. Sultan Hasanuddin, Kebayoran Baru', -6.2444, 106.7981, 'POPULAR'],
    ['loc-05', 'Universitas Indonesia', 'Depok, Jawa Barat', -6.3638, 106.8269, 'POPULAR'],
    ['loc-06', 'Bandara Soekarno-Hatta', 'Tangerang, Banten', -6.1256, 106.6558, 'POPULAR'],
    ['loc-07', 'Ancol Dreamland', 'Jl. Lodan Timur, Ancol', -6.1247, 106.8456, 'POPULAR'],
    ['loc-08', 'Senayan City', 'Jl. Asia Afrika, Gelora', -6.2273, 106.7973, 'POPULAR'],
  ];

  const insertTx = _db.transaction((locs) => {
    for (const [id, name, address, lat, lng, category] of locs) {
      _db.prepare(
        'INSERT OR IGNORE INTO locations (id, name, address, lat, lng, category) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, name, address, lat, lng, category);
    }
  });
  insertTx(locations);
  console.log('[DB] Seeded popular Jakarta locations');
}

module.exports = { getDb };
