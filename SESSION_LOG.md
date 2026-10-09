# Log Sesi — GanttLite (Aplikasi Penjadwalan Proyek Sasa Store)

**Tanggal:** 9 Oktober 2026
**Lokasi:** `C:\sasa-store`
**Model:** Buffy (Codebuff) — MiMo 2.6 Flash

---

## 1. Ringkasan

Sesi ini membangun aplikasi web manajemen & penjadwalan proyek ala GanttProject
dengan HTML/CSS/JS murni (tanpa build step), menguji logika penjadwalannya
terhadap studi kasus "Sasa Store", memverifikasi render di browser headless,
lalu menginisialisasi Git dan mendorong kode ke GitHub.

## 2. File yang dibuat

| File | Fungsi |
|---|---|
| `index.html` | Halaman utama (entry point); memuat `styles.css`, lalu `scheduler.js` → `gantt.js` → `app.js` |
| `styles.css` | Gaya lengkap + responsif (breakpoint 1000px & 640px) |
| `scheduler.js` | Logika penjadwalan: hari kerja, subtugas, dependensi FS/SS/FF/SF + delay, CPM jalur kritis, data contoh |
| `gantt.js` | Render Gantt: label bulan/hari, bar berwarna + progres, panah dependensi, kolom libur, garis hari ini |
| `app.js` | UI: form proyek, kalender kerja, pohon tugas, editor (tugas/subtugas/dependensi/resource tim), localStorage, Ekspor/Impor JSON |
| `README.md` | Cara pakai & catatan logika |
| `test-scheduler.js` | Uji logika scheduler via Node |
| `.gitignore` | Abaikan `node_modules/`, file OS, editor, log |
| `SESSION_LOG.md` | Log sesi ini (belum di-commit) |

## 3. Fitur yang diimplementasikan

1. Form proyek: nama, organisasi, website, deskripsi, tanggal mulai.
2. Kalender kerja: Sabtu & Minggu masing-masing "Tidak ada kegiatan"/"Tetap jalan"; hari libur custom one-off & recurring (tiap tahun).
3. Tugas: nama, kode, tanggal mulai, durasi (hari kerja), prioritas, warna, progres 0–100, resource/tim; tanggal selesai otomatis.
4. Subtugas parent-child: induk otomatis mengikuti anak (start = min, end = max).
5. Dependensi FS/SS/FF/SF + delay (hari kerja); jadwal konvergen via iterasi.
6. Gantt chart: daftar tugas kiri, bar timeline kanan, panah dependensi, label bulan, zoom, collapse subtugas.
7. Jalur kritis (CPM forward/backward pass) + statistik proyek.
8. "Muat contoh" studi kasus Sasa Store; localStorage; Ekspor/Impor JSON; Reset.

## 4. Perbaikan (bug) yang dilakukan

1. **Durasi tugas menyusut setelah digeser dependensi** — saat dependensi
   menggeser `startIdx` tugas daun, `endIdx` tidak dihitung ulang (B jadi 2 hr
   alih-alih 5). Diperbaiki: semua konstrain dependensi diterjemahkan ke batas
   minimum `startIdx`, lalu `endIdx = startIdx + durasi - 1`.
2. **Konvergensi induk–anak** — dependensi pada tugas induk kini menggeser
   seluruh subpohon lewat peta `offsets` per daun, lalu diulang sampai stabil.
3. **Jalur kritis bocor ke subtugas** — A3 (durasi = durasi penuh A, slack 0)
   ikut tercantum. Disaring: jalur kritis hanya menampilkan tugas root
   (subtugas tetap ditandai `critical` untuk highlight bar).
4. **Harness E2E gagal** — halaman harness tidak punya DOM `index.html`;
   dirombak pakai iframe yang memuat `index.html` asli.

## 5. Hasil tes

### Node — `node test-scheduler.js`

**28 pass, 0 fail (exit 0).** Cakupan:

- Selesai proyek **18 November 2026**, mulai 12 Okt 2026, total **27 hari kerja**.
- Jalur kritis **A → B → D → E → I → J** (6 tugas; G tidak kritis).
- Durasi & dependensi 10/10 sesuai spesifikasi (A induk ikut subtugas A1–A3).
- B 15–21 Okt (5 hr), C 15–19 Okt (3 hr), D 22 Okt – 2 Nov (7 hr, lewati libur 28 Okt).
- G (SS + delay 2 dari C) mulai 19 Okt; I 11–16 Nov; J 17–18 Nov.
- Weekend "Tetap jalan" mempercepat selesai; libur recurring berlaku lintas tahun.

### Chrome headless (E2E render)

Harness sementara memuat `index.html` asli, klik "Muat contoh", aktifkan jalur kritis:

- **0 error JS.**
- 13 bar, 13 baris daftar, 13 anak panah dependensi (+13 kepala panah), 2 label bulan, 48 kolom hari (15 kolom non-kerja), 1 hari libur.
- Statistik: "13 tugas · 27 hari kerja · mulai 12 Okt 2026 · selesai 18 Nov 2026 · Jalur kritis: A → B → D → E → I → J".
- 7 bar kritis, 5 panah kritis, 13 tugas tersimpan di localStorage.

(Harness dihapus setelah uji; jalankan ulang lewat `test-scheduler.js` saja.)

### Cek integrasi

- `node --check` untuk `scheduler.js`, `gantt.js`, `app.js` — lolos.
- Semua `id` DOM yang dipanggil via `getElementById` terverifikasi ada di `index.html`.

## 6. Langkah Git

1. `git init -b main` di `C:\sasa-store`.
2. `.gitignore` dibuat (node_modules, .DS_Store/Thumbs.db, .vscode/.idea, *.log).
3. `git add -A` — 8 file terstage (warning CRLF Windows, kozmetik).
4. Commit `13c8c48`: **"Initial commit: aplikasi penjadwalan proyek Sasa Store"** — 8 file, 2319 baris.
5. `git remote add origin https://github.com/amsynah/sasa-store-scheduler.git`.
6. `git push -u origin main` — sukses; `git ls-remote` konfirmasi `refs/heads/main` = `13c8c489…` (sama dengan lokal); tracking `main...origin/main`, working tree bersih.

## 7. Catatan & keterbatasan

- Interaksi form manual (edit tugas, tambah dependensi via klik) tidak diuji otomatis penuh — hanya alur "Muat contoh" + render; logika di baliknya tercakup uji Node.
- localStorage di `file://` umumnya bekerja; bila browser memblokir, jalankan lewat `npx serve .` (terdokumentasi di README).
- GitHub Pages belum diaktifkan (opsional: Settings → Pages → branch `main`).
- **File ini (`SESSION_LOG.md`) belum di-commit** — diminta ditunda.

## 8. Cara menjalankan

Buka `index.html` langsung di browser (tanpa server/build) → klik **"Muat contoh"** → centang **"Tandai jalur kritis"**. Uji logika: `node test-scheduler.js`.
