// simulation.js — Driver movement simulation for server-streaming

const { calculateHeading, calculateDistance } = require('./pricing');

function densifyRoute(points, stepMeters = 15) {
  if (points.length < 2) return points;
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dist = calculateDistance(p1, p2) * 1000; // to meters
    const steps = Math.max(1, Math.floor(dist / stepMeters));
    for (let j = 0; j < steps; j++) {
      result.push({
        lat: p1.lat + (p2.lat - p1.lat) * (j / steps),
        lng: p1.lng + (p2.lng - p1.lng) * (j / steps),
      });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Fetch route points from OSRM
 */
async function fetchOSRMRoute(points) {
  if (points.length < 2) return points;
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `http://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const rawGeometry = data.routes[0].geometry.coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }));
      return densifyRoute(rawGeometry, 15);
    }
  } catch (err) {
    console.error('OSRM fetch error:', err);
  }
  
  // Fallback to straight line interpolation if OSRM fails
  return densifyRoute(points, 15);
}



/**
 * Run the simulation sequence and yield points to the callback.
 */
async function runSimulationPhase(route, onUpdate, intervalMs = 1500, stateObj) {
  return new Promise((resolve) => {
    let step = 0;
    stateObj.interval = setInterval(() => {
      if (step >= route.length) {
        clearInterval(stateObj.interval);
        resolve();
        return;
      }

      const current = route[step];
      const next = route[step + 1] || current;
      const heading = calculateHeading(current, next);

      onUpdate({
        lat: current.lat,
        lng: current.lng,
        heading,
        speed: Math.random() * 20 + 30, // 30-50 km/h
        timestamp: new Date().toISOString(),
      });

      step++;
    }, intervalMs);
  });
}

module.exports = { fetchOSRMRoute, runSimulationPhase };
