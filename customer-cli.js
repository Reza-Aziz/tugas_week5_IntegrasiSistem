// customer-cli.js
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const readline = require('readline');

// Load the protobuf definition
const PROTO_PATH = path.join(__dirname, 'ride_hailing.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDefinition).ride_hailing;

// Initialize gRPC clients
const HOST = '0.0.0.0:50051';
const authClient = new proto.AuthService(HOST, grpc.credentials.createInsecure());
const locationClient = new proto.LocationService(HOST, grpc.credentials.createInsecure());
const rideClient = new proto.RideService(HOST, grpc.credentials.createInsecure());
const driverClient = new proto.DriverService(HOST, grpc.credentials.createInsecure());
const chatClient = new proto.ChatService(HOST, grpc.credentials.createInsecure());

// Set up readline interface for dynamic terminal interactions
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// App State
let session = {
  token: null,
  userId: null,
  currentRideId: `ride_${Date.now()}` // Mock ride ID for the testing session
};

// Simple wrapper to promisify readline 
function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Main Interactive Menu Loop
async function showMenu() {
  console.log('\n==================================');
  console.log('====== RIDE HAILING CLI APP ======');
  console.log('==================================');
  console.log(`> Active Session: ${session.userId || 'Unauthenticated Guest'}`);
  console.log('1. Register');
  console.log('2. Login');
  console.log('3. List Locations (Unary)');
  console.log('4. Request Ride / Send Waypoints (Client Stream)');
  console.log('5. Track Driver (Server Stream)');
  console.log('6. Chat with Driver (Bidirectional Stream)');
  console.log('0. Exit');

  const action = await askQuestion('\nSelect an option (0-6): ');

  switch (action.trim()) {
    case '1': await doRegister(); break;
    case '2': await doLogin(); break;
    case '3': await doListLocations(); break;
    case '4': await doSendWaypoints(); break;
    case '5': await doTrackDriver(); break;
    case '6': doChat(); break; // Synchronous start, handles its own async loop inside
    case '0': 
      console.log('Exiting...'); 
      rl.close(); 
      process.exit(0);
    default: 
      console.log('Invalid option. Try again.'); 
      showMenu(); 
      break;
  }
}

// --- 1. Unary Operations ---

async function doRegister() {
  const email = await askQuestion('Email: ');
  const password = await askQuestion('Password: ');
  const name = await askQuestion('Name: ');
  const phone = await askQuestion('Phone: ');

  authClient.Register({ email, password, name, phone_number: phone, role: 'ROLE_RIDER' }, (error, response) => {
    if (error) {
      console.error('\n[Error] Registration failed:', error.details || error.message);
    } else {
      console.log(`\n[Success] Registration complete! ID: ${response.user_id}`);
    }
    showMenu();
  });
}

async function doLogin() {
  const email = await askQuestion('Email: ');
  const password = await askQuestion('Password: ');

  authClient.Login({ email, password }, (error, response) => {
    if (error) {
      console.error('\n[Error] Login failed:', error.details || error.message);
    } else {
      console.log('\n[Success] Logged in seamlessly!');
      session.token = response.token;
      session.userId = response.user_id;
    }
    showMenu();
  });
}

async function doListLocations() {
  const query = await askQuestion('Search location (leave blank to fetch all): ');
  
  locationClient.ListLocations({ query }, (error, response) => {
    if (error) {
      console.error('\n[Error] Fetching locations:', error.details || error.message);
    } else {
      console.log('\n[Locations Found]:');
      response.locations.forEach(loc => console.log(` - ${loc.name} [ID: ${loc.location_id}]`));
    }
    showMenu();
  });
}

// --- 2. Client Streaming ---

async function doSendWaypoints() {
  console.log('\n>> Starting Client Streaming (Sending 3 waypoints sequence)...');
  
  const call = rideClient.UpdateRideWaypoints((error, response) => {
    if (error) {
      console.error('\n[Error] Ride Summary error:', error.details || error.message);
    } else {
      console.log(`\n[Ride Completed] Total Distance: ${response.total_distance_km.toFixed(2)}km | Cost: $${response.final_price}`);
    }
    showMenu();
  });

  const waypointsToSimulate = [
    { ride_id: session.currentRideId, coordinate: { latitude: 37.111, longitude: -122.111 }, sequence_number: 1, timestamp: Date.now() },
    { ride_id: session.currentRideId, coordinate: { latitude: 37.222, longitude: -122.222 }, sequence_number: 2, timestamp: Date.now() },
    { ride_id: session.currentRideId, coordinate: { latitude: 37.333, longitude: -122.333 }, sequence_number: 3, timestamp: Date.now() }
  ];

  for (const waypoint of waypointsToSimulate) {
    console.log(`  -> Sending Waypoint ${waypoint.sequence_number}...`);
    call.write(waypoint);
    // Pause briefly between streaming data points dynamically
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('  -> All waypoints dispatched.');
  // Ends the client stream, prompting the server to return the summary response
  call.end(); 
}

// --- 3. Server Streaming ---

async function doTrackDriver() {
  console.log('\n>> Requesting Server Driver Updates...');
  
  const call = driverClient.TrackDriver({ ride_id: session.currentRideId, driver_id: 'driver_404' });

  call.on('data', (update) => {
    console.log(`  [Data Received] Location: (${update.coordinate.latitude.toFixed(4)}, ${update.coordinate.longitude.toFixed(4)}) - Speed: ${update.speed_kmh.toFixed(1)}km/h`);
  });

  call.on('end', () => {
    console.log('\n[Stream Ended] The server finished sending driver tracking data.');
    showMenu();
  });

  call.on('error', (err) => {
    console.error('\n[Error] Driver stream tracking failed:', err.details || err.message);
    showMenu();
  });
}

// --- 4. Bidirectional Streaming ---

function doChat() {
  console.log('\n>> Starting Bidirectional Chat.');
  console.log('   (Type a message and press ENTER. Type "QUIT" to return to menu.)');
  
  const call = chatClient.StreamChat();

  // Handle incoming data from the server efficiently mapping output line structures
  call.on('data', (msg) => {
    process.stdout.write(`\r[${msg.sender_id}]: ${msg.message_body}\n> `);
  });

  call.on('end', () => {
    console.log('\n[Connection Closed] Chat session terminated by server.');
    showMenu();
  });

  call.on('error', (err) => {
    console.error('\n[Chat Error]:', err.details || err.message);
    showMenu();
  });

  // Start internal recursive read loop
  const readChatLoop = async () => {
    const message = await askQuestion('> ');
    
    if (message.trim().toUpperCase() === 'QUIT') {
      call.end(); // Graceful client disconnect. `call.on('end')` handles returning to `showMenu()`
      return; 
    }
    
    // Write directly into the ongoing bidirectional pipe
    call.write({
      ride_id: session.currentRideId,
      sender_id: session.userId || 'AnonRider',
      receiver_id: 'Driver',
      message_body: message,
      timestamp: Date.now()
    });
    
    readChatLoop();
  };

  readChatLoop();
}

// Kickoff
showMenu();
