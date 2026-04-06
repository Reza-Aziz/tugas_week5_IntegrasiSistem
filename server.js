// server.js
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

// Load the protobuf definition
const PROTO_PATH = path.join(__dirname, "ride_hailing.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String, // Treat enums as string types in JS
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).ride_hailing;

// ===========================================
// In-Memory Data Stores
// ===========================================
const users = new Map(); // key: email, value: user object
const locations = new Map([
  ["1", { location_id: "1", name: "Airport", coordinate: { latitude: 37.6214, longitude: -122.379 } }],
  ["2", { location_id: "2", name: "Downtown", coordinate: { latitude: 37.7749, longitude: -122.4194 } }],
]);

// ===========================================
// 1. Unary RPCs (AuthService, LocationService)
// ===========================================

function Register(call, callback) {
  const { email, password, name, phone_number, role } = call.request;

  if (!email || !password) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: "Email and password are required",
    });
  }

  if (users.has(email)) {
    return callback({
      code: grpc.status.ALREADY_EXISTS,
      message: "User already exists",
    });
  }

  const user_id = `user_${Date.now()}`;
  users.set(email, { user_id, email, password, name, phone_number, role });

  callback(null, { user_id, message: "User registered successfully" });
}

function Login(call, callback) {
  const { email, password } = call.request;
  const user = users.get(email);

  if (!user || user.password !== password) {
    return callback({
      code: grpc.status.UNAUTHENTICATED,
      message: "Invalid credentials",
    });
  }

  callback(null, {
    token: `dummy-jwt-token-for-${user.user_id}`,
    user_id: user.user_id,
    role: user.role,
  });
}

function ListLocations(call, callback) {
  const query = call.request.query?.toLowerCase() || "";
  const result = [];

  for (const loc of locations.values()) {
    if (loc.name.toLowerCase().includes(query)) {
      result.push(loc);
    }
  }

  callback(null, { locations: result });
}

function GetPricing(call, callback) {
  const { pickup_location, destination_location } = call.request;

  if (!pickup_location || !destination_location) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: "Pickup and destination coordinates are strictly required.",
    });
  }

  // Dummy logic calculation
  callback(null, {
    estimated_price: 15.5,
    currency: "USD",
    distance_km: 7.2,
    estimated_duration_minutes: 12,
  });
}

// ===========================================
// 2. Client Streaming (RideService)
// ===========================================

function UpdateRideWaypoints(call, callback) {
  let ride_id = null;
  let total_waypoints = 0;
  let total_distance = 0;

  // Triggered every time the client sends a stream event
  call.on("data", (waypoint) => {
    if (!ride_id) ride_id = waypoint.ride_id;
    total_waypoints++;
    total_distance += 1.2; // Simulating moving 1.2km per waypoint
    console.log(`[Ride ${ride_id}] Received waypoint sequence: ${waypoint.sequence_number}`);
  });

  // Triggered when the client signals it has finished sending data
  call.on("end", () => {
    if (total_waypoints === 0) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: "No waypoints received",
      });
    }

    callback(null, {
      ride_id: ride_id || "unknown_id",
      total_distance_km: total_distance,
      status: "RIDE_STATUS_COMPLETED",
      final_price: 10 + total_distance * 1.5, // Base fare + distance
    });
  });

  call.on("error", (err) => {
    console.error("Client stream error:", err);
  });
}

// ===========================================
// 3. Server Streaming (DriverService)
// ===========================================

function TrackDriver(call) {
  const { ride_id, driver_id } = call.request;

  if (!ride_id || !driver_id) {
    call.emit("error", {
      code: grpc.status.INVALID_ARGUMENT,
      message: "Both ride_id and driver_id are required for tracking",
    });
    return;
  }

  console.log(`[Ride ${ride_id}] Client connected to track driver: ${driver_id}`);

  let updatesSent = 0;

  // Stream a dummy location to the client every 2 seconds
  const interval = setInterval(() => {
    if (call.cancelled) {
      clearInterval(interval);
      console.log("Stream cancelled by the client.");
      return;
    }

    call.write({
      coordinate: {
        latitude: 37.7749 + updatesSent * 0.001, // Simulating movement
        longitude: -122.4194 + updatesSent * 0.001,
      },
      heading_degrees: (90 + updatesSent * 5) % 360,
      speed_kmh: 40.0 + Math.random() * 5,
      timestamp: Date.now(),
    });

    updatesSent++;

    // For demo purposes, we automatically complete the stream after 15 updates
    if (updatesSent >= 15) {
      clearInterval(interval);
      call.end(); // Signals to the client that the server is done writing
    }
  }, 2000);

  // Clean-up if connection drops prematurely
  call.on("cancelled", () => {
    clearInterval(interval);
  });
}

// ===========================================
// 4. Bidirectional Streaming (ChatService)
// ===========================================

function StreamChat(call) {
  // In a full implementation, you would store and pipe `call` to a specific Room map
  // tied to `ride_id` to route messages correctly between driver & rider streams.
  // For this example, we treat it as an echo-server to demonstrate bidirectional streaming.

  // Received message from the client
  call.on("data", (chatMessage) => {
    const { ride_id, sender_id, receiver_id, message_body } = chatMessage;
    console.log(`[Chat | Ride: ${ride_id}] ${sender_id} -> ${receiver_id}: ${message_body}`);

    // Process and send an acknowledgment or targeted message back asynchronously
    call.write({
      ride_id,
      sender_id: "SYSTEM",
      receiver_id: sender_id,
      message_body: `Ack: "${message_body}" delivered to ${receiver_id}.`,
      timestamp: Date.now(),
    });
  });

  // Client disconnected or closed stream explicitly
  call.on("end", () => {
    console.log("Client ended the bidirectional chat session.");
    call.end();
  });

  call.on("error", (err) => {
    console.error("Chat stream error:", err);
  });
}

// ===========================================
// Server Initialization
// ===========================================

function main() {
  const server = new grpc.Server();

  server.addService(proto.AuthService.service, { Register, Login });
  server.addService(proto.LocationService.service, { ListLocations, GetPricing });
  server.addService(proto.RideService.service, { UpdateRideWaypoints });
  server.addService(proto.DriverService.service, { TrackDriver });
  server.addService(proto.ChatService.service, { StreamChat });

  const host = "0.0.0.0:50051";

  server.bindAsync(host, grpc.ServerCredentials.createInsecure(), (error, port) => {
    if (error) {
      console.error("Failed to bind server:", error);
      return;
    }
    console.log(`Ride Hailing gRPC Server running flawlessly at http://${host}`);
  });
}

main();
