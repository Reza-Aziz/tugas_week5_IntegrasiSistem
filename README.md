# JalanYuk 🛵

> Aplikasi ride-hailing berbasis **gRPC** — dibuat untuk tugas _Integrasi Sistem_ Semester 4.

## Tech Stack

| Layer     | Teknologi                                           |
| --------- | --------------------------------------------------- |
| Protocol  | gRPC (`@grpc/grpc-js`)                              |
| Backend   | Node.js gRPC Server (monolith)                      |
| Gateway   | Express.js REST→gRPC bridge                         |
| Frontend  | React (Vite) + Leaflet.js                           |
| Database  | SQLite (`better-sqlite3`)                           |
| Streaming | SSE (Server-Streaming) + WebSocket (Bidi-Streaming) |

## gRPC Services

| Service             | RPCs                                                    | Streaming Type               |
| ------------------- | ------------------------------------------------------- | ---------------------------- |
| **AuthService**     | Register, Login, Logout                                 | Unary                        |
| **LocationService** | ListLocations, GetPricing, SearchLocation               | Unary                        |
| **RideService**     | RequestRide, GetRideStatus, ListRides, CancelRide       | **Client-side Streaming**    |
| **DriverService**   | TrackDriver, AcceptRide, ListPendingRides, CompleteRide | **Server-side Streaming**    |
| **ChatService**     | Chat, GetChatHistory                                    | **Bi-directional Streaming** |

## Cara Menjalankan

### 1. Install Dependencies

```bash
# Server
cd server && npm install

# Gateway
cd ../gateway && npm install

# Client
cd ../jalanyuk-client && npm install
```

### 2. Jalankan Server (Terminal 1)

```bash
cd server
node index.js
```

Server berjalan di `gRPC://localhost:50051`

### 3. Jalankan Gateway (Terminal 2)

```bash
cd gateway
node index.js
```

Gateway berjalan di `http://localhost:3000`

### 4. Jalankan Frontend (Terminal 3)

```bash
cd jalanyuk-client
npm run dev
```

Frontend berjalan di `http://localhost:5173`

---

## Alur Demo

1. 👤 **Customer**: Register → Login → Pilih titik jemput & tujuan di map
2. ➕ Tambah waypoints untuk client-side streaming demo
3. 💰 Server kalkulasi harga dengan Haversine formula
4. 🚗 **Driver** (tab baru): Register → Login → Lihat pending rides
5. ✅ Driver accept ride → Customer menerima notifikasi
6. 📡 **Server-streaming**: Driver bergerak di map customer real-time
7. 💬 **Bidi-streaming**: Customer ↔ Driver chat
8. 🏁 Driver complete rideJ

## Project Structure

```
jalanyuk/
├── proto/           # 5 Proto Definitions
├── server/          # gRPC Server (Node.js)
│   ├── db/          # SQLite schema + seed
│   ├── services/    # 5 gRPC service implementations
│   └── utils/       # Pricing + simulation
├── gateway/         # Express REST→gRPC bridge (HTTP + WebSocket)
└── jalanyuk-client/ # React (Vite) + Leaflet.js Frontend
```
