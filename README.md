# YouTube Live Chat Generator OBS

Generator overlay YouTube live chat realtime untuk OBS, mode experimental tanpa YouTube API key.

## Fitur

- Realtime live chat YouTube tanpa API key.
- Generate satu link overlay untuk OBS.
- Website generator tema putih minimal.
- Preview chat tetap berwarna sesuai custom user.
- Custom warna owner, moderator, member, user biasa.
- Custom warna pesan, background pesan, background nama, dan border.
- Avatar on/off.
- Upload gambar dekorasi dari device.
- Upload gambar/stiker di setiap bubble chat dari device.
- Posisi stiker bubble: kiri, kanan, pojok, dan kiri bawah dalam pesan putih.
- Siap deploy ke Render.com.

## Jalankan Lokal

```bash
npm install
npm run dev
```

Buka:

```txt
http://localhost:3000
```

## Cara Pakai

1. Masukkan link live YouTube.

Contoh format yang didukung:

```txt
www.youtube.com/live_chat?is_popout=1&v=VIDEO_ID
https://www.youtube.com/watch?v=VIDEO_ID
https://www.youtube.com/live/VIDEO_ID
https://youtu.be/VIDEO_ID
VIDEO_ID
```

2. Custom warna, font, avatar, background, dan gambar.
3. Upload gambar jika ingin pakai file dari device.
4. Pilih posisi stiker bubble.
5. Copy link overlay yang muncul.
6. Tempel ke OBS Browser Source.

Rekomendasi OBS Browser Source:

```txt
Width: 900
Height: 700
Custom CSS: kosongkan
```

## Upload Gambar

Upload lokal disimpan ke:

```txt
public/uploads
```

Batas:

```txt
Maksimal 5MB
png, jpg, jpeg, gif, webp, svg
```

> Catatan: di hosting free seperti Render/Railway, file upload bisa hilang saat redeploy/restart karena storage ephemeral. Untuk produksi, gunakan Cloudinary, Supabase Storage, Firebase Storage, atau R2.

## Deploy Render.com

1. Push project ke GitHub.
2. Buat **New Web Service** di Render.
3. Pilih repository project.
4. Environment: **Node**.
5. Build Command:

```bash
npm install
```

6. Start Command:

```bash
npm start
```

7. Setelah deploy, buka domain Render dan gunakan generator.

## Deploy Vercel

Aplikasi ini memakai server realtime Socket.IO. Vercel serverless kurang cocok untuk koneksi WebSocket panjang.

Untuk Vercel, disarankan hanya frontend/static. Backend realtime tetap taruh di Render/Railway/VPS. Kalau ingin full realtime dalam satu tempat, Render lebih direkomendasikan.

## Catatan Experimental

Mode ini memakai library unofficial untuk membaca live chat YouTube tanpa API key. Bisa berhenti bekerja jika YouTube mengubah sistem internal atau jika hosting terkena rate limit.

Jika live chat kosong:

- Pastikan live sedang aktif.
- Pastikan live chat tidak dimatikan.
- Buka overlay sebelum pesan baru masuk.
- Kirim pesan baru setelah overlay terbuka.
