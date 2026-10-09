# GanttLite — Manajemen & Penjadwalan Proyek

Aplikasi web **HTML/CSS/JS murni** (tanpa build step, tanpa dependensi) untuk
manajemen & penjadwalan proyek ala GanttProject. Data disimpan di
`localStorage` browser, dengan Ekspor/Impor JSON.

## Cara menjalankan

Cukup buka `index.html` di browser (Chrome/Firefox/Edge). Tidak perlu server,
tidak perlu install apa pun.

Jika ingin lewat server statis (opsional):

```bash
npx serve .        # atau: python -m http.server 8000
# lalu buka http://localhost:3000 (atau :8000)
```

## Struktur file

| File | Fungsi |
|---|---|
| `index.html` | Halaman utama (entry point) |
| `styles.css` | Gaya responsif |
| `scheduler.js` | Logika penjadwalan: hari kerja, subtugas, dependensi, jalur kritis |
| `gantt.js` | Render Gantt chart (header bulan, bar, panah dependensi) |
| `app.js` | UI: form proyek, kalender, daftar tugas, editor, localStorage, ekspor/impor |
| `test-scheduler.js` | Uji logika scheduler via Node (`node test-scheduler.js`) |

Urutan muat skrip di `index.html`: `scheduler.js` → `gantt.js` → `app.js`.

## Fitur

1. **Form proyek** — nama, organisasi, website, deskripsi, tanggal mulai.
2. **Kalender kerja**
   - Sabtu & Minggu masing-masing bisa di-set *Tidak ada kegiatan* (dilewati)
     atau *Tetap jalan* (dihitung hari kerja).
   - Hari libur custom: **satu kali** (one-off) atau **berulang tiap tahun**.
   - Durasi tugas dihitung dalam **hari kerja** dan otomatis melewati akhir
     pekan/libur.
3. **Tugas** — nama, kode, tanggal mulai, durasi (hari kerja), prioritas,
   warna bar, progres 0–100, resource/tim. Tanggal selesai dihitung otomatis.
4. **Subtugas (parent-child)** — tanggal & durasi tugas induk otomatis
   mengikuti anak-anaknya (mulai = anak paling awal, selesai = anak paling akhir).
5. **Dependensi** — tipe Finish–Start (FS), Start–Start (SS), Finish–Finish (FF),
   Start–Finish (SF), plus **delay** dalam hari kerja. Jadwal otomatis bergeser
   mengikuti pendahulu; jadwal dikonvergenkan dengan iterasi sehingga
   induk–anak & dependensi saling konsisten.
6. **Gantt chart** — daftar tugas di kiri, bar timeline di kanan, panah
   dependensi, warna per tugas, label bulan + hari, penanda akhir pekan/libur
   (kolom kemerahan), garis hari ini, zoom bar, collapse subtugas.
7. **Jalur kritis (Critical Path)** — checkbox *Tandai jalur kritis* menghitung
   CPM (forward/backward pass) dan menampilkan jalur kritis di toolbar.
8. **Muat contoh** — studi kasus *Pembangunan Website Toko Online Sasa Store*
   (PT Kosmetika Gorontalo), mulai 12 Okt 2026, Sabtu–Minggu libur, libur
   satu kali 28 Okt 2026, tugas A–J + subtugas A1–A3 dengan dependensi
   FS/SS+delay. Hasil: selesai **18 November 2026**, total **27 hari kerja**,
   jalur kritis **A → B → D → E → I → J**.
9. **localStorage** — semua perubahan tersimpan otomatis di browser.
10. **Ekspor/Impor JSON** — unduh seluruh data sebagai `.json`, muat kembali
    kapan saja. Tombol **Reset** menghapus semua data.

## Catatan logika

- Semua perhitungan tanggal memakai hari kerja (bukan hari kalender).
  Tugas yang mulai di hari libur otomatis digeser ke hari kerja berikutnya.
- Tipe dependensi:
  - **FS**: mulai penerima ≥ selesai pemberi + 1 + delay
  - **SS**: mulai penerima ≥ mulai pemberi + delay
  - **FF**: selesai penerima ≥ selesai pemberi + delay (durasi tetap,
    start digeser)
  - **SF**: mulai penerima ≥ selesai pemberi + delay
- Dependensi ke diri sendiri & siklus ditolak/diabaikan dengan peringatan.
- Menghapus tugas induk juga menghapus seluruh subtugas turunannya, lalu
  membersihkan dependensi yang menunjuk ke yang dihapus.

## Menjalankan uji scheduler

```bash
node test-scheduler.js
```

Memverifikasi studi kasus Sasa Store: tanggal mulai/selesai, durasi tiap tugas,
pengabaian akhir pekan & libur 28 Okt, dependensi SS+delay, total 27 hari kerja,
dan jalur kritis A-B-D-E-I-J.
