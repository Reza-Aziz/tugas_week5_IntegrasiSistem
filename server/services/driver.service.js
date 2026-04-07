// services/driver.service.js — DriverService implementation
// TrackDriver: Server-side Streaming RPC

const grpc = require('@grpc/grpc-js');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const { validateToken } = require('../middleware/auth.middleware');
const { calculatePrice } = require('../utils/pricing');
const { fetchOSRMRoute, runSimulationPhase } = require('../utils/simulation');

// Server-side streaming: push driver location to customer
async function trackDriver(call) {
  const db = getDb();
  const { ride_id, session_token } = call.request;

  const user = validateToken(session_token);
  if (!user) {
    call.emit('error', {
      code: grpc.status.UNAUTHENTICATED,
      message: 'Session tidak valid',
    });
    return;
  }

  const ride = db.prepare(`
    SELECT r.*, lp.lat as pickup_lat, lp.lng as pickup_lng,
           ld.lat as dropoff_lat, ld.lng as dropoff_lng
    FROM rides r
    JOIN locations lp ON lp.id = r.pickup_location_id
    JOIN locations ld ON ld.id = r.dropoff_location_id
    WHERE r.id = ?
  `).get(ride_id);

  if (!ride) {
    call.emit('error', { code: grpc.status.NOT_FOUND, message: 'Ride tidak ditemukan' });
    return;
  }

  // Build waypoints from DB
  const dbWaypoints = db
    .prepare('SELECT * FROM waypoints WHERE ride_id = ? ORDER BY order_index')
    .all(ride_id);

  const pickup = { lat: ride.pickup_lat, lng: ride.pickup_lng };
  const dropoff = { lat: ride.dropoff_lat, lng: ride.dropoff_lng };
  const waypoints = dbWaypoints.map((w) => ({ lat: w.lat, lng: w.lng }));

  const offset = 0.015;
  const driverStart = {
    lat: pickup.lat + (Math.random() > 0.5 ? offset : -offset),
    lng: pickup.lng + (Math.random() > 0.5 ? offset : -offset),
  };

  console.log(`[Driver] TrackDriver started for ride ${ride_id}`);

  const stateObj = { interval: null, cancelled: false };

  call.on('cancelled', () => {
    console.log(`[Driver] TrackDriver cancelled for ride ${ride_id}`);
    stateObj.cancelled = true;
    if (stateObj.interval) clearInterval(stateObj.interval);
  });

  const onUpdate = (location) => {
    if (stateObj.cancelled) return;
    try {
      call.write(location);
    } catch (e) {}
  };

  try {
    // PHASE 1: Skip route to pickup. Driver spawns exactly at pickup location.
    // Driver waits for manual "Pickup" button press (which sets status to IN_PROGRESS).
    console.log(`[Driver] Ride ${ride_id} started at pickup. Waiting for pickup button press...`);
    
    while (!stateObj.cancelled) {
      const currentRide = db.prepare('SELECT status FROM rides WHERE id = ?').get(ride_id);
      if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(currentRide.status)) {
        break;
      }
      onUpdate({ lat: pickup.lat, lng: pickup.lng, heading: 0, speed: 0, timestamp: new Date().toISOString() });
      await new Promise(r => setTimeout(r, 2000));
    }
    
    if (stateObj.cancelled) return;
    const currentRide = db.prepare('SELECT status FROM rides WHERE id = ?').get(ride_id);
    if (currentRide.status === 'CANCELLED') return;

    if (stateObj.cancelled) return;
    await new Promise(r => setTimeout(r, 2000)); // Passenger boarding time

    // PHASE 2: To Dropoff
    const routeToDropoff = await fetchOSRMRoute([pickup, ...waypoints, dropoff]);
    if (stateObj.cancelled) return;
    await runSimulationPhase(routeToDropoff, onUpdate, 300, stateObj);

    if (stateObj.cancelled) return;
    console.log(`[Driver] Ride ${ride_id} reached dropoff. Waiting for completion...`);
    
    // PHASE 3: Waiting for Driver to complete manually
    stateObj.interval = setInterval(() => {
      onUpdate({
        lat: dropoff.lat,
        lng: dropoff.lng,
        heading: 0,
        speed: 0,
        timestamp: new Date().toISOString()
      });
    }, 3000);
  } catch (err) {
    console.error('Simulation error:', err);
  }
}

function acceptRide(call, callback) {
  const db = getDb();
  const { ride_id, session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user || user.role !== 'DRIVER') {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Hanya driver yang bisa accept ride' });
    }

    const ride = db.prepare(`
      SELECT r.*, u.username as customer_name,
             lp.lat as pickup_lat, lp.lng as pickup_lng, lp.name as pickup_name,
             ld.lat as dropoff_lat, ld.lng as dropoff_lng
      FROM rides r
      JOIN users u ON u.id = r.customer_id
      JOIN locations lp ON lp.id = r.pickup_location_id
      JOIN locations ld ON ld.id = r.dropoff_location_id
      WHERE r.id = ?
    `).get(ride_id);

    if (!ride) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'Ride tidak ditemukan' });
    }

    if (ride.status !== 'PENDING') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: 'Ride sudah diambil driver lain atau tidak tersedia',
      });
    }

    db.prepare(
      "UPDATE rides SET driver_id = ?, status = 'ACCEPTED', updated_at = datetime('now') WHERE id = ?"
    ).run(user.id, ride_id);

    db.prepare("UPDATE users SET status = 'BUSY' WHERE id = ?").run(user.id);

    console.log(`[Driver] ${user.username} accepted ride ${ride_id}`);

    callback(null, {
      message: 'Ride berhasil diterima!',
      customer_name: ride.customer_name,
      pickup_lat: ride.pickup_lat,
      pickup_lng: ride.pickup_lng,
      dropoff_lat: ride.dropoff_lat,
      dropoff_lng: ride.dropoff_lng,
    });
  } catch (err) {
    console.error('[Driver] acceptRide error:', err);
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function pickupRide(call, callback) {
  const db = getDb();
  const { ride_id, session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user || user.role !== 'DRIVER') {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Hanya driver yang bisa melalukan pickup' });
    }

    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride_id);
    if (!ride) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'Ride tidak ditemukan' });
    }

    if (ride.status !== 'ACCEPTED') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: 'Ride status harus ACCEPTED',
      });
    }

    db.prepare(
      "UPDATE rides SET status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?"
    ).run(ride_id);

    console.log(`[Driver] ${user.username} picked up ride ${ride_id}`);

    callback(null, { message: 'Penumpang berhasil dijemput!' });
  } catch (err) {
    console.error('[Driver] pickupRide error:', err);
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function listPendingRides(call, callback) {
  const db = getDb();
  const { session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user || user.role !== 'DRIVER') {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Hanya driver yang bisa lihat pending rides' });
    }

    const rides = db.prepare(`
      SELECT r.id as ride_id, cu.username as customer_name,
             lp.name as pickup_name, ld.name as dropoff_name,
             r.total_price,
             lp.lat as pickup_lat, lp.lng as pickup_lng,
             ld.lat as dropoff_lat, ld.lng as dropoff_lng
      FROM rides r
      JOIN users cu ON cu.id = r.customer_id
      JOIN locations lp ON lp.id = r.pickup_location_id
      JOIN locations ld ON ld.id = r.dropoff_location_id
      WHERE r.status = 'PENDING'
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all();

    const { calculateDistance } = require('../utils/pricing');

    const pendingRides = rides.map((r) => ({
      ride_id: r.ride_id,
      customer_name: r.customer_name,
      pickup_name: r.pickup_name,
      dropoff_name: r.dropoff_name,
      distance_km: calculateDistance(
        { lat: r.pickup_lat, lng: r.pickup_lng },
        { lat: r.dropoff_lat, lng: r.dropoff_lng }
      ),
      total_price: r.total_price,
    }));

    callback(null, { rides: pendingRides });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

function completeRide(call, callback) {
  const db = getDb();
  const { ride_id, session_token } = call.request;

  try {
    const user = validateToken(session_token);
    if (!user || user.role !== 'DRIVER') {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Akses ditolak' });
    }

    const ride = db.prepare('SELECT * FROM rides WHERE id = ? AND driver_id = ?').get(ride_id, user.id);
    if (!ride) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'Ride tidak ditemukan' });
    }

    db.prepare(
      "UPDATE rides SET status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?"
    ).run(ride_id);

    db.prepare("UPDATE users SET status = 'ONLINE' WHERE id = ?").run(user.id);

    callback(null, { message: 'Ride selesai! Terima kasih.' });
  } catch (err) {
    callback({ code: grpc.status.INTERNAL, message: 'Internal server error' });
  }
}

// Client-side streaming: driver continuously streams GPS coordinates
function updateLocation(call, callback) {
  const db = getDb();
  let currentUser = null;
  let updateCount = 0;
  let lastLat = null;
  let lastLng = null;

  call.on('data', (message) => {
    try {
      // Authenticate on first message
      if (!currentUser) {
        currentUser = validateToken(message.session_token);
        if (!currentUser) {
          call.destroy({
            code: grpc.status.UNAUTHENTICATED,
            message: 'Session tidak valid',
          });
          return;
        }
        console.log(`[Driver] ${currentUser.username} started location streaming`);
      }

      lastLat = message.lat;
      lastLng = message.lng;
      updateCount++;

      // Persist every update to DB
      db.prepare('UPDATE users SET lat = ?, lng = ? WHERE id = ?')
        .run(lastLat, lastLng, currentUser.id);

      console.log(
        `[Driver] Location update #${updateCount} from ${currentUser.username}: (${lastLat.toFixed(5)}, ${lastLng.toFixed(5)})`
      );
    } catch (err) {
      console.error('[Driver] updateLocation stream error:', err);
    }
  });

  call.on('end', () => {
    if (!currentUser) {
      return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Session tidak valid' });
    }
    console.log(`[Driver] ${currentUser.username} ended location stream — ${updateCount} updates sent`);
    callback(null, {
      message: `Streaming selesai. ${updateCount} lokasi berhasil diperbarui`,
    });
  });

  call.on('error', (err) => {
    console.error('[Driver] updateLocation stream error:', err.message);
  });
}

module.exports = { trackDriver, acceptRide, pickupRide, listPendingRides, completeRide, updateLocation };
