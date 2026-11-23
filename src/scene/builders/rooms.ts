import * as THREE from 'three';
import { QUEUE_STEPS } from '../../data/queueSteps';
import { ROOM_FLOOR_TOP } from '../constants';
import { drawText } from '../textures/canvasTextures';
import type { RoomEntry } from '../types';
import { buildFurniture } from './furniture';

type AddBox = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  room: THREE.Group,
  cast?: boolean
) => THREE.Mesh;

/** Plang nama ruangan di dinding belakang. */
function buildRoomSign(text: string, accent: string, room: THREE.Group): void {
  const { texture } = drawText({
    text,
    bg: '#ffffff',
    fg: accent,
    border: accent,
    width: 512,
    height: 64,
    font: 'bold 40px system-ui, sans-serif',
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 0.55),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
  );
  sign.position.set(0, 2.15, -5.36);
  room.add(sign);
}

/**
 * Kusen masuk: dua tiang tinggi + header di sisi depan, dipakai semua
 * ruangan supaya bentuk pintunya seragam. Posisi pintu ruang 2 tetap
 * di local x = -3.2.
 */
function buildThresholds(
  index: number,
  accent: string,
  addBox: AddBox,
  room: THREE.Group
): void {
  const mat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55 });
  const postH = 2.3;
  const postW = 0.22; // tebal tiang mengikuti sumbu x
  const frameDepth = 0.4; // tebal kusen mengikuti sumbu z
  const halfWidth = 1.2;
  const yPost = ROOM_FLOOR_TOP + postH / 2;
  // Ruang 2 tetap masuk di local x = -3.2; ruang lainnya di tengah.
  const doorX = index === 1 ? -3.2 : 0;

  addBox(postW, postH, frameDepth, doorX - halfWidth, yPost, 5.45, mat, room);
  addBox(postW, postH, frameDepth, doorX + halfWidth, yPost, 5.45, mat, room);
  addBox(2 * halfWidth + postW, 0.3, frameDepth, doorX, 2.5, 5.45, mat, room, false);
}

/** Bangun keempat ruangan beserta materialnya untuk efek crossfade. */
export function buildRooms(scene: THREE.Scene): RoomEntry[] {
  const roomEntries: RoomEntry[] = [];
  const wallMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 });

  const addBox: AddBox = (
    w,
    h,
    d,
    x,
    y,
    z,
    mat,
    room,
    cast = true
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    room.add(mesh);
    return mesh;
  };

  QUEUE_STEPS.forEach((step, index) => {
    const room = new THREE.Group();
    room.position.set(...step.roomCenter);

    // Semua ruangan tetap di layer 0 (layer default kamera). Visibilitas
    // diatur lewat group.visible di updateRoomVisibility(), bukan layer —
    // kalau mesh ruangan 2–4 dimasukkan layer 1–3, kamera tidak akan
    // merendernya sama sekali saat tahap tersebut aktif.

    // Dinding per ruangan (material terpisah untuk efek dim/redup independen).
    const roomWallMat = wallMat.clone();

    // Lantai ruangan sedikit lebih tinggi dari lantai dasar (anti z-fighting).
    const floorMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
    addBox(
      11.5,
      0.2,
      11.5,
      0,
      ROOM_FLOOR_TOP - 0.1,
      0,
      floorMat,
      room,
      false
    );

    // Dinding belakang (sisi -z) selalu utuh.
    addBox(11.5, 2.6, 0.35, 0, 1.35, -5.55, roomWallMat, room);

    // Dinding kiri utuh di semua ruangan. Pintu ruang 4 sekarang ada di sisi
    // depan (seperti ruang 1–3), jadi celah lama di local z -4…-2 ditutup.
    addBox(0.35, 2.6, 11.5, -5.55, 1.35, 0, roomWallMat, room);

    const accentMat = new THREE.MeshStandardMaterial({
      color: step.accentColor,
      roughness: 0.5,
    });
    addBox(11.5, 0.16, 0.38, 0, 2.55, -5.55, accentMat, room, false);

    buildRoomSign(step.roomSign, step.accentColor, room);
    buildThresholds(index, step.accentColor, addBox, room);

    buildFurniture(index, accentMat, roomWallMat, room);

    // Kumpulkan material khas ruangan (dinding, lantai, aksen, furnitur)
    // untuk efek dim/redup saat ruangan tidak aktif.
    const seen = new Set<THREE.Material>();
    const mats: RoomEntry['mats'] = [];
    room.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) {
        if (m instanceof THREE.MeshStandardMaterial && !seen.has(m)) {
          seen.add(m);
          mats.push({ mat: m, base: m.color.clone(), opacity: m.opacity });
        }
      }
    });
    roomEntries.push({ group: room, baseY: room.position.y, mats, dim: 1 });

    scene.add(room);
  });

  return roomEntries;
}
