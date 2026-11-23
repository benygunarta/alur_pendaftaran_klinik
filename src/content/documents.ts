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