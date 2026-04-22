# JalanYuk 🛵🚗

> Sistem Ride-Hailing Cerdas — Optimasi gRPC & WebSocket Bridge untuk Tugas *Integrasi Sistem* Semester 4.

JalanYuk adalah platform ride-hailing modern yang mendemonstrasikan integrasi kompleks antara protokol **gRPC** (untuk performa tinggi di backend) dan **WebSocket** (untuk komunikasi real-time ke frontend). Sistem ini mendukung pemesanan kendaraan (Motor & Mobil), pelacakan pengemudi secara real-time, dan fitur interaktif lainnya.

## 🚀 Fitur Utama & Kriteria Terpenuhi

### 1. Implementasi gRPC & WebSocket Bridge
Seluruh fitur streaming di gRPC telah dijembatani secara optimal ke WebSocket di layer Gateway:
*   **Tracking Driver (Server-Streaming)**: Koordinat simulasi dari gRPC server didorong ke browser via `/ws/driver`.
*   **Chat Interaktif (Bidi-Streaming)**: Komunikasi dua arah antara customer dan driver via `/ws/chat`.
*   **Command & Control**: Browser dapat mengirim instruksi (seperti `START_TRACKING`) yang secara otomatis memicu pemanggilan gRPC di backend.

### 2. Event-Driven UI
Antarmuka bereaksi secara dinamis terhadap pesan dari server:
*   **Map Live Update**: Marker pengemudi bergerak, berotasi, dan berganti ikon (Motor/Mobil) secara instan.
*   **Status Indicators**: Badge status pesanan (PENDING, ACCEPTED, IN_PROGRESS) diperbarui secara real-time.
*   **Earnings & Feed**: Di sisi Driver, komponen "Pendapatan Hari Ini" dan histori pesanan diperbarui otomatis begitu ada tip atau ulasan masuk.

### 3. Server-Initiated Events
Server mendorong data secara proaktif tanpa permintaan eksplisit dari klien:
*   **Surge Pricing Alerts**: Notifikasi otomatis "Harga berubah" saat permintaan tinggi disimulasikan.
*   **Tip Notifications**: Driver menerima pemberitahuan instan begitu Customer memberikan tip dan rating.

---

## 🛠️ Tech Stack

| Layer     | Teknologi                                           |
| --------- | --------------------------------------------------- |
| **Protocol**  | gRPC (`@grpc/grpc-js`, `proto3`)                    |
| **Backend**   | Node.js gRPC Server                                 |
| **Middleware**| Express.js REST + WebSocket Bridge                  |
| **Frontend**  | React (Vite) + Leaflet.js + Lucide Icons            |
| **Database**  | SQLite (WASM-based for zero-native dependencies)    |
| **Routing**   | OSRM (Open Source Routing Machine) API              |

---

## 📂 gRPC Services

| Service             | RPCs                                                    | Deskripsi Alur                               |
| ------------------- | ------------------------------------------------------- | -------------------------------------------- |
| **AuthService**     | Register, Login, Logout                                 | Autentikasi berbasis session token.          |
| **LocationService** | ListLocations, GetPricing, SearchLocation               | Pencarian via Nominatim & Kalkulasi Harga.   |
| **RideService**     | RequestRide, GetRideStatus, ListRides, CancelRide, RateRide | **Client-Streaming** untuk input waypoints. |
| **DriverService**   | TrackDriver, AcceptRide, PickupRide, CompleteRide       | **Server-Streaming** untuk GPS tracking.    |
| **ChatService**     | Chat, GetChatHistory                                    | **Bidi-Streaming** untuk obrolan langsung.  |

---

## ⚙️ Cara Menjalankan

### 1. Persiapan Dependencies
```bash
# Install di root (opsional) atau tiap folder
npm install --prefix server
npm install --prefix gateway
npm install --prefix jalanyuk-client
```

### 2. Jalankan Layanan
Disarankan menggunakan 3 terminal terpisah:

**Terminal 1: gRPC Server**
```bash
cd server && node index.js
```
*Berjalan di port 50051*

**Terminal 2: API Gateway (Express)**
```bash
cd gateway && node index.js
```
*Berjalan di port 3000 (HTTP & WebSocket)*

**Terminal 3: Frontend (React)**
```bash
cd jalanyuk-client && npm run dev
```
*Akses via http://localhost:5173*

---

## 📋 Alur Penggunaan (Demo)

1.  **Pemesanan**: Customer login, cari lokasi, tambahkan waypoints (streaming demo), pilih kendaraan (Motor/Mobil), lalu pesan.
2.  **Penerimaan**: Driver melihat daftar pesanan secara real-time melalui WebSocket push, lalu tekan **"Ambil Ride"**.
3.  **Pickup**: Driver menekan **"Jemput Penumpang"**. Browser mengirim instruksi via WS untuk memulai gRPC tracking stream.
4.  **Live Tracking**: Perhatikan marker di map bergerak mengikuti rute jalan asli (via OSRM). Customer & Driver bisa saling chat.
5.  **Selesai & Tip**: Setelah sampai, Driver menekan **"Selesaikan Ride"**. Customer memberi rating dan tip. Driver akan menerima notifikasi tip secara instan di sisi mereka.
6.  **Histori**: Driver dapat memeriksa tab **"Histori"** untuk melihat akumulasi pendapatan harian yang diperbarui secara dinamis.

---
*Dibuat dengan ❤️ untuk tugas Mata Kuliah Integrasi Sistem.*
