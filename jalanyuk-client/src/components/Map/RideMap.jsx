// components/Map/RideMap.jsx — Leaflet map with dark CartoDB tiles

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const DARK_TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

// Custom icons
function createIcon(emoji, size = 32) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6)); transition: transform 1.5s linear;">${emoji}</div>`,
    className: 'driver-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createPulseIcon() {
  return L.divIcon({
    html: `
      <div style="position:relative;width:20px;height:20px">
        <div style="width:20px;height:20px;border-radius:50%;background:#00D26A;box-shadow:0 0 12px rgba(0,210,106,0.6)"></div>
        <div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid #00D26A;animation:pulse-ring 2s ease-out infinite"></div>
      </div>
    `,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

const pickupIcon = () => createIcon('📍', 36);
const dropoffIcon = () => createIcon('🏁', 36);
const waypointIcon = () => createIcon('⭕', 28);
const driverIcon = () => createIcon('🚗', 40);
const locationIcon = () => createIcon('📌', 28);

// Sub-component to fly to new center
function MapFlyTo({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 1.5 });
  }, [center?.[0], center?.[1], zoom, map]);
  return null;
}

export function RideMap({
  locations = [],
  pickup = null,
  dropoff = null,
  waypoints = [],
  driverPos = null,
  flyTo = null,
}) {
  const route = [
    pickup && { lat: pickup.lat, lng: pickup.lng },
    ...waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
    dropoff && { lat: dropoff.lat, lng: dropoff.lng },
  ].filter(Boolean);

  const [osrmRoute, setOsrmRoute] = useState([]);

  useEffect(() => {
    if (route.length < 2) {
      setOsrmRoute([]);
      return;
    }
    let isCancelled = false;
    async function fetchRoute() {
      const coords = route.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `http://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!isCancelled && data.routes && data.routes.length > 0) {
          setOsrmRoute(data.routes[0].geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] })));
          return;
        }
      } catch (e) {
        console.error('OSRM route error', e);
      }
      if (!isCancelled) setOsrmRoute(route); // fallback
    }
    fetchRoute();
    return () => { isCancelled = true; };
  }, [JSON.stringify(route)]);

  const displayRoute = osrmRoute.length >= 2 ? osrmRoute : route;

  const center = flyTo
    ? [flyTo.lat, flyTo.lng]
    : [-6.2088, 106.8456];

  return (
    <MapContainer
      center={[-6.2088, 106.8456]}
      zoom={12}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer url={DARK_TILE} attribution={DARK_ATTR} />

      {flyTo && <MapFlyTo center={[flyTo.lat, flyTo.lng]} zoom={13} />}

      {/* Popular Locations */}
      {locations.map((loc) => (
        <Marker
          key={loc.id}
          position={[loc.coord.lat, loc.coord.lng]}
          icon={locationIcon()}
        >
          <Popup>
            <div style={{ color: '#0A0A0F', fontWeight: 600, minWidth: 140 }}>
              📍 {loc.name}
              <br />
              <small style={{ color: '#555', fontWeight: 400 }}>{loc.address}</small>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Pickup Marker */}
      {pickup && (
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon()}>
          <Popup><b>📍 Titik Jemput</b><br />{pickup.name}</Popup>
        </Marker>
      )}

      {/* Dropoff Marker */}
      {dropoff && (
        <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon()}>
          <Popup><b>🏁 Tujuan</b><br />{dropoff.name}</Popup>
        </Marker>
      )}

      {/* Waypoint Markers */}
      {waypoints.map((wp, i) => (
        <Marker key={i} position={[wp.lat, wp.lng]} icon={waypointIcon()}>
          <Popup>⭕ Waypoint {i + 1}: {wp.name}</Popup>
        </Marker>
      ))}

      {/* Route Polyline */}
      {displayRoute.length >= 2 && (
        <>
          <Polyline
            positions={displayRoute.map((p) => [p.lat, p.lng])}
            color="rgba(0,210,106,0.3)"
            weight={10}
          />
          <Polyline
            positions={displayRoute.map((p) => [p.lat, p.lng])}
            color="#00D26A"
            weight={4}
            dashArray={null}
          />
        </>
      )}

      {/* Driver Marker */}
      {driverPos && (
        <Marker position={[driverPos.lat, driverPos.lng]} icon={driverIcon()}>
          <Popup>🚗 Driver sedang bergerak<br />Speed: {Math.round(driverPos.speed || 0)} km/h</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
