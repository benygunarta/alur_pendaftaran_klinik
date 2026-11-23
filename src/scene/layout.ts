import type { StepContent } from '../content/steps';

// Koordinat ruangan 3D (posisi tengah kamera per tahap - sequentially arranged)
// Urutan: kiri ke kanan sepanjang sumbu X
// Ini memudahkan menyembunyikan ruangan tidak aktif dengan memindahkan posisinya
export const ROOM_CENTERS = [
  [-15, 0, 0], // 1. Pendaftaran - kiri
  [-5, 0, 0],  // 2. Skrining & Tunggu
  [5, 0, 0],   // 3. Poliklinik
  [15, 0, 0],  // 4. Farmasi & Kasir - kanan
];

// Waypoint laluan pasien per tahap - disesuaikan dengan layout berurutan sumbu X (z=0)
// Setiap tahap memiliki 3 waypoint untuk membuat lintasan gerak yang mulus
export const WAYPOINTS = [
  // Tahap 1: Loket Pendaftaran - gerak dari kiri ke kanan di z=0
  [
    [-12.5, 0, 0],   // Mulai dari kiri luar
    [-7.2, 0, 0],    // Menuju center kiri kamar
    [-2.0, 0, 0],    // Menuju lebih kanan menuju exit
  ],
  // Tahap 2: Skrining & Ruang Tunggu - melintasi seluruh kanvas sumbu X
  [
    [-2.0, 0, 0],    // Dari center kiri kamar 1
    [5.0, 0, 0],     // Melintai center menuju kanan kamar 2
    [12.0, 0, 0],    // Kanan ekstrem melewati kamar 3
  ],
  // Tahap 3: Poliklinik - gerak dari kiri ke center kanan
  [
    [-8.0, 0, 0],    // Dari kiri luar menuju kamar 3
    [-2.0, 0, 0],    // Menuju center passing through
    [4.0, 0, 0],     // Ke center kanan kamar 3 menuju kamar 4
  ],
  // Tahap 4: Farmasi & Kasir - melanjutkan ke kanan ekstrem
  [
    [6.0, 0, 0],     // Dari center kamar 3 menuju kanan
    [10.0, 0, 0],    // Melintai area farmasi
    [14.0, 0, 0],    // Kanan ekstrem keluar scene
  ],
];

// Transisi antar tahap (jalur crossing antara ruangan)
// Sudah disejajar untuk layout sumbu X dengan z=0
export const TRANSITIONS = [
  // Dari tahap 1 ke 2 (lewati koridor tengah di z=0)
  [
    [-7.2, 0, 0],    // Dari waypoint akhir tahap 1
    [-2.8, 0, 0],    // Center koridor kiri
    [-2.8, 0, 0],    // Center koridor kanan (pause)
    [6.0, 0, 0],     // Ke center kanan
    [5.5, 0, 0],     // Ke waypoint awal tahap 2
  ],
  // Dari tahap 2 ke 3 (crossing penuh dari kanan ke kiri lewat center z=0)
  [
    [11.6, 0, 0],    // Dari ujung kanan tahap 2
    [11.6, 0, 0],    // Tetap di ujung kanan
    [-2.8, 0, 0],    // Melintai center ke kiri
    [-2.8, 0, 0],    // Center kiri
    [-12.2, 0, 0],   // Ke ujung kiri tahap 3
  ],
  // Dari tahap 3 ke 4 (melintai melalui celah pintu ruang 4 di z=0)
  [
    [-6.5, 0, 0],    // Dari ujung kiri tahap 3
    [-2.8, 0, 0],    // Center koridor
    [2.8, 0, 0],     // Center koridor kanan
    [2.8, 0, 0],     // Pause di center kanan
    [3.9, 0, 0],     // Ke slightly kiri dari farmasi
    [5.8, 0, 0],     // Ke waypoint awal tahap 4
  ],
];

// Posisi petugas per tahap - disesuaikan z=0 (dengan posisi ruangan)
// Petugas duduk/berdiri di depan/center setiap kamar
export const STAFF_POSITIONS = [
  [-10.2, 0, 0],      // Tahap 1: Di kiri kamar 1 (registrasi)
  [11.5, 0, 0],       // Tahap 2: Di kanan kamar 2 (skrining & tunggu)
  [-9.5, 0, 0],       // Tahap 3: Di kiri kamar 3 (poliklinik)
  [9, 0, 0],          // Tahap 4: Di kanan kamar 4 (farmasi & kasir)
];

// Parameter animasi
export const ANIMATION = {
  SPEED_ROOM: 1.6,
  SPEED_TRANSITION: 2.4,
  WALK_AMPLITUDE: 0.85,
  STRIDE_SPAN: 3.116, // 2 * 0.62 * sin(0.85)
  ZOOM_TRANSITION: 0.72,
  ZOOM_ROOM_WALK: 0.95,
  ZOOM_IDLE: 1.6,
};