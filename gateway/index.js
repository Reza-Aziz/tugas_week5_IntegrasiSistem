// gateway/index.js — Express REST → gRPC Gateway
// Bridges browser HTTP requests to the gRPC server

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Load Proto Definitions ────────────────────────────────────────────────

const PROTO_DIR = path.join(__dirname, '../proto');
const GRPC_HOST = process.env.GRPC_HOST || 'localhost:50051';

function loadProto(filename) {
  const pkgDef = protoLoader.loadSync(path.join(PROTO_DIR, filename), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(pkgDef);
}

const authProto     = loadProto('auth.proto');
const locationProto = loadProto('location.proto');
const rideProto     = loadProto('ride.proto');
const driverProto   = loadProto('driver.proto');
const chatProto     = loadProto('chat.proto');

// ─── gRPC Clients ──────────────────────────────────────────────────────────

const creds = grpc.credentials.createInsecure();

const authClient     = new authProto.jalanyuk.auth.AuthService(GRPC_HOST, creds);
const locationClient = new locationProto.jalanyuk.location.LocationService(GRPC_HOST, creds);
const rideClient     = new rideProto.jalanyuk.ride.RideService(GRPC_HOST, creds);
const driverClient   = new driverProto.jalanyuk.driver.DriverService(GRPC_HOST, creds);
const chatClient     = new chatProto.jalanyuk.chat.ChatService(GRPC_HOST, creds);

// ─── Helper ────────────────────────────────────────────────────────────────

function grpcError(res, err) {
  const statusMap = {
    1:  400, // CANCELLED
    2:  500, // UNKNOWN
    3:  400, // INVALID_ARGUMENT
    5:  404, // NOT_FOUND
    6:  409, // ALREADY_EXISTS
    7:  403, // PERMISSION_DENIED
    9:  400, // FAILED_PRECONDITION
    13: 500, // INTERNAL
    14: 503, // UNAVAILABLE
    16: 401, // UNAUTHENTICATED
  };
  const httpStatus = statusMap[err.code] || 500;
  res.status(httpStatus).json({ error: err.message || 'gRPC error', code: err.code });
}

// ─── Auth Routes ───────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  authClient.Register(req.body, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.post('/api/auth/login', (req, res) => {
  authClient.Login(req.body, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.post('/api/auth/logout', (req, res) => {
  authClient.Logout(req.body, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

// ─── Location Routes ───────────────────────────────────────────────────────

app.get('/api/locations', (req, res) => {
  locationClient.ListLocations({}, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.post('/api/locations/pricing', (req, res) => {
  locationClient.GetPricing(req.body, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.get('/api/locations/search', (req, res) => {
  locationClient.SearchLocation({ query: req.query.q || '' }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

// ─── Ride Routes ───────────────────────────────────────────────────────────

// POST /api/rides — wrapper for client-streaming RequestRide
app.post('/api/rides', (req, res) => {
  const { session_token, pickup_location_id, dropoff_location_id, waypoints = [], surge_multiplier = 1.0 } = req.body;

  const call = rideClient.RequestRide((err, response) => {
    if (err) return grpcError(res, err);
    res.json(response);
  });

  // Send metadata first
  call.write({
    payload: 'metadata',
    metadata: { session_token, pickup_location_id, dropoff_location_id, surge_multiplier },
  });

  // Stream waypoints
  for (const wp of waypoints) {
    call.write({ payload: 'waypoint', waypoint: wp });
  }

  call.end();
});

app.get('/api/rides', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  rideClient.ListRides({ session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.get('/api/rides/:id', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  rideClient.GetRideStatus({ ride_id: req.params.id, session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.delete('/api/rides/:id', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  rideClient.CancelRide({ ride_id: req.params.id, session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

// ─── Driver Routes ─────────────────────────────────────────────────────────

app.get('/api/driver/pending', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  driverClient.ListPendingRides({ session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.post('/api/driver/accept/:rideId', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token || req.body.session_token;
  driverClient.AcceptRide({ ride_id: req.params.rideId, session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.post('/api/driver/pickup/:rideId', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token || req.body.session_token;
  driverClient.PickupRide({ ride_id: req.params.rideId, session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

app.post('/api/driver/complete/:rideId', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token || req.body.session_token;
  driverClient.CompleteRide({ ride_id: req.params.rideId, session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

// Note: Driver Tracking has been migrated to WebSocket (/ws/driver)

// ─── Chat Routes ───────────────────────────────────────────────────────────

app.get('/api/chat/history/:rideId', (req, res) => {
  const token = req.query.token;
  chatClient.GetChatHistory({ ride_id: req.params.rideId, session_token: token }, (err, data) => {
    if (err) return grpcError(res, err);
    res.json(data);
  });
});

// ─── HTTP + WebSocket Server ───────────────────────────────────────────────

const server = http.createServer(app);

const wssChat = new WebSocket.Server({ noServer: true });
const wssDriver = new WebSocket.Server({ noServer: true });
const wssEvents = new WebSocket.Server({ noServer: true }); // New events channel

server.on('upgrade', (request, socket, head) => {
  // Use a dummy base URL since we only care about pathname
  const pathname = new URL(request.url, 'http://localhost').pathname;

  if (pathname === '/ws/chat') {
    wssChat.handleUpgrade(request, socket, head, (ws) => {
      wssChat.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/driver') {
    wssDriver.handleUpgrade(request, socket, head, (ws) => {
      wssDriver.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/events') {
    wssEvents.handleUpgrade(request, socket, head, (ws) => {
      wssEvents.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket → gRPC bidirectional streaming
wssChat.on('connection', (ws, req) => {
  console.log('[WS] New chat connection');

  const grpcCall = chatClient.Chat();
  let closed = false;

  grpcCall.on('data', (message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });

  grpcCall.on('error', (err) => {
    console.error('[WS→gRPC] Error:', err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
    }
  });

  grpcCall.on('end', () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      if (message.type === 'TYPING') {
        wssChat.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
             client.send(JSON.stringify(message));
          }
        });
        return;
      }
      if (!closed) grpcCall.write(message);
    } catch (e) {
      console.error('[WS] Invalid message:', e);
    }
  });

  ws.on('close', () => {
    closed = true;
    grpcCall.end();
    console.log('[WS] Chat connection closed');
  });
});

wssDriver.on('connection', (ws, req) => {
  console.log('[WS] New driver tracking connection');
  let grpcCall = null;
  let closed = false;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'START_TRACKING' && msg.ride_id && msg.session_token) {
        grpcCall = driverClient.TrackDriver({ ride_id: msg.ride_id, session_token: msg.session_token });
        
        grpcCall.on('data', (location) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(location));
          }
        });

        grpcCall.on('end', () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'END' }));
            ws.close();
          }
        });

        grpcCall.on('error', (err) => {
          console.error('[WS→gRPC] Tracking error:', err.message);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
            ws.close();
          }
        });
      }
    } catch (e) {
      console.error('[WS] Invalid tracker message:', e);
    }
  });

  ws.on('close', () => {
    closed = true;
    if (grpcCall) grpcCall.cancel();
    console.log('[WS] Driver tracking connection closed');
  });
});

// ─── Global Events & Surge Pricing (WebSocket Push) ────────────────────────
const eventClients = new Set();
let currentSurge = 1.0;

// Internal watcher: polls gRPC on behalf of clients and pushes changes over WS
setInterval(() => {
  if (eventClients.size === 0) return;

  // Surge update: 5% chance every 3 seconds to toggle surge
  if (Math.random() < 0.05) {
    currentSurge = currentSurge === 1.0 ? 1.5 : 1.0;
    const msg = JSON.stringify({ type: 'SURGE_UPDATE', multiplier: currentSurge });
    eventClients.forEach(c => c.ws.send(msg));
  }

  // Push ride updates
  eventClients.forEach(c => {
    if (c.ws.readyState !== WebSocket.OPEN || !c.token) return;

    if (c.role === 'DRIVER') {
      driverClient.ListPendingRides({ session_token: c.token }, (err, data) => {
        if (!err && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'PENDING_RIDES', rides: data.rides || [] }));
        }
      });
    } else if (c.role === 'CUSTOMER' && c.activeRideId) {
      rideClient.GetRideStatus({ ride_id: c.activeRideId, session_token: c.token }, (err, data) => {
        if (!err && c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ type: 'RIDE_STATUS', ride: data }));
        }
      });
    }
  });
}, 3000);

wssEvents.on('connection', (ws) => {
  const clientInfo = { ws, token: null, role: null, activeRideId: null };
  eventClients.add(clientInfo);
  ws.send(JSON.stringify({ type: 'SURGE_UPDATE', multiplier: currentSurge }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'AUTH') {
        clientInfo.token = msg.session_token;
        clientInfo.role = msg.role;
      } else if (msg.type === 'WATCH_RIDE') {
        clientInfo.activeRideId = msg.ride_id;
      } else if (msg.type === 'UNWATCH_RIDE') {
        clientInfo.activeRideId = null;
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    eventClients.delete(clientInfo);
  });
});


const PORT = process.env.GATEWAY_PORT || 3000;
server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   JalanYuk Express Gateway Running   ║');
  console.log(`║   HTTP: http://localhost:${PORT}         ║`);
  console.log(`║   WS:   ws://localhost:${PORT}/ws/chat   ║`);
  console.log(`║   WS:   ws://localhost:${PORT}/ws/driver ║`);
  console.log(`║   WS:   ws://localhost:${PORT}/ws/events ║`);
  console.log('╚══════════════════════════════════════╝');
});
