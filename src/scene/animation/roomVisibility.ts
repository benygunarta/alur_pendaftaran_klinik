import type { RoomEntry } from '../types';

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function setRoomOpacity(entry: RoomEntry | undefined, fade: number): void {
  if (!entry) return;
  const value = Math.max(0, Math.min(1, fade));
  const transparent = value < 0.999;
  for (const item of entry.mats) {
    if (item.mat.transparent !== transparent) {
      item.mat.transparent = transparent;
      item.mat.needsUpdate = true;
    }
    item.mat.opacity = item.opacity * value;
  }
}

/**
 * Selama transisi, semua ruangan yang dilalui jalur tampil bersamaan supaya
 * pergantian tidak terasa "kedip" dan pasien tidak berjalan di atas ruang
 * kosong. Tiap ruangan diberi offset Y kecil agar lantai yang tumpang tindih
 * tidak z-fighting, lalu kabur bergantian mengikuti progres perjalanan.
 * Setelah pasien masuk ruangan tujuan, hanya ruangan itu yang tersisa.
 */
export function updateRoomVisibility(
  roomEntries: RoomEntry[],
  activeStepIndex: number,
  transitionLength: number,
  travel: number,
  transitionFrom: number,
  transitionTo: number,
  routeRooms: number[]
): void {
  const inTransition =
    transitionLength > 0 && travel < transitionLength && transitionFrom !== transitionTo;

  if (!inTransition) {
    roomEntries.forEach((entry, i) => {
      entry.group.visible = i === activeStepIndex;
      entry.group.position.y = entry.baseY;
      setRoomOpacity(entry, 1);
    });
    return;
  }

  // Tampilkan semua ruang yang dilalui, bukan hanya asal dan tujuan.
  // Saat pengguna melompat 1→4, pasien melewati ruang 2 dan 3 — ruang itu
  // harus tetap terlihat supaya jalannya tidak mengambang di atas kekosongan.
  const rooms = routeRooms.length ? routeRooms : [transitionFrom, transitionTo];
  for (const entry of roomEntries) entry.group.visible = false;

  // Offset Y bertingkat mencegah z-fighting pada lantai ruang yang overlap.
  rooms.forEach((room, order) => {
    const entry = roomEntries[room];
    if (!entry) return;
    entry.group.visible = true;
    entry.group.position.y = entry.baseY - 0.004 * (rooms.length - 1 - order);
  });

  const progress = travel / Math.max(transitionLength, 0.001);
  const count = rooms.length;
  rooms.forEach((room, order) => {
    const entry = roomEntries[room];
    if (!entry) return;
    const center = (order + 0.5) / count;
    const fadeIn =
      order === 0 ? 1 : smoothstep(center - 0.45, center - 0.05, progress);
    const fadeOut =
      order === count - 1
        ? 1
        : 1 - smoothstep(center + 0.05, center + 0.45, progress);
    setRoomOpacity(entry, Math.max(0, Math.min(fadeIn, fadeOut)));
  });
}
