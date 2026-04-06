// driver-cli.js
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");
const readline = require("readline");

// Load protobuf
const PROTO_PATH = path.join(__dirname, "ride_hailing.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).ride_hailing;

// Initialize gRPC clients
const HOST = "0.0.0.0:50051";
const authClient = new proto.AuthService(HOST, grpc.credentials.createInsecure());
const chatClient = new proto.ChatService(HOST, grpc.credentials.createInsecure());

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// App State
let session = {
  token: null,
  userId: null,
  activeRideId: null,
};

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Main Interactive Menu Loop
async function showMenu() {
  console.log("\n==================================");
  console.log("====== DRIVER PARTNER CLI ========");
  console.log("==================================");
  console.log(`> Driver ID: ${session.userId || "Not Logged In"}`);
  console.log(`> Status: ${session.activeRideId ? "ON TRIP" : "AVAILABLE"}`);

  if (!session.token) {
    console.log("1. Login as Driver");
  } else if (!session.activeRideId) {
    console.log("2. View Pending Ride Requests");
    console.log("3. Accept a Ride");
  } else {
    console.log("4. Send Live Location Updates (Simulate)");
    console.log("5. Complete Ride");
    console.log("6. Chat with Customer (Bidirectional Stream)");
  }
  console.log("0. Exit");

  const action = (await askQuestion("\nSelect action: ")).trim();

  try {
    if (action === "0") {
      console.log("Exiting driver app...");
      rl.close();
      process.exit(0);
    } else if (action === "1") await doLogin();
    else if (action === "2" && session.token && !session.activeRideId) await viewPendingRides();
    else if (action === "3" && session.token && !session.activeRideId) await acceptRide();
    else if (action === "4" && session.activeRideId) {
      await sendLiveLocation();
      return;
    } // Returns to prevent overlapping prompts
    else if (action === "5" && session.activeRideId) await completeRide();
    else if (action === "6" && session.activeRideId) {
      doChat();
      return;
    } // Returns to prevent overlapping prompts
    else console.log("Invalid option or not allowed in current state.");
  } catch (err) {
    console.error("Error processing command:", err);
  }

  showMenu();
}

async function doLogin() {
  const email = await askQuestion("Email (Driver): ");
  const password = await askQuestion("Password: ");

  return new Promise((resolve) => {
    authClient.Login({ email, password }, (err, res) => {
      if (err) {
        console.error("\n[Error] Login failed:", err.details || err.message);
      } else {
        console.log("\n[Success] Logged in successfully! Ready to accept rides.");
        session.token = res.token;
        session.userId = res.user_id;
      }
      resolve();
    });
  });
}

// Simulated System call - As original proto lacked a dedicated "Pending Rides" RPC stream
async function viewPendingRides() {
  console.log("\n>> Fetching nearby ride requests from Dispatch...");
  await new Promise((r) => setTimeout(r, 1000));
  console.log("\n=== Available Requests ===");
  console.log(" ID: ride_777 | Target: Pickup At Airport | Dropoff: Downtown | Est. Fare: $25.50");
  console.log("==========================");
}

// Simulated System call
async function acceptRide() {
  const rideId = await askQuestion("Enter Ride ID to accept: ");
  if (!rideId) return;

  console.log(`\n>> Acquiring lock for ride ${rideId}...`);
  await new Promise((r) => setTimeout(r, 1000)); // Simulate network latency

  session.activeRideId = rideId;
  console.log(`[Success] Trip Confirmed! You are now locked in for ${rideId}. Heading to pickup!`);
}

// Simulated Telemetry Pinger
async function sendLiveLocation() {
  console.log("\n>> Starting Live Location Telemetry stream to Dispatch System...");

  let ticks = 0;
  const sim = setInterval(() => {
    ticks++;
    const lat = 37.7749 + ticks * 0.002;
    const lng = -122.4194 + ticks * 0.002;
    const speed = Math.floor(Math.random() * 15 + 35); // 35 - 50 km/h jitter

    console.log(`[Telemetry] Sending -> Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)} | Speed: ${speed} km/h | Heading: 90°`);

    if (ticks >= 10) {
      clearInterval(sim);
      console.log("\n[Simulator Completed] Reached destination waypoint.");
      showMenu();
    }
  }, 1500); // 1.5 seconds intervals
}

// Simulated System call
async function completeRide() {
  console.log(`\n>> Wrapping up ride ${session.activeRideId}...`);
  await new Promise((r) => setTimeout(r, 800));

  console.log(`[Success] Ride successfully completed. Payment processing triggered. Back available.`);
  session.activeRideId = null;
}

function doChat() {
  console.log(`\n>> Connected to Customer Channel for Ride: ${session.activeRideId}.`);
  console.log('   (Type a message and press ENTER. Type "QUIT" to stop chatting.)');

  const call = chatClient.StreamChat();

  // Listen for incoming messages from Customer
  call.on("data", (msg) => {
    // Overwrite the input line cursor safely for simple terminal UI
    process.stdout.write(`\r[Customer ${msg.sender_id}]: ${msg.message_body}\n> `);
  });

  call.on("end", () => {
    console.log("\n[Connection Closed] Chat session ended by server.");
    showMenu();
  });

  call.on("error", (err) => {
    console.error("\n[Chat Error]:", err.details || err.message);
    showMenu();
  });

  const readChatLoop = async () => {
    const message = await askQuestion("> ");

    // Command shortcut to hang up the stream
    if (message.trim().toUpperCase() === "QUIT") {
      call.end();
      return; // .on('end') handles navigating back to the menu
    }

    // Send standard chunk
    call.write({
      ride_id: session.activeRideId,
      sender_id: session.userId || "Driver_404",
      receiver_id: "Rider",
      message_body: message,
      timestamp: Date.now(),
    });

    readChatLoop();
  };

  readChatLoop();
}

// Kickoff
showMenu();
