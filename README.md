# JalanYuk 🛵

JalanYuk adalah aplikasi ride-hailing sederhana yang dikembangkan untuk tugas mata kuliah **Integrasi Sistem** (Semester 4). Fokus utama proyek ini adalah implementasi **gRPC** di backend dan integrasinya dengan frontend menggunakan **WebSocket Bridge**.

## Konsep Utama

Sistem ini mendemonstrasikan bagaimana protokol gRPC yang efisien di sisi server dapat dihubungkan ke aplikasi web (React):
- **gRPC Streaming** (Server, Client, & Bidi) dijembatani oleh **Gateway** menggunakan **WebSocket**.
- Memungkinkan fitur real-time seperti tracking posisi driver dan chat tanpa perlu polling dari browser.

## Fitur Utama

- **Booking Real-time**: Pesan Motor atau Mobil dengan dukungan multiple waypoints.
- **Live Tracking**: Posisi driver bergerak secara real-time di peta menggunakan koordinat asli dari simulasi rute (OSRM API).
- **Chat Interaktif**: Komunikasi dua arah antara customer dan driver menggunakan bidirectional streaming.
- **Dynamic UI**: Antarmuka yang responsif terhadap perubahan status (Pending, Picked Up, Completed).
- **Notifikasi Instan**: Driver langsung mendapat info jika ada pesanan baru atau tip dari customer.

## Tech Stack

| Layer | Teknologi |
| --- | --- |
| **Backend** | Node.js (gRPC Server) |
| **Gateway** | Express.js (REST API & WebSocket Bridge) |
| **Frontend** | React (Vite) + Leaflet.js (Maps) |
| **Protokol** | gRPC (proto3) & WebSocket |
| **Database** | SQLite (WASM) |

## Cara Menjalankan

### 1. Persiapan
Install semua library yang dibutuhkan di setiap folder:
```bash
npm install --prefix server
npm install --prefix gateway
npm install --prefix jalanyuk-client
```

### 2. Menjalankan Service
Gunakan 3 terminal terpisah untuk menjalankan semua komponen:

- **Terminal 1 (gRPC Server)**
  ```bash
  cd server && node index.js
  ```
- **Terminal 2 (API Gateway)**
  ```bash
  cd gateway && node index.js
  ```
- **Terminal 3 (Frontend)**
  ```bash
  cd jalanyuk-client && npm run dev
  ```

Buka browser di: `http://localhost:5173`

## Alur Penggunaan (Demo)

1. **Pemesanan**: Customer login, pilih lokasi, dan buat pesanan.
2. **Penerimaan**: Driver menerima pesanan secara real-time.
3. **Perjalanan**: Driver menekan tombol jemput/antar, dan posisinya akan tersinkronisasi di peta customer via WebSocket.
4. **Chat**: Gunakan fitur chat untuk komunikasi langsung antar pengguna.
5. **Penyelesaian**: Setelah sampai, selesaikan perjalanan untuk melihat ringkasan biaya, rating, dan tip.

---
