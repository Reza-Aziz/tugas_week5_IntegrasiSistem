// pricing.js — JalanYuk pricing & distance utilities

const PRICING = {
  BASE_FARE: 8000,          // IDR 8.000
  PER_KM: 3500,             // IDR 3.500/km
  WAYPOINT_SURCHARGE: 2000, // IDR 2.000 per waypoint
  MIN_FARE: 15000,          // IDR 15.000 minimum
  MOTOR_MIN_FARE: 8000,     // IDR 8.000 minimum for motor
};

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function calculateDistance(coord1, coord2) {
  // Haversine formula
  const R = 6371;
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLng = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coord1.lat)) *
      Math.cos(toRad(coord2.lat)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculatePrice(origin, destination, waypoints = []) {
  let totalDistance = 0;
  const points = [origin, ...waypoints, destination];

  for (let i = 0; i < points.length - 1; i++) {
    totalDistance += calculateDistance(points[i], points[i + 1]);
  }

  const fare =
    PRICING.BASE_FARE +
    totalDistance * PRICING.PER_KM +
    waypoints.length * PRICING.WAYPOINT_SURCHARGE;

  return {
    distance_km: Math.round(totalDistance * 100) / 100,
    base_price: PRICING.BASE_FARE,
    waypoint_surcharge: waypoints.length * PRICING.WAYPOINT_SURCHARGE,
    total_price: Math.max(fare, PRICING.MIN_FARE),
    currency: 'IDR',
  };
}

function calculateHeading(from, to) {
  if (!from || !to) return 0;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

module.exports = { calculatePrice, calculateDistance, calculateHeading, PRICING };
