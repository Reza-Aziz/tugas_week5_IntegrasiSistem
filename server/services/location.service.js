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
  const { origin, destination, waypoints = [], service_type = 'STANDARD' } = call.request;
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
    
    let fareMultiplier = 1.0;
    let minFare = PRICING.MIN_FARE;

    if (service_type === 'MOTOR') {
       fareMultiplier = 0.6;
       minFare = PRICING.MOTOR_MIN_FARE;
    }

    const fare = (PRICING.BASE_FARE + distanceKm * PRICING.PER_KM + nWaypoints * PRICING.WAYPOINT_SURCHARGE) * fareMultiplier;

    callback(null, {
      distance_km: Math.round(distanceKm * 100) / 100,
      base_price: PRICING.BASE_FARE,
      waypoint_surcharge: nWaypoints * PRICING.WAYPOINT_SURCHARGE,
      total_price: Math.max(fare, minFare),
      currency: 'IDR',
    });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

async function searchLocation(call, callback) {
  const db = getDb();
  const { query } = call.request;
  try {
    if (!query || query.trim().length < 2) {
      return callback(null, { results: [] });
    }

    // Bounding box for East Java (Jawa Timur): 110.89,-6.74 to 114.63,-8.78
    const viewbox = '110.89,-6.74,114.63,-8.78';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=jsonv2&viewbox=${viewbox}&bounded=1&limit=8`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'JalanYuk-App/1.0 (IntegrationSystem Project)'
      },
      signal: AbortSignal.timeout(5000),
    });

    const data = await response.json();

    if (!Array.isArray(data)) {
      return callback(null, { results: [] });
    }

    const results = [];

    const insertTx = db.transaction((locs) => {
      for (const loc of locs) {
        db.prepare(
          'INSERT OR IGNORE INTO locations (id, name, address, lat, lng, category) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(loc.id, loc.name, loc.address, loc.coord.lat, loc.coord.lng, loc.category);
      }
    });

    for (const item of data) {
      if (!item.place_id || !item.lat || !item.lon) continue;

      const id = `osm_${item.osm_type}_${item.osm_id}`;
      // Extract a short name from the display_name, usually the first segment
      const name = item.name || item.display_name.split(',')[0];
      
      const loc = {
        id,
        name,
        address: item.display_name,
        coord: { lat: parseFloat(item.lat), lng: parseFloat(item.lon) },
        category: 'SEARCH_RESULT',
      };
      
      results.push(loc);
    }

    // Save fetched dynamic locations to DB so requestRide can reference their IDs
    if (results.length > 0) {
      insertTx(results);
    }

    callback(null, { results });
  } catch (err) {
    console.error('[Location] Nominatim search error:', err.message);
    try {
      // Fallback ke pencarian lokal di database
      const localResults = db.prepare(
        "SELECT * FROM locations WHERE name LIKE ? OR address LIKE ? LIMIT 5"
      ).all(`%${query}%`, `%${query}%`);
      
      const results = localResults.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        coord: { lat: row.lat, lng: row.lng },
        category: row.category
      }));
      return callback(null, { results });
    } catch (e) {
      return callback(null, { results: [] });
    }
  }
}

module.exports = { listLocations, getPricing, searchLocation };
