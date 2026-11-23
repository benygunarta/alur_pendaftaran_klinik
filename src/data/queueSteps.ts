export interface QueueStep {
  id: number;
  title: string;
  shortLabel: string;
  roomCenter: [number, number, number];
  /** Titik-titik laluan pasien di dalam ruangan. */
  waypoints: [number, number, number][];
  /**
   * Laluan dari waypoint terakhir tahap sebelumnya menuju `waypoints[0]`.
   * Hanya diisi untuk tahap > 1 agar pasien benar-benar berjalan menyeberudi
   * palang tengah (x/z di antara -3.25 dan 3.25) alih-alih teleport.
   */
  transition?: [number, number, number][];
  /** Posisi petugas yang berdiri di balik meja/loket. */
  staffPosition: [number, number, number];
  /** Warna aksen terang untuk objek 3D (trim, garis panduan, panah). */
  accentColor: string;
  /** Varian lebih gelap untuk latar badge/tab UI agar teks putih kontras. */
  accentDark: string;
  /** Teks plang di dinding belakang ruangan. */
  roomSign: string;
  durationHint: string;
  summary: string;
  requirements: string[];
}

/** Data langkah murni (judul, durasi, ringkasan, kebutuhan). */
export const STEP_CONTENTS = {
  1: {
    id: 1,
    title: 'Pendaftaran & Ambil Antrean',
    shortLabel: '1. Pendaftaran',
    durationHint: '± 5–10 menit',
    summary:
      'Pasien melakukan pendaftaran melalui anjungan mandiri atau loket admisi serta mengambil nomor antrean sesuai poliklinik tujuan.',
    requirements: ['KTP atau kartu identitas resmi', 'Kartu BPJS / JKN (jika menggunakan)', 'Surat rujukan (jika diperlukan)'],
    accentColor: '#0284c7',
    accentDark: '#0369a1',
    roomSign: 'LOKET PENDAFTARAN',
  },
  2: {
    id: 2,
    title: 'Skrining & Ruang Tunggu',
    shortLabel: '2. Skrining & Tunggu',
    durationHint: '± 10–20 menit',
    summary:
      'Petugas melakukan skrining awal kondisi pasien dan pasien menunggu giliran panggilan di area tunggu yang telah disediakan.',
    requirements: ['Nomor antrean aktif', 'Perhatikan layar antrean atau panggilan petugas'],
    accentColor: '#0d9488',
    accentDark: '#0f766e',
    roomSign: 'SKRINING & RUANG TUNGGU',
  },
  3: {
    id: 3,
    title: 'Pemeriksaan Poliklinik',
    shortLabel: '3. Poliklinik',
    durationHint: '± 10–25 menit',
    summary:
      'Pasien masuk ke ruang poliklinik untuk sesi konsultasi, pemeriksaan medis, dan penentuan tindakan atau resep bersama dokter.',
    requirements: ['Hasil skrining awal', 'Informasi keluhan serta riwayat obat/alergi'],
    accentColor: '#4f46e5',
    accentDark: '#4338ca',
    roomSign: 'POLIKLINIK',
  },
  4: {
    id: 4,
    title: 'Farmasi & Kasir',
    shortLabel: '4. Farmasi & Kasir',
    durationHint: '± 5–15 menit',
    summary:
      'Pengambilan obat di bagian farmasi serta penyelesaian administrasi atau pembayaran layanan sebelum pasien meninggalkan rumah sakit.',
    requirements: ['Resep obat dari dokter', 'Bukti layanan atau berkas administrasi'],
    accentColor: '#059669',
    accentDark: '#047857',
    roomSign: 'FARMASI & KASIR',
  },
};

/** Mapping ID ke data lengkap. */
const contentMap = new Map(
  Object.values(STEP_CONTENTS).map(c => [c.id, c] as const)
);

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
const CORRIDOR_JOINTS: { from: number; to: number; points: [number, number, number][] }[] = [
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

export interface Corridor {
  /** Index ruangan asal (0-based). */
  from: number;
  /** Index ruangan tujuan (0-based). */
  to: number;
  /** Jalur lengkap: waypoint akhir asal → koridor → waypoint awal tujuan. */
  points: [number, number, number][];
}

/** Semua koridor, maju dan mundur. Arah maju dipakai untuk garis panduan lantai. */
export const CORRIDORS: Corridor[] = CORRIDOR_JOINTS.map(({ from, to, points }) => ({
  from,
  to,
  points: [WAYPOINTS[from][WAYPOINTS[from].length - 1], ...points, WAYPOINTS[to][0]],
}));

/** Ambil koridor untuk perpindahan dari `from` ke `to` (dua arah). */
export function getCorridor(from: number, to: number): [number, number, number][] | null {
  return CORRIDORS.find((c) => c.from === from && c.to === to)?.points ?? null;
}

/** Kompatibel dengan pemanggil lama: transisi maju per tahap. */
export const TRANSITIONS: [number, number, number][][] = CORRIDORS.filter(
  (c) => c.to === c.from + 1
).map((c) => c.points);

/** Staff position per tahap - disesuaikan z=0 (dengan posisi ruangan).
 * Petugas duduk/berdiri di depan/center setiap kamar
 */
export const STAFF_POSITIONS: [number, number, number][] = [
  [-16.2, 0, -4.2],
  [-2.5, 0, -2.8],
  [4.5, 0, -3.6],
  [15.0, 0, -3.0],
];

/** Build QUEUE_STEPS dari content + koordinat. */
export const QUEUE_STEPS: QueueStep[] = ROOM_CENTERS.map((center, i) => {
  const cid = i + 1;
  const content = contentMap.get(cid)!;
  const wp = WAYPOINTS[i];
  const sp = STAFF_POSITIONS[i];
  const tr = i > 0 ? TRANSITIONS[i - 1] : [];
  return {
    id: content.id,
    title: content.title,
    shortLabel: content.shortLabel,
    roomCenter: center,
    waypoints: wp,
    transition: tr,
    staffPosition: sp,
    accentColor: content.accentColor,
    accentDark: content.accentDark,
    roomSign: content.roomSign,
    durationHint: content.durationHint,
    summary: content.summary,
    requirements: content.requirements,
  };
});

/** Data dokumentasi (untuk section FAQ/docs). */
export interface QueueDocument {
  title: string;
  description: string;
}
export const QUEUE_DOCUMENTS: QueueDocument[] = [
  {
    title: 'Kartu Identitas (KTP / Kartu Keluarga)',
    description: 'Wajib untuk verifikasi data pada proses pendaftaran pertama kali.',
  },
  {
    title: 'Kartu BPJS / JKN',
    description: 'Diperlukan bila menggunakan layanan asuransi kesehatan nasional.',
  },
  {
    title: 'Surat Rujukan',
    description: 'Untuk pasien rujukan fasilitas kesehatan tingkat pertama (Puskesmas/klinik).',
  },
  {
    title: 'Kartu / Berkas Rekam Medis',
    description: 'Pasien lama membawa kartu rekam medis agar riwayat dapat langsung dibaca.',
  },
  {
    title: 'Daftar Keluhan & Riwayat Obat',
    description: 'Tuliskan keluhan, durasi, alergi, dan obat yang sedang dikonsumsi.',
  },
  {
    title: 'Bukti Pembayaran / Voucher',
    description: 'Disimpan sampai obat diterima dan seluruh tahap pelayanan selesai.',
  },
];