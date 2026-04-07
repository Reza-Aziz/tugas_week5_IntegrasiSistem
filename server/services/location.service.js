// services/location.service.js — LocationService implementation

const grpc = require('@grpc/grpc-js');
const { getDb } = require('../db/init');
const { calculatePrice, calculateDistance } = require('../utils/pricing');

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

async function getPricing(call, callback) {
  const { origin, destination, waypoints = [] } = call.request;
  try {
    if (!origin || !destination) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Origin dan destination harus diisi',
      });
    }

    const points = [
      { lat: origin.lat, lng: origin.lng },
      ...waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
      { lat: destination.lat, lng: destination.lng },
    ];

    // Try OSRM for real road distance
    let distanceKm = null;
    try {
      const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
      const url = `http://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        distanceKm = data.routes[0].distance / 1000; // meters → km
        console.log(`[Location] OSRM distance: ${distanceKm.toFixed(2)} km`);
      }
    } catch (osrmErr) {
      console.warn('[Location] OSRM unavailable, falling back to Haversine:', osrmErr.message);
    }

    // Fallback to Haversine if OSRM failed
    if (distanceKm === null) {
      distanceKm = 0;
      for (let i = 0; i < points.length - 1; i++) {
        distanceKm += calculateDistance(points[i], points[i + 1]);
      }
    }

    const { PRICING } = require('../utils/pricing');
    const nWaypoints = waypoints.length;
    const fare =
      PRICING.BASE_FARE +
      distanceKm * PRICING.PER_KM +
      nWaypoints * PRICING.WAYPOINT_SURCHARGE;

    callback(null, {
      distance_km: Math.round(distanceKm * 100) / 100,
      base_price: PRICING.BASE_FARE,
      waypoint_surcharge: nWaypoints * PRICING.WAYPOINT_SURCHARGE,
      total_price: Math.max(fare, PRICING.MIN_FARE),
      currency: 'IDR',
    });
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
