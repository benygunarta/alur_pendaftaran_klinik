export interface StepContent {
  id: number;
  title: string;
  shortLabel: string;
  durationHint: string;
  summary: string;
  requirements: string[];
  accentColor: string;
  accentDark: string;
  roomSign: string;
}

export const STEP_CONTENTS: StepContent[] = [
  {
    id: 1,
    title: 'Pendaftaran & Ambil Antrean',
    shortLabel: '1. Pendaftaran',
    durationHint: '± 5–10 menit',
    summary:
      'Pasien melakukan pendaftaran melalui anjungan mandiri atau loket admisi serta mengambil nomor antrean sesuai poliklinik tujuan.',
    requirements: [
      'KTP atau kartu identitas resmi',
      'Kartu BPJS / JKN (jika menggunakan)',
      'Surat rujukan (jika diperlukan)',
    ],
    accentColor: '#0284c7',
    accentDark: '#0369a1',
    roomSign: 'LOKET PENDAFTARAN',
  },
  {
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
  {
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
  {
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
];