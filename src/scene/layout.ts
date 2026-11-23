// Koordinat & jalur scene 3D — sumber tunggal untuk layout isometrik.
// Sebelumnya data ini diduplikasi di sini dengan koordinat lama (z=0 untuk
// semua ruangan). Versi aktif dipindahkan utuh dari data/queueSteps.ts.

/** Room center per tahap - SEQUENTIAL (dari kiri ke kanan sepanjang sumbu X).
 * Urutan ini memudahkan menyembunyikan ruangan tidak aktif dengan memindahkan posisinya.
 */
export const ROOM_CENTERS: [number, number, number][] = [
  [-15, 0, 0], // 1. Pendaftaran - kiri
  [-5, 0, 0],  // 2. Skrining & Tunggu
  [5, 0, 0],   // 3. Poliklinik
  [15, 0, 0],  // 4. Farmasi & Kasir - kanan
];

/** Waypoints per tahap. */
export const WAYPOINTS: [number, number, number][][] = [
  [
    // Tahap 1: mulai dari depan pintu ruang pendaftaran (gerbang local z ≈ 5.45),
    // masuk ruangan, lalu berhenti tepat di depan mesin antrean/kiosk (local x ≈ 2.8, z ≈ -2.5).
    [-15.0, 0, 6.2],
    [-15.0, 0, 3.2],
    [-12.2, 0, 0.8],
    [-12.2, 0, -1.5],
  ],
  [
    // Tahap 2: masuk lewat pintu depan ruang skrining (local x ≈ -3.2, z ≈ 5.45),
    // lalu berhenti berdiri di depan deretan kursi antrean (kursi pertama local x ≈ -2.5, z ≈ -2.4).
    [-8.2, 0, 4.6],
    [-8.2, 0, 2.2],
    [-7.5, 0, -0.9],
  ],
  [
    // Tahap 3: masuk lewat pintu depan ruang poliklinik (local x ≈ 0, z ≈ 5.45),
    // lalu berhenti berdiri di depan meja konsultasi dokter (local x ≈ -0.5, z ≈ -2.2).
    [5.0, 0, 4.6],
    [4.5, 0, 1.2],
    [4.5, 0, -0.9],
  ],
  [
    // Tahap 4: masuk lewat pintu depan ruang farmasi (local x ≈ 0, z ≈ 5.45),
    // lalu berhenti berdiri menghadap konter penyerahan obat (local x ≈ 0, z ≈ -1.6).
    [15.0, 0, 4.6],
    [15.0, 0, 2.2],
    [15.0, 0, 0.3],
    [15.0, 0, -0.3],
  ],
];

/**
 * Titik koridor di antara dua ruangan, TANPA titik ujung.
 * Titik awal diambil dari waypoint terakhir ruangan asal, titik akhir dari
 * waypoint pertama ruangan tujuan — jadi sambungannya eksak. Arah mundur
 * didefinisikan tersendiri: pintu keluar ruangan tidak sama dengan pintu
 * masuknya, jadi membalik jalur maju akan membuat pasien berjalan ke titik
 * yang salah. Hindari pula titik dobel yang membuat pasien berhenti sejenak.
 */
export const CORRIDOR_JOINTS: { from: number; to: number; points: [number, number, number][] }[] = [
  // 1 → 2: dari kiosk kembali ke pintu ruang 1, menyusur koridor depan, masuk pintu ruang 2.
  {
    from: 0,
    to: 1,
    points: [
      [-12.2, 0, 1.2],
      [-15.0, 0, 4.6],
      [-15.0, 0, 6.4],
      [-11.5, 0, 6.4],
      [-8.2, 0, 6.4],
    ],
  },
  // 2 → 1: dari depan kursi keluar pintu ruang 2, lewat koridor depan, masuk pintu ruang 1.
  {
    from: 1,
    to: 0,
    points: [
      [-8.2, 0, 1.8],
      [-8.2, 0, 6.4],
      [-11.5, 0, 6.4],
      [-15.0, 0, 6.4],
    ],
  },
  // 2 → 3: dari depan kursi keluar pintu ruang 2, menyusur koridor depan, masuk pintu ruang 3.
  {
    from: 1,
    to: 2,
    points: [
      [-8.2, 0, 2.2],
      [-8.2, 0, 6.4],
      [-3.0, 0, 6.4],
      [5.0, 0, 6.4],
    ],
  },
  // 3 → 2: dari depan meja konsultasi keluar pintu ruang 3, lewat koridor depan, masuk pintu ruang 2.
  {
    from: 2,
    to: 1,
    points: [
      [5.0, 0, 2.2],
      [5.0, 0, 6.4],
      [-3.0, 0, 6.4],
      [-8.2, 0, 6.4],
    ],
  },
  // 3 → 4: dari depan meja konsultasi keluar pintu ruang 3, lewat koridor depan,
  // lalu masuk pintu depan ruang 4.
  {
    from: 2,
    to: 3,
    points: [
      [5.0, 0, 2.2],
      [5.0, 0, 6.4],
      [10.0, 0, 6.4],
      [15.0, 0, 6.4],
    ],
  },
  // 4 → 3: dari depan konter keluar pintu depan ruang 4, lewat koridor depan,
  // lalu masuk pintu ruang 3.
  {
    from: 3,
    to: 2,
    points: [
      [15.0, 0, 2.2],
      [15.0, 0, 6.4],
      [10.0, 0, 6.4],
      [5.0, 0, 6.4],
    ],
  },
];

/** Staff position per tahap - disesuaikan z=0 (dengan posisi ruangan).
 * Petugas duduk/berdiri di depan/center setiap kamar
 */
export const STAFF_POSITIONS: [number, number, number][] = [
  [-16.2, 0, -4.2],
  [-2.5, 0, -2.8],
  [4.5, 0, -3.6],
  [15.0, 0, -3.0],
];
