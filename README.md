<<<<<<< HEAD
# JalanYuk 🛵

> Aplikasi ride-hailing berbasis **gRPC** — dibuat untuk tugas *Integrasi Sistem* Semester 4.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Protocol | gRPC (`@grpc/grpc-js`) |
| Backend | Node.js gRPC Server (monolith) |
| Gateway | Express.js REST→gRPC bridge |
| Frontend | React (Vite) + Leaflet.js |
| Database | SQLite (`better-sqlite3`) |
| Streaming | SSE (Server-Streaming) + WebSocket (Bidi-Streaming) |

## gRPC Services

| Service | RPCs | Streaming Type |
|---|---|---|
| **AuthService** | Register, Login, Logout | Unary |
| **LocationService** | ListLocations, GetPricing, SearchLocation | Unary |
| **RideService** | RequestRide, GetRideStatus, ListRides, CancelRide | **Client-side Streaming** |
| **DriverService** | TrackDriver, AcceptRide, ListPendingRides, CompleteRide | **Server-side Streaming** |
| **ChatService** | Chat, GetChatHistory | **Bi-directional Streaming** |

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
8. 🏁 Driver complete ride

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
=======
# Ride Hailing System with gRPC

Sistem ride hailing interaktif menggunakan gRPC dengan Node.js. Aplikasi ini memberikan simulasi lengkap untuk customer, driver, dan backend server.

## ✅ Prerequisite

Pastikan sudah terinstall:

- **Node.js** v14+ (download dari [nodejs.org](https://nodejs.org))
- **npm** (biasanya sudah include dengan Node.js)

Verifikasi instalasi:

```bash
node --version
npm --version
```

## 🚀 Setup & Installation

Setelah `git clone`, ikuti langkah berikut:

### 1. Masuk ke directory project

```bash
cd tugas_week5_IntegrasiSistem
```

### 2. Install semua dependencies

```bash
npm install
```

Ini akan menginstall:

- `@grpc/grpc-js` - gRPC library
- `@grpc/proto-loader` - Protobuf loader

### 3. Verifikasi setup (opsional)

Cek apakah semua file ada:

```bash
ls -la
# atau (Windows):
Get-ChildItem
```

Pastikan ada file:

- ✅ `package.json`
- ✅ `node_modules/` (folder akan dibuat saat `npm install`)
- ✅ `ride_hailing.proto`
- ✅ `server.js`
- ✅ `customer-cli.js`
- ✅ `driver-cli.js`

## 📋 Menjalankan Aplikasi

### Terminal 1: Jalankan Server (WAJIB DULUAN)

```bash
npm start
```

Output yang diharapkan:

```
Ride Hailing gRPC Server running flawlessly at http://0.0.0.0:50051
```

### Terminal 2: Jalankan Customer CLI

Buka terminal baru, lalu:

```bash
npm run client
```

### Terminal 3: Jalankan Driver CLI (Opsional)

Buka terminal baru lagi:

```bash
npm run driver
```

## 🎯 Urutan Penjalanin

⚠️ **PENTING**: Server HARUS dijalankan duluan sebelum client atau driver!

| Urutan | Komponen     | Command          |
| ------ | ------------ | ---------------- |
| 1️⃣     | **Server**   | `npm start`      |
| 2️⃣     | Customer CLI | `npm run client` |
| 3️⃣     | Driver CLI   | `npm run driver` |

## 🧪 Testing

### Langkah Testing Customer:

1. Run `npm run client`
2. Pilih menu:
   - **1** = Register (buat akun)
   - **2** = Login
   - **3** = List Locations
   - **4** = Send Waypoints (Client Streaming)
   - **5** = Track Driver (Server Streaming)
   - **6** = Chat with Driver (Bidirectional Streaming)
   - **0** = Exit

### Langkah Testing Driver:

1. Run `npm run driver`
2. Pilih menu:
   - **1** = Login as Driver
   - **2** = View Pending Requests (setelah login)
   - **3** = Accept Ride
   - **4** = Send Live Location
   - **5** = Complete Ride
   - **6** = Chat with Customer
   - **0** = Exit

## 📊 Arsitektur

```
┌─────────────────────────────────────────┐
│         gRPC Server (50051)             │
│  - AuthService                          │
│  - LocationService                      │
│  - RideService (Client Streaming)       │
│  - DriverService (Server Streaming)     │
│  - ChatService (Bidirectional)          │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴─────────┐
        │                │
   ┌────▼─────┐    ┌─────▼────┐
   │ Customer  │    │  Driver  │
   │   CLI     │    │   CLI    │
   └──────────┘    └──────────┘
```

## 📝 File Structure

```
tugas_week5_IntegrasiSistem/
├── package.json              # Dependencies configuration
├── ride_hailing.proto        # Protobuf definitions
├── server.js                 # gRPC Server
├── customer-cli.js           # Customer application
├── driver-cli.js             # Driver application
├── node_modules/             # Dependencies (dibuat saat npm install)
└── README.md                 # File ini
```

## ⚠️ Common Issues

### Error: "Cannot find module '@grpc/grpc-js'"

**Solusi:** Pastikan sudah jalankan `npm install`

### Error: "EADDRINUSE: address already in use :::50051"

**Solusi:**

- Kill process lama: `npm install -g kill-port` lalu `kill-port 50051`
- Atau cukup jalankan server di port berbeda

### Connection Refused

**Solusi:** Pastikan server sudah jalan di Terminal 1 sebelum jalankan client

## 🛠️ Development

### Mengubah Proto Definitions

Edit `ride_hailing.proto` lalu restart server

### Menambah Feature Baru

1. Update proto file
2. Implement handler di `server.js`
3. Implement client call di `customer-cli.js` atau `driver-cli.js`
4. Restart server

## 📞 Troubleshooting

Jika ada error, cek:

1. ✅ Node.js versi 14+
2. ✅ Semua npm packages sudah terinstall
3. ✅ Server jalan duluan di port 50051
4. ✅ File `ride_hailing.proto` ada di folder

## 📚 Resources

- [gRPC Documentation](https://grpc.io/docs)
- [Protobuf Language Guide](https://developers.google.com/protocol-buffers)
- [Node.js gRPC Quickstart](https://grpc.io/docs/languages/node/quickstart/)

---

**Happy coding! 🚀**
>>>>>>> 06ebcb553f6a07b8920821ad9896f2e048ef978c
