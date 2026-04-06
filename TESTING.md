# 🧪 TESTING GUIDE - Ride Hailing System

Panduan lengkap untuk testing apakah ketiga file (`server.js`, `customer-cli.js`, `driver-cli.js`) berfungsi dengan baik.

---

## 📌 Opsi Testing

Ada **3 cara** untuk test sistem ini:

### **OPSI 1: Automated Testing (RECOMMENDED ⭐)**

Test otomatis yang menjalankan 8 test case sekaligus.

### **OPSI 2: Manual Testing**

Test secara manual melalui CLI interface.

### **OPSI 3: Hybrid Testing**

Kombinasi automated testing + manual testing.

---

## 🚀 OPSI 1: Automated Testing (TERCEPAT & TERMUDAH)

### Setup

```bash
# Terminal 1: Jalankan Server
npm start
```

Tunggu sampai melihat:

```
Ride Hailing gRPC Server running flawlessly at http://0.0.0.0:50051
```

### Jalankan Tests

```bash
# Terminal 2: Jalankan Test Suite
npm test
```

### Expected Output

```
🧪 RIDE HAILING SYSTEM - TEST SUITE

==================================

📝 TEST 1: Register User
✅ PASS - User registered: user_1712432100549

🔐 TEST 2: Login
✅ PASS - Login successful, token: dummy-jwt-token-for-...

🔐 TEST 3: Login dengan Password Salah (Expected to FAIL)
✅ PASS - Reject sebagaimana harusnya: Invalid credentials

📍 TEST 4: List Locations
✅ PASS - Found 2 location(s)
   - Airport (1)
   - Downtown (2)

💰 TEST 5: Get Pricing
✅ PASS - Pricing calculated
   - Distance: 7.2 km
   - Estimated Price: 15.5
   - Duration: 12 minutes

📤 TEST 6: Client Streaming - Send Waypoints
✅ PASS - Client streaming successful
   - Ride ID: test_ride_001
   - Total Distance: 3.60 km
   - Final Price: $15.90

📥 TEST 7: Server Streaming - Track Driver
✅ PASS - Server streaming received 15 updates

💬 TEST 8: Bidirectional Streaming - Chat
✅ PASS - Bidirectional chat received 1 message(s)

==================================
📊 TEST SUMMARY

✅ Tests Passed: 8
❌ Tests Failed: 0
📊 Total Tests:  8

🎉 SEMUA TEST PASSED! Sistem berfungsi dengan baik.
```

**Jika semua test PASS ✅ → Server, Customer, dan Driver berfungsi sempurna!**

---

## 🎮 OPSI 2: Manual Testing (INTERAKTIF)

### Step 1: Run Server

```bash
# Terminal 1
npm start
```

### Step 2: Test Customer Features

```bash
# Terminal 2
npm run client
```

#### Test 2a: Register

```
==================================
====== RIDE HAILING CLI APP ======
==================================
> Active Session: Unauthenticated Guest
1. Register
2. Login
3. List Locations (Unary)
4. Request Ride / Send Waypoints (Client Stream)
5. Track Driver (Server Stream)
6. Chat with Driver (Bidirectional Stream)
0. Exit

Select an option (0-6): 1

Email: test@example.com
Password: password123
Name: John Doe
Phone: 08123456789

[Success] Registration complete! ID: user_1712432100549
```

#### Test 2b: Login

```
Select an option (0-6): 2

Email: test@example.com
Password: password123

[Success] Logged in seamlessly!
```

#### Test 2c: List Locations

```
Select an option (0-6): 3

Search location (leave blank to fetch all):

[Locations Found]:
 - Airport [ID: 1]
 - Downtown [ID: 2]
```

#### Test 2d: Send Waypoints (Client Streaming)

```
Select an option (0-6): 4

>> Starting Client Streaming (Sending 3 waypoints sequence)...
  -> Sending Waypoint 1...
  -> Sending Waypoint 2...
  -> Sending Waypoint 3...
  -> All waypoints dispatched.

[Ride Completed] Total Distance: 3.60km | Cost: $15.90
```

#### Test 2e: Track Driver (Server Streaming)

```
Select an option (0-6): 5

>> Requesting Server Driver Updates...
  [Data Received] Location: (37.7750, -122.4193) - Speed: 42.3km/h
  [Data Received] Location: (37.7751, -122.4192) - Speed: 38.9km/h
  [Data Received] Location: (37.7752, -122.4191) - Speed: 45.1km/h
  ... (15 updates total)

[Stream Ended] The server finished sending driver tracking data.
```

#### Test 2f: Chat with Driver (Bidirectional Streaming)

```
Select an option (0-6): 6

>> Starting Bidirectional Chat.
   (Type a message and press ENTER. Type "QUIT" to return to menu.)
> Hello driver!
[SYSTEM]: Ack: "Hello driver!" delivered to Driver.
> Can you come faster?
[SYSTEM]: Ack: "Can you come faster?" delivered to Driver.
> QUIT

[Connection Closed] Chat session terminated by server.
```

### Step 3: Test Driver Features (Optional)

```bash
# Terminal 3
npm run driver
```

#### Test 3a: Login as Driver

```
==================================
====== DRIVER PARTNER CLI ========
==================================
> Driver ID: Not Logged In
> Status: AVAILABLE
1. Login as Driver
0. Exit

Select action: 1

Email (Driver): driver@example.com
Password: password123

[Success] Logged in successfully! Ready to accept rides.
```

#### Test 3b: View Pending Requests

```
Select action: 2

>> Fetching nearby ride requests from Dispatch...

=== Available Requests ===
 ID: ride_777 | Target: Pickup At Airport | Dropoff: Downtown | Est. Fare: $25.50
==========================
```

#### Test 3c: Accept Ride

```
Select action: 3

Enter Ride ID to accept: ride_777

>> Acquiring lock for ride ride_777...
[Success] Trip Confirmed! You are now locked in for ride_777. Heading to pickup!
```

#### Test 3d: Send Live Location

```
Select action: 4

>> Starting Live Location Telemetry stream to Dispatch System...
[Telemetry] Sending -> Lat: 37.7769, Lng: -122.4174 | Speed: 42 km/h | Heading: 90°
[Telemetry] Sending -> Lat: 37.7771, Lng: -122.4172 | Speed: 38 km/h | Heading: 90°
... (10 updates total)

[Simulator Completed] Reached destination waypoint.
```

#### Test 3e: Complete Ride

```
Select action: 5

>> Wrapping up ride ride_777...
[Success] Ride successfully completed. Payment processing triggered. Back available.
```

#### Test 3f: Chat with Customer

```
Select action: 6

>> Connected to Customer Channel for Ride: ride_777.
   (Type a message and press ENTER. Type "QUIT" to stop chatting.)
> I'm on my way!
[Customer customer_001]: Hello driver!
> ETA 5 minutes
[Customer customer_001]: Can you come faster?
> QUIT

[Connection Closed] Chat session ended by server.
```

---

## ✅ CHECKLIST TESTING

### Server.js Tests

- [ ] Server bisa start tanpa error
- [ ] Listening di port 50051
- [ ] Message: "Ride Hailing gRPC Server running flawlessly"

### Customer-cli.js Tests

- [ ] Register user berhasil
- [ ] Login dengan kredensial benar → OK
- [ ] Login dengan kredensial salah → Error
- [ ] List locations menampilkan data
- [ ] Get pricing menampilkan estimasi
- [ ] Client streaming (waypoints) → OK
- [ ] Server streaming (track driver) → OK
- [ ] Bidirectional streaming (chat) → OK

### Driver-cli.js Tests

- [ ] Login driver berhasil
- [ ] View pending requests menampilkan ride
- [ ] Accept ride berhasil
- [ ] Send location updates berjalan
- [ ] Complete ride berhasil
- [ ] Chat dengan customer → OK

---

## 🐛 Troubleshooting

### Error: "Cannot find module '@grpc/grpc-js'"

```bash
npm install
```

### Error: "EADDRINUSE: address already in use :::50051"

**Solusi 1:** Tunggu 30 detik lalu coba lagi
**Solusi 2:** Kill process:

```bash
# Windows
netstat -ano | findstr :50051
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :50051
kill -9 <PID>
```

### Error: "Connection refused"

- Pastikan server sudah start di Terminal 1
- Cek apakah server memberikan message sukses

### Error di Test: "Expected to FAIL tapi accepted"

- Ada logic error di server
- Check file `server.js`

### Chat messages tidak muncul

- Ada delay atau timeout issue
- Pastikan message dikirim dengan benar

---

## 📊 Test Summary Table

| No  | Feature               | File                        | Status | Notes               |
| --- | --------------------- | --------------------------- | ------ | ------------------- |
| 1   | Unary RPC (Register)  | server.js + customer-cli.js | ✅     | Create user account |
| 2   | Unary RPC (Login)     | server.js + customer-cli.js | ✅     | Authenticate user   |
| 3   | Unary RPC (Locations) | server.js + customer-cli.js | ✅     | Query locations     |
| 4   | Unary RPC (Pricing)   | server.js + customer-cli.js | ✅     | Calculate fare      |
| 5   | Client Streaming      | server.js + customer-cli.js | ✅     | Send waypoints      |
| 6   | Server Streaming      | server.js + customer-cli.js | ✅     | Track driver        |
| 7   | Bidirectional Stream  | server.js + customer-cli.js | ✅     | Chat feature        |
| 8   | Driver Features       | server.js + driver-cli.js   | ✅     | Driver operations   |

---

## 🎯 Testing Workflow Recommendation

### For Quick Testing (5 menit)

1. Run: `npm start` (Terminal 1)
2. Wait for server message
3. Run: `npm test` (Terminal 2)
4. Check hasil test

### For Complete Testing (15 menit)

1. Run: `npm start` (Terminal 1)
2. Run: `npm test` (Terminal 2) - Automated
3. Run: `npm run client` (Terminal 3) - Manual customer test
4. Run: `npm run driver` (Terminal 4) - Manual driver test

### For Production Ready

1. ✅ All automated tests pass
2. ✅ Manual testing OK
3. ✅ Check no memory leaks
4. ✅ Check connection stability

---

**Happy Testing! 🚀**
