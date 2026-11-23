import * as THREE from 'three';
import { QUEUE_STEPS } from '../../data/queueSteps';
import { FLOOR_TOP } from '../constants';
import { drawBubble, drawQueueDisplay } from '../textures/canvasTextures';
import type { QueueDisplay, RoomEntry } from '../types';

/**
 * Garis panduan lantai di koridor — mengikuti lintasan transisi tiap tahap,
 * warna mengikuti aksen tahap tujuan, lengkap dengan panah arah.
 */
export function buildGuidanceLines(scene: THREE.Scene): void {
  QUEUE_STEPS.forEach((step) => {
    const tr = step.transition;
    if (!tr || tr.length < 2) return;

    const stripMat = new THREE.MeshStandardMaterial({
      color: step.accentColor,
      roughness: 0.6,
    });
    const arrowMat = new THREE.MeshBasicMaterial({ color: step.accentColor });

    for (let i = 0; i < tr.length - 1; i++) {
      const a = new THREE.Vector3(tr[i][0], FLOOR_TOP, tr[i][2]);
      const b = new THREE.Vector3(tr[i + 1][0], FLOOR_TOP, tr[i + 1][2]);
      const len = a.distanceTo(b);
      if (len < 0.05) continue;
      const mid = a.clone().lerp(b, 0.5);
      const angle = Math.atan2(b.x - a.x, b.z - a.z);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.016, len), stripMat);
      strip.position.set(mid.x, FLOOR_TOP + 0.008, mid.z);
      strip.rotation.y = angle;
      strip.receiveShadow = false;
      scene.add(strip);

      // Panah segitiga pipih di tengah segmen.
      const holder = new THREE.Group();
      holder.position.set(mid.x, FLOOR_TOP + 0.015, mid.z);
      holder.rotation.y = angle;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 3), arrowMat);
      cone.rotation.x = Math.PI / 2; // menunjuk +z lokal (arah lintasan)
      cone.scale.set(1, 1, 0.05); // pipihkan ke lantai
      holder.add(cone);
      scene.add(holder);
    }
  });
}

/** Panah pointer mengambang di atas ruangan tahap aktif. */
export function createActiveRoomMarkers(scene: THREE.Scene): {
  wash: THREE.Mesh;
  arrow: THREE.Group;
} {
  // Cincin wash lantai ruangan aktif.
  const wash = new THREE.Mesh(
    new THREE.PlaneGeometry(11.3, 11.3),
    new THREE.MeshBasicMaterial({
      color: '#0284c7',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    })
  );
  wash.rotation.x = -Math.PI / 2;
  wash.renderOrder = 2;
  scene.add(wash);

  // Panah kerucut terbalik yang mengambang & berputar pelan.
  const arrow = new THREE.Group();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.75, 4),
    new THREE.MeshBasicMaterial({ color: '#0284c7', toneMapped: false })
  );
  cone.rotation.x = Math.PI; // memuncak ke bawah
  arrow.add(cone);
  scene.add(arrow);

  return { wash, arrow };
}

/** Papan nomor antrean digital di dinding (Ruang 1 & 2). */
export function createQueueDisplays(roomEntries: RoomEntry[]): QueueDisplay[] {
  const configs: { room: THREE.Group | undefined; x: number; prefix: string; start: number }[] = [
    { room: roomEntries[0]?.group, x: 3.6, prefix: 'A-', start: 41 },
    { room: roomEntries[1]?.group, x: 3.6, prefix: 'B-', start: 16 },
  ];
  const displays: QueueDisplay[] = [];

  configs.forEach((cfg) => {
    if (!cfg.room) return;
    const display: QueueDisplay = {
      canvas: document.createElement('canvas'),
      ctx: null as unknown as CanvasRenderingContext2D,
      texture: null as unknown as THREE.CanvasTexture,
      number: cfg.start,
      prefix: cfg.prefix,
    };
    display.canvas.width = 256;
    display.canvas.height = 128;
    display.ctx = display.canvas.getContext('2d')!;
    display.texture = new THREE.CanvasTexture(display.canvas);
    display.texture.colorSpace = THREE.SRGBColorSpace;
    display.texture.minFilter = THREE.LinearFilter;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.55),
      new THREE.MeshBasicMaterial({ map: display.texture, toneMapped: false })
    );
    mesh.position.set(cfg.x, 1.5, -5.36);
    cfg.room.add(mesh);

    drawQueueDisplay(display);
    displays.push(display);
  });

  return displays;
}

export interface SpeechBubble {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

/** Gelembung bicara pasien, menghadap kamera isometrik. */
export function createSpeechBubble(scene: THREE.Scene): SpeechBubble {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), material);

  // Bidang menghadap kamera isometrik (arah (1, 1, 1)).
  const towardCamera = new THREE.Vector3(1, 1, 1).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), towardCamera);
  mesh.visible = false;
  mesh.renderOrder = 5;
  scene.add(mesh);

  drawBubble(ctx, canvas, texture, '#0284c7', 1);

  return { mesh, canvas, ctx, texture };
}
