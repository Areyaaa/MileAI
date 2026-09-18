# Frontend — MileAI

Laporan perubahan frontend (`frontend/`). Entri terbaru di bagian atas.

## Log Perubahan

## [2026-09-17 18:30] Floating coins disebar merata (grid + jitter)

**Apa yang dibuat/diubah:**
- `components/fx.jsx` `buildFloatingCoins`: algoritma penempatan acak (retry-until-separated) diganti **distribusi grid merata** — koin dibagi ke grid `cols × rows` (lebih lebar dari tinggi karena area hero memanjang), tiap koin diberi jitter kecil (60% ukuran sel) + ukuran acak (2.5–6.7%) supaya tetap terlihat natural tapi tidak menumpuk. Buang logika collision `r`/`margin`.

**Kenapa:**
- Permintaan user: "sebarkan coin coin itu merata" — posisi acak lama sering menumpuk di satu sisi.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Tata letak visual belum dicek live di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- Posisi dicek tetap (seed `mulberry32(20260917)`), jadi layout konsisten antar reload.
- Tidak ada.

## [2026-09-17 18:20] Ganti font ke Unbounded (Google Fonts)

**Apa yang dibuat/diubah:**
- `pages/_app.js`: import `Unbounded` dari `next/font/google` (weight 400–800, subset latin, `variable: "--font-unbounded"`), wrapper `<div className={unbounded.variable}>` di sekitar app.
- `styles/globals.css`: `--font-title` sekarang `var(--font-unbounded, "Unbounded"), <fallback system stack>` — semua teks (title & body) mengikuti.

**Kenapa:**
- Permintaan user: "pakai font ini dong https://fonts.google.com/specimen/Unbounded". Dipakai via `next/font` agar self-hosted saat build (tanpa request eksternal di runtime, sesuai free-tier & performa).

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass; font ter-download saat build).

**Hal yang perlu diperhatikan / belum selesai:**
- Unbounded adalah display font yang lebar — untuk body text kecil keterbacaannya agak berat; kalau kurang enak dibaca, bisa diturunkan ke heading aja.
- Tidak ada.

## [2026-09-17 18:10] Logo: hapus gloss circle, perbesar hero jadi 300px

**Apa yang dibuat/diubah:**
- `components/fx.jsx`: div `.logo3d-gloss` dihapus dari `Logo3D` — sekarang hanya logo image.
- `styles/globals.css`: seluruh rule `.logo3d-gloss` dihapus.
- `pages/index.js`: hero logo `260px` → `300px`.

**Kenapa:**
- Permintaan user: "jangan pakai glow circle itu. hanya logo saja dan buat agak besar". Efek tilt mouse tetap (halo + shadow tetap dipertahankan).

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass).

**Hal yang perlu diperhatikan / belum selesai:**
- Tidak ada.

## [2026-09-17 18:00] Logo lebih besar + lebih 3D (tilt mouse + gloss)

**Apa yang dibuat/diubah:**
- `pages/index.js`: hero logo diperbesar dari `220px` → `260px`, memakai props `tilt`.
- `components/fx.jsx` `Logo3D`: prop baru `tilt` — komponen mendengarkan `mousemove`/`mouseleave` (vanilla, tanpa library) dan mengatur variabel CSS `--tiltX/--tiltY` (±14°) sehingga logo ikut miring halus mengikuti arah pointer. `logo3d-gloss` (overlay radial highlight) ditambahkan.
- `styles/globals.css`: `.logo3d-scene` diberi `perspective: 900px`; `.logo3d-front` menerapkan `rotateX(var(--tiltX)) rotateY(var(--tiltY))` dengan `transform-style: preserve-3d` + transition halus; drop-shadow lebih dalam dan filter tambahan pada img; `.logo3d-gloss` untuk efek kaca.

**Kenapa:**
- Permintaan user: "buat logo itu lebih gede dikit dan lebih 3d" — tilt mouse + gloss + perspektif membuat logo terasa objek 3D sungguhan tanpa WebGL/three.js (konsisten batasan AGENTS.md).

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Efek tilt belum dicek live di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- Tilt hanya aktif di hero (`tilt`); logo header kiri-atas & footer tetap statis kecil.
- Di layar sentuh (tanpa hover) tilt tidak aktif; logo tetap tampil statis.
- Tidak ada.

## [2026-09-17 17:45] Revert hover flip logo (kembali front-only statis)

**Apa yang dibuat/diubah:**
- `components/fx.jsx`: `Logo3D` kembali tanpa prop `showBack`; import `logoBack` dan render `.logo3d-back` dihapus.
- `pages/index.js`: hero kembali `<Logo3D size={220} />`.
- `styles/globals.css`: aturan hover `rotateY(180deg)` + `perspective`/`transform-style: preserve-3d`/`transition` + `.logo3d-back` dihapus — kembali ke `.logo3d-front` statis (front saja).

**Kenapa:**
- Permintaan user: "gajdi deh di hovernya" — batalkan efek hover flip.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass).

**Hal yang perlu diperhatikan / belum selesai:**
- Tidak ada.

## [2026-09-17 17:40] Hover flip logo: front → back (hanya logo hero homepage)

**Apa yang dibuat/diubah:**
- `components/fx.jsx` `Logo3D`: prop baru `showBack` (default `false`). Kalau `true` (dipakai cuma di hero `pages/index.js`: `<Logo3D size={220} showBack />`), merender gambar `logo-back.png` ekstra dengan kelas `.logo3d-back`; `logoBack` diimpor lagi.
- `styles/globals.css`: `.logo3d-front` punya `transform-style: preserve-3d` + `transition`; kedua img `backface-visibility: hidden`, gambar back di-pre-rotate `rotateY(180deg)`. Aturan `.logo3d-hero-wrap:hover .logo3d-front { rotateY(180deg) }` membalik logo ke sisi belakang saat hover. `perspective: 900px` di `.logo3d-scene` untuk efek flip 3D.
- Header kiri-atas (`<Logo3D size={36}/>`) dan footer (`28px`) TIDAK ikut: tidak ada `showBack` dan tidak ada selector hover untuk `.landingBrand`/`.lnd-foot-brand`.

**Kenapa:**
- Permintaan user: "kalau di hover rotate ke yang back. hanya logo di homenya saja. yg ada di atas pojok kiri jangan" — flip hanya untuk logo besar di hero, logo kecil header/footer tetap statis.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Efek hover belum dicek live di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- Flip menggunakan hover CSS; di layar sentuh/touch device tidak ada hover, logo tetap menampilkan sisi depan (acceptable).
- Tidak ada.

## [2026-09-17 17:20] Logo3D statis front-only (tanpa putar 360, tanpa turntable)

**Apa yang dibuat/diubah:**
- `components/fx.jsx` `Logo3D`: markup turntable (`.logo3d-rotor` + 4x `.logo3d-plate` `rotateY(i*90deg) translateZ(--rz)`) diganti menjadi **satu `.logo3d-front`** yang hanya menampilkan `logo-front.png`. Animasi putar 360 dihapus; `LOGO3D_FACES`, `--rz`, dan import `logoBack/logoLeft/logoRight` dibuang. Halo radial + shadow ellipse + bob tetap dipertahankan agar tetap terkesan objek 3D melayang.
- `styles/globals.css`: `.logo3d-rotor/.logo3d-plate` → `.logo3d-front` (statis, tanpa `preserve-3d`/`perspective`); keyframes `logoRotorSpin` dihapus; override ukuran kecil landing/footer disesuaikan (hanya width plate).

**Kenapa:**
- Permintaan user: "pakai yang front saja dan jangan berputar 360" — logo cukup tampil satu sisi depan, tidak perlu efek putar.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass).

**Hal yang perlu diperhatikan / belum selesai:**
- Efek "3D" sekarang bergantung pada bob + halo + shadow (bukan rotasi) — kalau mau benar-benar statis total, matikan `logoBob` di `.logo3d-wrap`.
- Tidak ada.

## [2026-09-17 16:45] Terjemahan frontend + README ke bahasa Inggris

**Apa yang dibuat/diubah:**
- Seluruh teks user-visible di frontend (label, tombol, hint, error, log, placeholder, badge status) diterjemahkan ke bahasa Inggris — pull semua halaman & komponen:
  - `pages/index.js` (landing): PROBLEMS, STEPS, marquee, hero h1/paragraf, role cards, footer.
  - `pages/payer/index.js` + `pages/payer/create.js`: labels, error messages, tombol ("Create Escrow", "Approve (exact)", "Remove", "Add milestone"), success card, stats bar ("Locked funds/Released/Needs review/Awaiting AI"), hint approve.
  - `pages/worker/index.js` + `pages/worker/submit.js`: "Submit Proof", "Unnamed project", release notifications, form & select labels, validasi.
  - `components/Layout.jsx`, `WalletChip.jsx`, `WalletPicker.jsx`, `bits.jsx` (Criteria/Proof/Close/View full reason), `fx.jsx` (story label, komentar).
  - `lib/*`: `wallet.jsx` (error/log context), `contract.js` (error "…is not set in…"), `escrows.js`, `api.js`, `projects.js`, `useWalletProviders.js`.
  - Komentar Indonesia di `styles/globals.css`, `frontend/.env.example`, dan semua JS/JSX ikut diterjemahkan.
- **Label status AI dari backend tetap bahasa Indonesia**, jadi ditambahkan map `DISPLAY_EN` di `lib/escrows.js` (frontend-only): `Perlu Review Manual → Manual Review Needed`, `Bukti Belum Cukup → Insufficient Evidence`, `Error Verifikasi → Verification Error`. `MilestoneRow` `review` check di `bits.jsx` disesuaikan ke label baru. On-chain fallback (`chain.STATUS`) sudah bahasa Inggris.
- `README.md` ditulis ulang penuh dalam bahasa Inggris (flow diagram, tabel, security section, dsb).

**Kenapa:**
- Permintaan user: "ubah semua teks di frontend dan readme menggunakan bahasa inggris". Penerjemahan di layer frontend (bukan backend) karena scope user frontend+README; label AI tetap diterjemahkan di UI via map supaya tampilan konsisten tanpa mengubah backend.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass).

**Hal yang perlu diperhatikan / belum selesai:**
- Backend (`backend/main.py` `ACTION_LABEL`) masih mengembalikan label Indonesia ("Perlu Review Manual", dll) — sudah di-map ke Inggris di frontend, tapi kalau nanti ingin konsisten penuh di API juga, terjemahkan di backend lalu hapus map `DISPLAY_EN`.
- `docs/*.md` dan `PRD` masih berbahasa Indonesia (di luar scope user).

## [2026-09-17] Rework Logo3D jadi turntable (tanpa cube) + FloatingCoins anti-tabrakan

**Apa yang dibuat/diubah:**
- `components/fx.jsx`:
  - `Logo3D` diubah dari **cube persegi** jadi **turntable 3D**: 4 foto logo PNG (`logo-front/back/left/right.png`) diletakkan di pinggir silinder virtual (`rotateY(i*90deg) translateZ(--rz)`), diputar 360° linear (`logoRotorSpin`). Tidak ada kotak/bingkai — foto PNG langsung, `backface-visibility: hidden` menyembunyikan sisi belakang. Ada halo radial di belakang + shadow ellipse di bawah untuk kesan objek benar-benar melayang 3D, plus bob naik-turun.
  - `FloatingCoins` memakai **rejection sampling deterministik** (PRNG `mulberry32` seed tetap): posisi/ukuran coin dicek jarak antar pusat (`hypot` dengan faktor aspek vertikal 0.6) sebelum diterima — coin tidak saling tumpang tindih. Setiap coin punya `--fdur/--fdrift/--frot` unik.
  - Ukuran coin kini dalam **persen lebar kontainer** (bukan px) supaya scaling lancar di semua viewport.
- `styles/globals.css`: kelas `.logo3d-cube/.logo3d-face/.logo3d-glow` dihapus → diganti `.logo3d-rotor/.logo3d-plate/.logo3d-halo/.logo3d-shadow`; keyframes `logoCubeSpin` → `logoRotorSpin`; override header/footer (36px/28px) disesuaikan ke struktur baru, halo+shadow dimatikan untuk ukuran kecil.

**Kenapa:**
- User request: "jangan berikan kotak itu, jadikan beneran 3d dari foto, tanpa cube" — cube terlihat sebagai kotak; turntable bikin foto-foto logo berputar seperti objek 3D sungguhan tanpa pinggiran kotak.
- User request: "coin jangan bertabrakan/tumpang tindih" — position acak lama bisa overlap; rejection sampling menjamin jarak minimum antar coin.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Belum dicek visual live di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- Turntable memakai `perspective` sih — di browser lama (Safari <9, IE) efek 3D tidak muncul, tapi landing tetap tampil foto statis. Tidak ada gambar `logo-top/bottom`, jadi hanya 4 sisi.
- Karena `backface-visibility:hidden`, pada pertengahan rotasi hanya sisi depan yang terlihat — ini justru yang bikin terlihat seperti objek 3D berputar.
- Posisi coin deterministik (seed tetap `20260917`) — konsisten antar render, bukan acak tiap load.

## [2026-09-17] Logo 3D cube + Floating Coins di landing (pakai gambar assets)

**Apa yang dibuat/diubah:**
- `components/fx.jsx`:
  - `Logo3D` (baru) — cube 3D berputar (CSS `transform-style: preserve-3d`) memakai gambar `logo-front/back/left/right.png` dari `components/assets/` di 4 sisi; setiap sisi punya bingkai + glow. `--faceOff` dihitung dari `size * 0.7 * 0.5` (cube 70% dari container, offset setengah sisi).
  - `FloatingCoins` (baru) — gambar `3d-bnb.png`, `3d-btc.png`, `3d-cake.png`, `3d-floki.png` dari `components/assets/` disebar acak (`seededRandom`, deterministik) di hero dengan posisi/ukuran/durasi/delay/drift berbeda-beda, efek floating naik-turun + drift horizontal + rotasi.
  - Gambar diimpor langsung via ES import (bukan URL statis) supaya Next.js me-bundle aset — folder `components/assets/` tidak ter-serve sebagai public path.
- `styles/globals.css`: kelas `.logo3d-*` (wrap, scene, cube, face front/back/left/right, glow), `.logo3d-hero-wrap`, `.floating-coins`, `.floating-coin` (floating keyframes `coinFloatY` + `coinFloatX`, var CSS `--fdur/--fdelay/--fdrift`), plus override ukuran kecil untuk header landing (`36px`) & footer (`28px`).
- `pages/index.js`: hero 001 mengganti `Coin3D` CSS brand dengan `Logo3D` 220px + `<FloatingCoins count={10}/>` di belakang konten hero; header & footer brand pakai `Logo3D` kecil.

**Kenapa:**
- Permintaan user: pakai gambar yang ada di `components/assets/` — logo (4 sisi) digabung jadi satu logo 3D yang bagus, dan coin 3D disebar acak di elemen hero dengan efek floating.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Belum dicek visual live di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- `Logo3D` memakai 4 sisi (front/back/left/right) — cube tanpa top/bottom (tidak ada gambar `logo-top/bottom`); saat kubus berputar 360° tiap sisi terlihat bergantian.
- `FloatingCoins` bersifat visual-dekoratif (`aria-hidden`), posisi deterministik (seeded) — bukan acak tiap render, supaya idempoten.

## [2026-09-16 20:30] Security pre-testnet: trigger POST+token, approve flow dual

**Apa yang dibuat/diubah:**
- `lib/api.js` — `triggerVerification` berubah dari GET → **POST** (sesuai backend); menambahkan helper `jpost` yang mengirim header `X-Agent-Token` bila `NEXT_PUBLIC_TRIGGER_TOKEN` di-set (readme komentar). Fix HTTP 405 sebelumnya.
- `pages/payer/create.js` — tombol **"Approve"** diganti jadi dua tombol: "Approve (jumlah)" (`onApproveToken`, exact-amount, utama/amannya) dan "Approve (infinite)" (`onApproveMax`, MaxUint256, optional + warning). FormHint di bawah tombol menjelaskan perbedaan risiko masing-masing.
- `.env.example` — tambah `NEXT_PUBLIC_TRIGGER_TOKEN` (opsional, harus sama dengan backend). Komentar perbaruan bagian `NEXT_PUBLIC_BACKEND_URL` bahwa CORS perlu dikonfigurasi.

**Kenapa:**
- `triggerVerification` memakai GET → backend `POST /agent/trigger` → 405. Perbaikan ke POST.
- Infinite approve tanpa opsi exact-amount berisiko bagi user yang tidak paham allowance. Exact-amount jadi default/utama.
- Token `NEXT_PUBLIC_` dikirim ke browser; merupakan guardian ringan anti-spam, bukan autentikasi kuat — didokumentasi di .env.example.

**Status:**
- [x] Sudah ditest — `npm run build` sukses, 0 error.

**Hal yang perlu diperhatikan / belum selesai:**
- Agar token berfungsi: isi `NEXT_PUBLIC_TRIGGER_TOKEN` di `frontend/.env.local` dengan nilai yang sama dengan `AGENT_TRIGGER_TOKEN` di `backend/.env`. Kosongkan kedua-duanya untuk mode dev lokal (endpoint terbuka).
- Kalau backend membatasi `ALLOWED_CORS_ORIGINS` (tidak `*`), pastikan origin frontend ada di list; kalau pakai Vercel, set `NEXT_PUBLIC_BACKEND_URL` ke alamat backend yang bisa diakses (localhost tidak bisa diakses dari Vercel).

## [2026-09-16 12:20] Approve Max (infinite allowance) + fix triggerVerification

**Apa yang dibuat/diubah:**
- `lib/contract.js` — tambah `approveTokenInfinite(signer, tokenAddress)` yang approve `type(uint256).max` sekali pakai ke kontrak escrow (line ~128).
- `pages/payer/create.js` — tambah handler `onApproveMax` + tombol **"Approve Max"** di sebelah "Approve Token" (line ~203). Sekali approve → allowance maksimum, jadi nggak perlu approve ulang tiap ganti jumlah/daftar milestone.
- `lib/api.js` — tambah helper `jpost`; `triggerVerification` sekarang pakai **POST** ke `/agent/trigger/{escrowId}/{milestoneIndex}` (sebelumnya GET → FastAPI 405).

**Kenapa:**
- Root-cause kegagalan "create escrow" di smoke test: user approve token cuma 10 MILE via `approveToken`, tapi `createEscrow` butuh allowance total semua milestone (110 MILE) → revert `ERC20InsufficientAllowance`. Solusi dua lapis: (1) tombol Approve Max biar allowance nggak jadi blocker lagi, (2) fix method HTTP trigger.
- `triggerVerification` awalnya salah pakai GET (diwarisi pola baca status), padahal route backend `/agent/trigger` adalah POST — frontend dapat 405 saat mencoba trigger manual.

**Status:**
- [x] Sudah ditest — `npm run build` (Next.js) sukses: 7 route terprebuild, 0 error lint/type.

**Hal yang perlu diperhatikan / belum selesai:**
- Tombol "Approve Manual" di dashboard payer tetap **kondisional**: hanya muncul kalau milestone ber-status **Submitted** (perlu review). Untuk mengujinya, butuh escrow dengan milestone Submitted — saat ini escrow yang ada sudah Released (AI E2E auto-cairkan).

## Log Perubahan

## [2026-09-15] Revert baris token 3D — coin brand tunggal dikembalikan

**Apa yang dibuat/diubah:**
- Revert penuh perubahan sebelumnya: `pages/index.js` hero kembali ke `Coin3D` brand (M/AI, 220px) dalam `.coinwrap` (parallax), bukan baris 4 token.
- `components/fx.jsx`: `TokenCoin3D`, `TOKENS`, `TOKEN_KEYS`, `CoinShell`, `TokenFace` dihapus; kode `CoinFace`/`Coin3D` kembali ke bentuk semula.
- `styles/globals.css`: kelas `ct-btc/bnb/cake/floki`, `.tokenRow`, `.tcoins`, `.tcoin` dihapus.

**Kenapa:**
- User minta kembali ke posisi awal: "jangan gtu, kembalikan posisi ke yg awal" — baris token tidak dipakai.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static).

**Hal yang perlu diperhatikan / belum selesai:**
- Tidak ada.

## [2026-09-15] Token 3D BTC/BNB/CAKE/FLOKI di landing (DIREVERT)

**Apa yang dibuat/diubah:**
- `components/fx.jsx`: refactor coin jadi generik — `CoinShell` (kerangka: orbit 8 satelit + flip 3D) menerima node face apa pun; `Coin3D` (brand M/AI) dan `TokenCoin3D` (baru) memakainya. `TokenCoin3D` punya peta `TOKENS` (btc/bnb/cake/floki: sym + name) + face berwarna per token.
- `styles/globals.css`: kelas `ct-btc`, `ct-bnb`, `ct-cake`, `ct-floki` (conic-gradient + inner glow + border ring sesuai brand: emas BTC, kuning BNB, pink CAKE, biru FLOKI); layout `.tokenRow`/`.tcoins`/`.tcoin` (flex center, delay float via `--i`, hover translate + glow label).
- `pages/index.js`: hero 001 — coin brand tunggal diganti baris 4 coin 3D `BTC · BNB · CAKE · FLOKI` (masing2 118px + label), dibungkus `Reveal` (muncul saat scroll).

**Kenapa:**
- Permintaan user: "berikan 3d token/coin dari ini btc,bnb,cake,floki pada dashboardnya" → dikonfirmasi ditempatkan di landing.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static). Belum dicek live di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- Warna coin adalah aproximasi brand (CSS conic), bukan logo persis; untuk hackathon sudah cukup.
- Coin3D brand (M/AI) masih dipakai kalau butuh (tidak tampil di landing sekarang).

## [2026-09-15] Landing ala Fates + palette biru/ungu

**Apa yang dibuat/diubah:**
- **Susunan ulang landing (`pages/index.js`)** jadi one-page full-screen ala Fates-like (tiap putaran scroll = "babak"):
  - `001 HERO` — headline besar + token 3D, memudar & parallax saat scroll
  - divider marquee besar (outline text bergerak)
  - `002 MASALAH` — pain points pembayaran proyek manual (3 card)
  - `003 CARA KERJA` — **pinned story stack**: container 500vh, inner sticky 100vh; scroll progress menentukan langkah aktif (5 langkah), langkah yang lewat blur-fade ke atas + progress bar & dot rail di sisi kanan
  - `004 PILIH PERAN` — role selection (Payer/Worker) → popup connect wallet → redirect otomatis
  - hash ticker + footer
- **Komponen FX baru (`components/fx.jsx`)** tanpa dependency eksternal:
  - `ScrollProgress` — bar tipis gradient di atas (status scroll)
  - `Parallax` — translate/opacity berbasis scroll (rAF), untuk kedalaman layer
  - `Marquee` — divider teks outline raksasa bergerak (pause saat hover)
  - `StoryStack` — pinned story naratif ala Fates (progress → active slide; `setIdx` hanya saat berubah untuk mengurangi re-render)
- **Palette biru + ungu** (permintaan user): `--accent #4d7cfe`, `--accent2 #7aa2ff`, `--violet #8b5cf6`; seluruh 44 glow teal (`rgba(45,212,191,*)`) di globals.css diganti biru `rgba(77,124,254,*)`; coin 3D conic, blobs, gradient text, tombol, brandmark mengikuti biru→ungu. Halaman dashboard ikut ter-tint otomatis lewat token CSS.
- `globals.css`: `.landing` `overflow:hidden` → `overflow:clip` (referensi `position:sticky`); `.landingHead` sticky + blur.

**Kenapa:**
- Permintaan user: "susunan webnya seperti Fates (scroll full animasi), warnanya biru perpaduan ungu". Semua animasi dibuat vanilla (canvas + rAF + CSS) — konsisten batasan AGENTS.md (no heavy deps, free tier).

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Belum dicek live di browser (perlu `npm run dev` + scroll test).

**Hal yang perlu diperhatikan / belum selesai:**
- `overflow:clip` butuh browser modern (Chrome 90+, FF 81+, Safari 16+); kalau tidak didukung, sticky story tetap jalan tapi mungkin ada horizontal overflow kecil dari parallax.
- Story stack hanya mengupdate slide saat indeks berubah; bar progress di-set langsung via ref (tanpa re-render).
- Navigasi header (001/002/003) pakai anchor; header sticky menyusul scroll.

## [2026-09-15] Hilangkan WalletChip dari topbar semua halaman

**Apa yang dibuat/diubah:**
- `components/Layout.jsx`: komponen `<WalletChip/>` dihapus dari topbar (kanan atas) halaman berperan (`/payer`, `/payer/create`, `/worker`, `/worker/submit`). Header hanya memuat judul + subtitle; indikator akun masih tampil di `sidebarNote`.

**Kenapa:**
- Lanjutan permintaan sebelumnya ("hilangkan dulu connect wallet di kanan atas"): setelah alur pilih-role→popup connect di landing, chip wallet di topbar halaman dalam tidak lagi dibutuhkan untuk sekarang.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static).

**Hal yang perlu diperhatikan / belum selesai:**
- Dengan chip hilang, user tidak bisa ganti/putus wallet dari dalam halaman. `context` wallet tetap bekerja (provider/account tersimpan); kalau dibutuhkan lagi, tinggal pasang ulang `<WalletChip/>` di Layout atau buat menu wallet di tempat lain.

## [2026-09-15] Landing: chip connect dihapus → popup connect setelah pilih peran

**Apa yang dibuat/diubah:**
- `pages/index.js`: tombol **Connect** (WalletChip) di kanan atas landing **dihapus**. Alur baru: user pilih role → popup **Connect wallet** langsung terbuka (via `onConnect()` dari context) → setelah tersambung, otomatis redirect ke `/payer` atau `/worker`.
- `components/WalletPicker.jsx` (baru): modal pilih wallet EIP-6963 dipindah dari `WalletChip.jsx` menjadi komponen mandiri + dirender **global** di `_app.js` (`pickerOpen` dari context) — sehingga bisa dibuka dari halaman mana pun, tidak hanya dari chip.
- `components/WalletChip.jsx`: tidak lagi merender picker sendiri (disederhanakan).
- Kartu "connectStep" di landing disesuaikan: sekarang menjelaskan popup sudah terbuka + tombol "Buka popup connect" sebagai fallback kalau popup ditutup; pesan error context (mis. tidak ada wallet terdeteksi) ditampilkan di kartu ini.

**Kenapa:**
- Permintaan user: hilangkan connect wallet di header landing; popup muncul setelah dia memilih peran (bukan via tombol yang di-disable). Picker di-global-kan supaya mekanisme popup bisa dipicu dari selain WalletChip tanpa duplikasi modal.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Belum dicek interaksi live di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- Kalau user menutup popup (klik backdrop) setelah pilih role, kartu connectStep menyediakan tombol fallback untuk membuka ulang popup.
- Landing kini tidak punya indikator wallet di header sama sekali sebelum connect; setelah connect di halaman lain, akun tampil di WalletChip topbar masing-masing halaman.

## [2026-09-15] Redesign UI "web3/space" (Robotos + Ledger + Fates)

**Apa yang dibuat/diubah:**
- `styles/globals.css` ditulis ulang penuh jadi tema dark space premium: palette `--bg:#04050b`, panel glass (backdrop-filter blur), aksen teal `#2dd4bf` + violet `#8b5cf6` + cyan `#22d3ee`; aurora blobs + gridlines holografik (FxBackground), box-shadow glow teal, gradient text. **Semua nama kelas lama dipertahankan** (app, sidebar, nav, walletChip, picker, milestone/msHead/msTitle/msRight, statsBar/stat, releaseRow, roleCard/roleGo/connectStep/steps, dsb) — dashboard & form ikut ter-restyle tanpa ubah logika.
- `components/fx.jsx` (baru, tanpa dependency tambahan — sesuai AGENTS.md):
  - `FxBackground` — aurora blobs bergerak + gridlines + canvas jaringan node blockchain
  - `BlockField` — kanvas node bergerak / garis terhubung teal-violet (rAF)
  - `Coin3D` — coin token 3D murni CSS (front/back translateZ ±12px, sway/float/nya orbit dashed + satellite + shine sweep), nilai `--cr` ikut ukuran coin
  - `Reveal` — scroll reveal IntersectionObserver (fade-up, delay opsional, ala Ledger)
  - `AnimatedNumber` — counter count-up ease-out saat terlihat
  - `BrandMark` — logo hexagon-node SVG (gradient + node berkedip)
  - `HashTicker` — marquee ticker hash/status (nuansa block explorer, pause saat hover)
- `components/Layout.jsx`: `<FxBackground/>` sebagai background halaman berperan, brand pakai `<BrandMark/>`.
- `pages/index.js` (landing): hero kini cinématique — coin 3D di atas headline, reveal stagger di hero & role cards, ikon role diganti **emoji → inline SVG** (shield-check payer, clipboard-check worker), HashTicker di bawah.
- `pages/payer/index.js` & `pages/worker/index.js`: stats bar memakai `<AnimatedNumber/>`.

**Kenapa:**
- Permintaan user: "web3 banget" dengan referensi visual Robotos (neon/glow + partikel), Ledger Nano X (glass premium + scroll reveal), Fates World (aurora deep-space + grid). 3D coin & jaringan node menyiratkan "token di smart contract" tanpa butuh library WebGL (konsisten batasan free-tier/no heavy deps).

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static, lint pass). Belum dicek visual di browser.

**Hal yang perlu diperhatikan / belum selesai:**
- Animasi canvas/a11y: `FxBackground` dan `BlockField` diberi `aria-hidden`; reveal memakai `prefers-reduced-motion` fallback (selalu tampil).
- Render kanvas di semua route = 2 canvas tambahan/halaman (landing + tiap dashboard); dalam range ringan, tapi jadi beban kecil — bisa dimatikan via prop kalau perf bermasalah di device low-end.
- `--cr` orbit coin dikalkulasi `size*0.68` — kalau ukuran coin berubah jauh, sesuaikan di `components/fx.jsx` `Coin3D`.

## [2026-09-15] Multi-page + role select + ganti wallet

**Apa yang dibuat/diubah:**
- **Multi-page** (dari single page tab-state jadi routing Next.js `pages/`):
  - `/` — landing & pilih peran
  - `/payer` — dashboard Payer
  - `/payer/create` — buat escrow
  - `/worker` — dashboard Worker
  - `/worker/submit` — submit bukti
- **Alur pilih role dulu → connect wallet**: di `/`, user klik "Join as Payer/Worker" tanpa perlu wallet dulu; tombol pilih menandai `pendingRole`, lalu instruksi untuk connect wallet via chip di kanan atas. Begitu `provider` tersedia, halaman otomatis redirect ke `/payer` atau `/worker`.
- **Ganti wallet** (`lib/wallet.jsx` baru): `WalletProvider` (React Context) di `_app.js` menyimpan state wallet global. `components/WalletChip.jsx` menampilkan menu dropdown di topbar (Ganti Wallet / Putuskan Koneksi / Switch Network) + picker wallet EIP-6963. Dengarkan `accountsChanged`/`chainChanged` supaya pindah akun/network terdeteksi. Di landing, wallet chip di-`disabled` sampai user pilih peran (`<WalletChip disabled={!pendingRole && !provider}/>`) — flow wajib: pilih role dulu, baru connect; chip kembali aktif penuh saat sudah connect (untuk ganti/putus wallet).
- **Payer** (`pages/payer/*`): dashboard daftar escrow milik wallet (project, recipient, token, tiap milestone + status/confidence/alasan AI, Approve Manual, Re-verifikasi, Refund) dengan stats bar & auto-refresh ±15 dtk. Halaman create: alamat pembuat (otomatis), alamat penerima, **nama project**, token ERC20, **chain (default BSC Testnet)**, list milestone dinamis; setelah tx sukses tampilkan **Escrow ID** (di-parse dari event `EscrowCreated` di receipt) + tombol ke dashboard. `lib/contract.js` `createEscrow` kini return `{receipt, escrowId}`.
- **Worker** (`pages/worker/*`): dashboard escrow tempat wallet menjadi recipient dengan stats (dana cair, perlu review, belum dikerjakan) + **pemberitahuan pencairan dana** (tiap milestone Released menampilkan `+N token` + tx). Submit bukti: dropdown escrow → **dropdown milestone menyambung** (hanya status Pending milik escrow terpilih, prefill via `?escrow=<id>` dari tombol dashboard), teks bukti + **link wajib** (validasi regex `https?://`).
- **Nama project disimpan di `lib/projects.js` (localStorage)** — keputusan yang dikonfirmasi user: kontrak & backend tidak punya field project, jadi disimpan per escrow id di browser (cukup untuk demo 1 browser; fallback "Tanpa nama project").
- `lib/escrows.js` baru: `loadAllEscrows` (on-chain + AI backend) + helper filter `byPayer`/`byRecipient`. `components/bits.jsx` baru: atom UI bersama (StatusBadge, CircularConfidence, ReasonExpander, MilestoneRow, TokenSymbol, ikon). `styles/globals.css`: gaya landing, role card, wallet menu, stats bar, release notification, success card.

**Kenapa:**
- Permintaan user (deviasi dari AGENTS.md "1 halaman" — dicovered eksplisit): role dipisah berdasar peran, multi-page biar tiap peran punya konteks sendiri; ganti wallet jadi mudah karena EIP-6963 menyediakan banyak provider. Wallet state ditaruh di Context supaya persisten lintas halaman dan memungkinkan ganti wallet di mana pun.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (7 route static). Belum di-test hidup di browser (butuh MetaMask/Rabby + anvil/testnet + backend berjalan).

**Hal yang perlu diperhatikan / belum selesai:**
- Chain selector di form create bersifat informatif + memblokir submit kalau memilih chain selain yang terkonfigurasi (`NEXT_PUBLIC_CHAIN_ID`) — kontrak hanya live di satu chain.
- Nama project localStorage tidak tampil lintas browser/perangkat; dan hilang kalau localStorage di-clear (bukan data on-chain).
- Item 5 dari request user kosong & dikonfirmasi "lanjut 1-4 saja".
- Link wajib di submit bukti adalah perilaku baru vs form lama (yang membuat link opsional); teks bukti tetap dikirim ke kontrak sebagai `proof + "\nLink: ..."`.

## [2026-09-15] Fix `wallet_switchEthereumChain` error 4902 di Rabby (chain 0x7a69 / 31337)

**Apa yang dibuat/diubah:**
- `frontend/lib/contract.js`:
  - `BSC_TESTNET` kini memilih `rpcUrls` berdasar chain target — Anvil (31337) → `http://127.0.0.1:8546` (sesuai port anvil lokal yang dipakai dev), bukan default RPC BSC Testnet. `nativeCurrency` ikut disesuaikan (ETH untuk Anvil, tBNB untuk BSC Testnet), `blockExplorerUrls` kosong untuk Anvil.
  - Fungsi baru `isChainNotFoundError(err)` — error 4902 "Unrecognized chain ID" dari Rabby dibungkus jadi `code: -32603`/`UNKNOWN_ERROR` oleh ethers v6, jadi pengecekan `err?.code === 4902` sebelumnya tidak pernah match. Sekarang semua kode error ditelusuri rekursif lewat `err.code`, `err.info`, `err.error`, `err.data` (termasuk `data.originalError.code === 4902` khas Rabby).
  - `ensureBscTestnet` memakai helper tersebut untuk fallback ke `wallet_addEthereumChain`.

**Kenapa:**
- Error `could not coalesce error ... Unrecognized chain ID "0x7a69"` muncul karena (1) `NEXT_PUBLIC_CHAIN_ID=31337` = chain Anvil yang belum terdaftar di Rabby, dan (2) fallback `wallet_addEthereumChain` tidak pernah jalan karena pengecekan error 4902 gagal (ethers v6 membungkus code-nya jadi `UNKNOWN_ERROR`). RPC untuk Anvil juga salah → wallet tak bisa connect walau chain berhasil ditambahkan.

**Status:**
- [ ] Belum ditest — perlu uji manual di browser: connect wallet → konfirmasi dialog "tambah jaringan Anvil (31337)" muncul di Rabby → network pindah → interaksi lancar. Untuk BSC Testnet tetap pakai `NEXT_PUBLIC_CHAIN_ID=97` + alamat contract hasil deploy BSC.

**Hal yang perlu diperhatikan / belum selesai:**
- Setup dev saat ini Anvil (31337). Kalau mau deploy ke BSC Testnet asli, ganti `frontend/.env.local`: `NEXT_PUBLIC_CHAIN_ID=97`, `NEXT_PUBLIC_CONTRACT_ADDRESS=<alamat deploy bsc>`, dan restart `npm run dev` (env Next.js dibaca saat proses start).
- Setelah edit env, harus restart dev server — perubahan `NEXT_PUBLIC_*` tidak berlaku hot-reload.

## [2026-09-15] Smoke test manual redesign UI (headless + data source)

**Apa yang dibuat/diubah:**
- Anvil lokal dijalankan (port **8546**, chainId 31337), `forge script Deploy.s.sol` redeploy → `TestToken=0x5FbDB2315678afecb367f032d93F642f64180aa3`, `MilestoneEscrow=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` (identik dengan deploy sebelumnya; `.env` backend tetap valid).
- `frontend/.env.local` dibuat: `NEXT_PUBLIC_CONTRACT_ADDRESS=0xe7f1725…F0512`, `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`, `NEXT_PUBLIC_CHAIN_ID=31337`. `.gitignore` ditambah `frontend/.env.local`.
- Seed data on-chain via web3: **8 escrow dummy** (2 milestone tiap escrow), submitProof pada escrow0-m0/m1 & escrow1-m0, `autoRelease(0,0)` oleh wallet agent → ada milestone berstatus Released / Submitted untuk ditampilkan dashboard.
- **Verifikasi sumber data AI (poin terpenting):**
  - `POST /agent/trigger/1/0` dengan `LLM_API_KEY` kosong → action `error` tersimpan (jalur asli). `GET /escrows/1/milestones/0/status` → `display_status=Error Verifikasi`, `verification.reason` dari backend.
  - Disisipi **satu baris dummy** `manual_review` (conf 63, reason bertanda `DUMMY SMOKE-TEST`) untuk escrow1-m0 → endpoint mengembalikan `Perlu Review Manual` + confidence + reason. Ini semata agar UI bisa memverifikasi jalur tampilan tanpa LLM key (satu-satunya data yang "dikarang", jelas ditandai, bukan data produksi).
  - Backend **dimatikan** → endpoint status (satu-satunya sumber confidence/alasan AI) tidak bisa diakses sama sekali → membuktikan UI tidak membaca AI verdict dari on-chain. Fallback UI (inspeksi kode `pages/index.js`): bila `fetchMilestoneStatus` gagal → `backendError` + label fallback on-chain `chain.STATUS`, tanpa confidence.
- **Timing dashboard** (simulasi loop `loadDashboard`, 8 escrow / 16 milestone di anvil lokal): read on-chain ≈0.49s + HTTP backend ≈0.99s → ~1.5s I/O (total simulasi 3.6s termasuk overhead). Tidak lambat untuk MVP lokal.

**Kenapa:**
- Browser/MetaMask tidak bisa dikendalikan dari CLI — semua poin yang bisa diverifikasi headless (jalan server, jalur data, timing) dilakukan via HTTP/web3, bagian tampilan visual diserahkan ke checklist manual user.

**Status:**
- [ ] Belum sepenuhnya ditest — bagian **browser + MetaMask belum dilakukan user** (connect wallet → buat escrow via UI → submit bukti → Approve Manual). Harus diverifikasi: UI menampilkan conf 63 + alasan dummy di escrow1-m0 hanya dari backend, badge Escrow#0 m0 "Released" **tanpa** confidence (karena tidak ada record AI → membuktikan UI tidak mengarang score).

**Hal yang perlu diperhatikan / belum selesai:**
- **RPC MetaMask harus `http://127.0.0.1:8546`** (bukan 8545) karena anvil dijalankan di 8546.
- `LLM_API_KEY` kosong → tidak ada AI verdict asli; polling agent akan men-simpan action `error` tiap siklus untuk submitted milestone. Isi key + `POST /agent/trigger` untuk alur auto-release sungguhan.
- Ada 3 submit proof yang akan diproses polling agent — setelah LLM key diisi, escrow0-m1 & escrow1-m0 serta m1 akan dapat verdict; jika mau uji alur menarik, sesuaikan/clear `backend/mileai.db` dulu.
- Verifikasi dummy harus dibersihkan sebelum demo produksi (hapus baris `manual_review` escrow1-m0).

## [2026-09-15] Redesign UI — dark fintech dashboard

**Apa yang dibuat/diubah:**
- `styles/globals.css` ditulis ulang penuh: palet dark (bg `#0B0D12` → card `#161A23`, border tipis `rgba(255,255,255,.06)`, radius besar `rounded-2xl` style), satu aksen **teal/mint `#2DD4BF`** dipakai konsisten (tombol primer, radial progress, badge Released).
- `pages/index.js` di-restruktur: layout sidebar-kiri (3 tab state React — Dashboard / Buat Escrow / Submit Bukti, BUKAN routing), topbar dengan **wallet chip** kecil di kanan atas (`0x1234…abcd` + dot status chain), status viewer jadi **card grid** semua escrow.
- Dashboard sekarang memuat **semua escrow** (`escrowCount` on-chain, cap 50) dan per-milestone-nya: badge status berwarna (Pending abu, Submitted amber, Released teal, Perlu Review Manual oranye redup, Disputed/Error merah redup), **confidence radial** (SVG murni, tanpa library), alasan AI di-expand/collapse (`ReasonExpander`), tombol Approve Manual hanya muncul saat "Perlu Review Manual".
- Form "Buat Escrow" & "Submit Bukti": label di atas input, input bg lebih terang dari card, tombol primer aksen solid, tombol sekunder ghost aksen.
- `lib/contract.js`: tambah `readEscrowCount(provider)` untuk ringkasan dashboard.

**Kenapa:**
- Per arahan desain: dark minimalist gaya fintech dashboard, satu aksen "trust/verified" (teal), hindari ungu & widget tak relevan (kalender/gamifikasi tetap tidak ada). Mempertahankan 5 komponen wajib AGENTS.md — tidak ada fitur baru selain lapisan visual + agregasi viewer.
- Confidence pakai radial biar jadi focal point tiap card (bukan angka polos), sesuai arahan.

**Status:**
- [x] Sudah ditest — `npm run build` sukses (Next 14.2.35, pages router, 1 halaman static). Lint/type-check bersih. Belum di-test hidup di browser (butuh MetaMask + alamat kontrak).

**Hal yang perlu diperhatikan / belum selesai:**
- Belum ada `.env.local`; `NEXT_PUBLIC_CONTRACT_ADDRESS` masih placeholder → dashboard akan menampilkan "Belum dikonfigurasi". Isi alamat deploy (anvil: chainId 31337, atau testnet 97).
- Dashboard me-refresh ulang tiap pindah tab ke Dashboard (`useEffect`); ini murah secara MVP tapi bisa dioptimasikan (cache + polling) kalau escrow banyak di mainnet/testnet.
- `next@14.2.15` awal punya security advisory → di-bump ke `14.2.35`.