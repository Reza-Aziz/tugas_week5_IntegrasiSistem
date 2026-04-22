// server/index.js — JalanYuk gRPC Server Entry Point

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// Initialize DB first
const { getDb } = require('./db/init');
getDb();

// Load proto files
const PROTO_DIR = path.join(__dirname, '../proto');

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

// Load services
const authService     = require('./services/auth.service');
const locationService = require('./services/location.service');
const rideService     = require('./services/ride.service');
const driverService   = require('./services/driver.service');
const chatService     = require('./services/chat.service');

// Create gRPC server
const server = new grpc.Server();

// Register all 5 services
server.addService(authProto.jalanyuk.auth.AuthService.service, {
  Register: authService.register,
  Login: authService.login,
  Logout: authService.logout,
});

server.addService(locationProto.jalanyuk.location.LocationService.service, {
  ListLocations: locationService.listLocations,
  GetPricing: locationService.getPricing,
  SearchLocation: locationService.searchLocation,
});

server.addService(rideProto.jalanyuk.ride.RideService.service, {
  RequestRide: rideService.requestRide,
  GetRideStatus: rideService.getRideStatus,
  ListRides: rideService.listRides,
  CancelRide: rideService.cancelRide,
  RateRide: rideService.rateRide,
});

server.addService(driverProto.jalanyuk.driver.DriverService.service, {
  TrackDriver: driverService.trackDriver,
  AcceptRide: driverService.acceptRide,
  PickupRide: driverService.pickupRide,
  ListPendingRides: driverService.listPendingRides,
  CompleteRide: driverService.completeRide,
  UpdateLocation: driverService.updateLocation,
});

server.addService(chatProto.jalanyuk.chat.ChatService.service, {
  Chat: chatService.chat,
  GetChatHistory: chatService.getChatHistory,
});

const PORT = process.env.GRPC_PORT || 50051;

server.bindAsync(
  `0.0.0.0:${PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('[Server] Failed to bind:', err);
      process.exit(1);
    }
    console.log('╔══════════════════════════════════════╗');
    console.log('║     JalanYuk gRPC Server Running     ║');
    console.log(`║        Port: ${port}                   ║`);
    console.log('║  Services: Auth, Location, Ride,     ║');
    console.log('║            Driver, Chat               ║');
    console.log('╚══════════════════════════════════════╝');
  }
);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  server.tryShutdown(() => {
    console.log('[Server] Goodbye!');
    process.exit(0);
  });
});
