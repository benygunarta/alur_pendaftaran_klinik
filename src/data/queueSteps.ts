import { STEP_CONTENTS } from '../content/steps';
import { ROOM_CENTERS, WAYPOINTS, CORRIDOR_JOINTS, STAFF_POSITIONS } from '../scene/layout';

// Data konten, dokumen, dan koordinat kini memiliki satu sumber kebenaran.
// Modul ini hanya menyusunnya menjadi API yang dipakai scene & halaman.
export { ROOM_CENTERS, WAYPOINTS, STAFF_POSITIONS } from '../scene/layout';
export { QUEUE_DOCUMENTS } from '../content/documents';
export type { QueueDocument } from '../content/documents';

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

export interface Corridor {
  /** Index ruangan asal (0-based). */
  from: number;
  /** Index ruangan tujuan (0-based). */
  to: number;
  /** Jalur lengkap: waypoint akhir asal → koridor → waypoint awal tujuan. */
  points: [number, number, number][];
}

/** Mapping ID ke data lengkap. */
const contentMap = new Map(
  STEP_CONTENTS.map(c => [c.id, c] as const)
);

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
