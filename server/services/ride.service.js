// services/ride.service.js — RideService implementation
// RequestRide: Client-side Streaming RPC

const grpc = require('@grpc/grpc-js');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { validateToken } = require('../middleware/auth.middleware');
const { calculatePrice } = require('../utils/pricing');

// Client-side streaming: customer sends metadata + waypoints
function requestRide(call, callback) {
  const db = getDb();
  let rideId = null;
  let customerId = null;
  let pickupLoc = null;
  let dropoffLoc = null;
  const waypoints = [];
  let waypointOrder = 0;

  call.on('data', (message) => {
    try {
      if (message.payload === 'metadata') {
        const meta = message.metadata;
        const user = validateToken(meta.session_token);
        if (!user || user.role !== 'CUSTOMER') {
          call.destroy(new Error('UNAUTHENTICATED'));
          return;
        }

        customerId = user.id;
        rideId = uuidv4();

        pickupLoc = db.prepare('SELECT * FROM locations WHERE id = ?').get(meta.pickup_location_id);
        dropoffLoc = db.prepare('SELECT * FROM locations WHERE id = ?').get(meta.dropoff_location_id);

        if (!pickupLoc || !dropoffLoc) {
          call.destroy(new Error('NOT_FOUND: Location not found'));
          return;
        }

        db.prepare(
          `INSERT INTO rides (id, customer_id, pickup_location_id, dropoff_location_id, status, total_price)
           VALUES (?, ?, ?, ?, 'PENDING', 0)`
        ).run(rideId, customerId, meta.pickup_location_id, meta.dropoff_location_id);

        console.log(`[Ride] New ride ${rideId} initiated by ${user.username}`);

      } else if (message.payload === 'waypoint') {
        if (!rideId) return; // metadata not received yet
        const wp = message.waypoint;
        const wpId = uuidv4();
        db.prepare(
          'INSERT INTO waypoints (id, ride_id, lat, lng, name, order_index) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(wpId, rideId, wp.lat, wp.lng, wp.name || '', waypointOrder++);
        waypoints.push({ lat: wp.lat, lng: wp.lng });
        console.log(`[Ride] Waypoint added to ${rideId}: ${wp.name}`);
      }
    } catch (err) {
      console.error('[Ride] requestRide stream error:', err);
    }
  });

  call.on('end', () => {
    if (!rideId || !pickupLoc || !dropoffLoc) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'Data ride tidak lengkap',
      });
    }

    try {
      const pricing = calculatePrice(
        { lat: pickupLoc.lat, lng: pickupLoc.lng },
        { lat: dropoffLoc.lat, lng: dropoffLoc.lng },
        waypoints
      );

      db.prepare("UPDATE rides SET total_price = ?, updated_at = datetime('now') WHERE id = ?")
        .run(pricing.total_price, rideId);

      console.log(`[Ride] ${rideId} priced: Rp${pricing.total_price}, ${waypoints.length} waypoints`);

      callback(null, {
        ride_id: rideId,
        status: 'PENDING',
        total_price: pricing.total_price,
        waypoint_count: waypoints.length,
        message: `Ride dipesan! Total Rp${Math.round(pricing.total_price).toLocaleString('id-ID')}`,
      });
    } catch (err) {
      console.error('[Ride] requestRide end error:', err);
      callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
    }
  });

  call.on('error', (err) => {
    console.error('[Ride] Stream error:', err.message);
  });
}

function getRideStatus(call, callback) {
  const db = getDb();
  const { ride_id, session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user) {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Session tidak valid' });
    }

    const ride = db.prepare(`
      SELECT r.*, u.username as driver_name, u.lat as driver_lat, u.lng as driver_lng
      FROM rides r
      LEFT JOIN users u ON u.id = r.driver_id
      WHERE r.id = ?
    `).get(ride_id);

    if (!ride) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'Ride tidak ditemukan' });
    }

    callback(null, {
      ride_id: ride.id,
      status: ride.status,
      driver_name: ride.driver_name || '',
      driver_lat: ride.driver_lat || 0,
      driver_lng: ride.driver_lng || 0,
    });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function listRides(call, callback) {
  const db = getDb();
  const { session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user) {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Session tidak valid' });
    }

    const rides = db.prepare(`
      SELECT r.id as ride_id, lp.name as pickup_name, ld.name as dropoff_name,
             r.status, r.total_price, r.created_at
      FROM rides r
      JOIN locations lp ON lp.id = r.pickup_location_id
      JOIN locations ld ON ld.id = r.dropoff_location_id
      WHERE r.customer_id = ? OR r.driver_id = ?
      ORDER BY r.created_at DESC
      LIMIT 20
    `).all(user.id, user.id);

    callback(null, { rides });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function cancelRide(call, callback) {
  const db = getDb();
  const { ride_id, session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user) {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Session tidak valid' });
    }

    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride_id);
    if (!ride) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'Ride tidak ditemukan' });
    }

    if (ride.customer_id !== user.id && ride.driver_id !== user.id) {
      return callback({ code: grpc.status.PERMISSION_DENIED, message: 'Tidak berwenang' });
    }

    if (['COMPLETED', 'CANCELLED'].includes(ride.status)) {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: 'Ride sudah selesai atau dibatalkan',
      });
    }

    db.prepare(
      "UPDATE rides SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?"
    ).run(ride_id);

    callback(null, { message: 'Ride berhasil dibatalkan' });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

module.exports = { requestRide, getRideStatus, listRides, cancelRide };
