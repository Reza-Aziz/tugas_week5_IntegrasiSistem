// services/location.service.js — LocationService implementation

const grpc = require('@grpc/grpc-js');
const { getDb } = require('../db/init');
const { calculatePrice } = require('../utils/pricing');

function listLocations(call, callback) {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM locations ORDER BY name').all();
    const locations = rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address || '',
      coord: { lat: r.lat, lng: r.lng },
      category: r.category,
    }));
    callback(null, { locations });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function getPricing(call, callback) {
  const { origin, destination, waypoints = [] } = call.request;
  try {
    if (!origin || !destination) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Origin dan destination harus diisi',
      });
    }

    const wps = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
    const result = calculatePrice(
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
      wps
    );

    callback(null, result);
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function searchLocation(call, callback) {
  const db = getDb();
  const { query } = call.request;
  try {
    if (!query || query.trim().length < 2) {
      return callback(null, { results: [] });
    }
    const rows = db
      .prepare(
        "SELECT * FROM locations WHERE name LIKE ? OR address LIKE ? LIMIT 10"
      )
      .all(`%${query}%`, `%${query}%`);

    const results = rows.map((r) => ({
      id: r.id,
      name: r.name,
      address: r.address || '',
      coord: { lat: r.lat, lng: r.lng },
      category: r.category,
    }));
    callback(null, { results });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

module.exports = { listLocations, getPricing, searchLocation };
