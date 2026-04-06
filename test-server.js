// test-server.js - Simple test untuk verify server berfungsi
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const PROTO_PATH = path.join(__dirname, "ride_hailing.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).ride_hailing;

async function runTests() {
  console.log("\n🧪 RIDE HAILING SYSTEM - TEST SUITE\n");
  console.log("==================================\n");

  const HOST = "localhost:50051";
  const authClient = new proto.AuthService(HOST, grpc.credentials.createInsecure());

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Register User
  console.log("📝 TEST 1: Register User");
  try {
    const result = await new Promise((resolve, reject) => {
      authClient.Register(
        {
          email: "test@example.com",
          password: "password123",
          name: "Test User",
          phone_number: "08123456789",
          role: "ROLE_RIDER",
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
      );
    });
    console.log("✅ PASS - User registered:", result.user_id);
    testsPassed++;
  } catch (err) {
    console.log("❌ FAIL -", err.details || err.message);
    testsFailed++;
  }

  // Test 2: Login
  console.log("\n🔐 TEST 2: Login");
  try {
    const result = await new Promise((resolve, reject) => {
      authClient.Login(
        {
          email: "test@example.com",
          password: "password123",
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
      );
    });
    console.log("✅ PASS - Login successful, token:", result.token.substring(0, 20) + "...");
    testsPassed++;
  } catch (err) {
    console.log("❌ FAIL -", err.details || err.message);
    testsFailed++;
  }

  // Test 3: Login with wrong password (should fail)
  console.log("\n🔐 TEST 3: Login dengan Password Salah (Expected to FAIL)");
  try {
    const result = await new Promise((resolve, reject) => {
      authClient.Login(
        {
          email: "test@example.com",
          password: "wrongpassword",
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
      );
    });
    console.log("❌ FAIL - Seharusnya reject tapi malah accept");
    testsFailed++;
  } catch (err) {
    console.log("✅ PASS - Reject sebagaimana harusnya:", err.details);
    testsPassed++;
  }

  // Test 4: List Locations
  console.log("\n📍 TEST 4: List Locations");
  try {
    const locationClient = new proto.LocationService(HOST, grpc.credentials.createInsecure());
    const result = await new Promise((resolve, reject) => {
      locationClient.ListLocations(
        {
          query: "Airport",
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
      );
    });
    console.log("✅ PASS - Found", result.locations.length, "location(s)");
    result.locations.forEach((loc) => {
      console.log(`   - ${loc.name} (${loc.location_id})`);
    });
    testsPassed++;
  } catch (err) {
    console.log("❌ FAIL -", err.details || err.message);
    testsFailed++;
  }

  // Test 5: Get Pricing
  console.log("\n💰 TEST 5: Get Pricing");
  try {
    const locationClient = new proto.LocationService(HOST, grpc.credentials.createInsecure());
    const result = await new Promise((resolve, reject) => {
      locationClient.GetPricing(
        {
          pickup_location: { latitude: 37.7749, longitude: -122.4194 },
          destination_location: { latitude: 37.6214, longitude: -122.379 },
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
      );
    });
    console.log("✅ PASS - Pricing calculated");
    console.log(`   - Distance: ${result.distance_km} km`);
    console.log(`   - Estimated Price: $${result.estimated_price}`);
    console.log(`   - Duration: ${result.estimated_duration_minutes} minutes`);
    testsPassed++;
  } catch (err) {
    console.log("❌ FAIL -", err.details || err.message);
    testsFailed++;
  }

  // Test 6: Client Streaming (Waypoints)
  console.log("\n📤 TEST 6: Client Streaming - Send Waypoints");
  try {
    const rideClient = new proto.RideService(HOST, grpc.credentials.createInsecure());

    const result = await new Promise((resolve, reject) => {
      const call = rideClient.UpdateRideWaypoints((err, res) => {
        if (err) reject(err);
        else resolve(res);
      });

      // Send 3 waypoints
      call.write({
        ride_id: "test_ride_001",
        coordinate: { latitude: 37.111, longitude: -122.111 },
        sequence_number: 1,
        timestamp: Date.now(),
      });

      call.write({
        ride_id: "test_ride_001",
        coordinate: { latitude: 37.222, longitude: -122.222 },
        sequence_number: 2,
        timestamp: Date.now(),
      });

      call.write({
        ride_id: "test_ride_001",
        coordinate: { latitude: 37.333, longitude: -122.333 },
        sequence_number: 3,
        timestamp: Date.now(),
      });

      call.end();
    });

    console.log("✅ PASS - Client streaming successful");
    console.log(`   - Ride ID: ${result.ride_id}`);
    console.log(`   - Total Distance: ${result.total_distance_km.toFixed(2)} km`);
    console.log(`   - Final Price: $${result.final_price.toFixed(2)}`);
    testsPassed++;
  } catch (err) {
    console.log("❌ FAIL -", err.details || err.message);
    testsFailed++;
  }

  // Test 7: Server Streaming (Track Driver)
  console.log("\n📥 TEST 7: Server Streaming - Track Driver");
  try {
    const driverClient = new proto.DriverService(HOST, grpc.credentials.createInsecure());

    let updateCount = 0;
    const result = await new Promise((resolve, reject) => {
      const call = driverClient.TrackDriver({
        ride_id: "test_ride_001",
        driver_id: "driver_001",
      });

      call.on("data", (update) => {
        updateCount++;
      });

      call.on("end", () => {
        resolve(updateCount);
      });

      call.on("error", (err) => {
        reject(err);
      });
    });

    console.log("✅ PASS - Server streaming received", result, "updates");
    testsPassed++;
  } catch (err) {
    console.log("❌ FAIL -", err.details || err.message);
    testsFailed++;
  }

  // Test 8: Bidirectional Streaming (Chat)
  console.log("\n💬 TEST 8: Bidirectional Streaming - Chat");
  try {
    const chatClient = new proto.ChatService(HOST, grpc.credentials.createInsecure());

    let messagesReceived = 0;
    const result = await new Promise((resolve, reject) => {
      const call = chatClient.StreamChat();

      // Send message
      call.write({
        ride_id: "test_ride_001",
        sender_id: "customer_001",
        receiver_id: "driver_001",
        message_body: "Hello driver!",
        timestamp: Date.now(),
      });

      call.on("data", (msg) => {
        messagesReceived++;
      });

      setTimeout(() => {
        call.end();
      }, 1000);

      call.on("end", () => {
        resolve(messagesReceived);
      });

      call.on("error", (err) => {
        reject(err);
      });
    });

    console.log("✅ PASS - Bidirectional chat received", result, "message(s)");
    testsPassed++;
  } catch (err) {
    console.log("❌ FAIL -", err.details || err.message);
    testsFailed++;
  }

  // Summary
  console.log("\n==================================");
  console.log("📊 TEST SUMMARY\n");
  console.log(`✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log(`📊 Total Tests:  ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log("\n🎉 SEMUA TEST PASSED! Sistem berfungsi dengan baik.\n");
    process.exit(0);
  } else {
    console.log("\n⚠️  Ada beberapa test yang failed. Cek error di atas.\n");
    process.exit(1);
  }
}

// Run tests
runTests().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
