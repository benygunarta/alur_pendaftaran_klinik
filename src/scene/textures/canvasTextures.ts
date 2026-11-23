import * as THREE from 'three';
import type { QueueDisplay } from '../types';

interface TextTextureResult {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

/** Membuat canvas texture untuk teks (plang ruangan, papan antrean). */
export function makeTextTexture(opts: {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}): TextTextureResult {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext('2d')!;
  opts.draw(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return { canvas, ctx, texture };
}

/** Plang teks generik: latar, border, dan teks terpusat. */
export function drawText(opts: {
  text: string;
  bg: string;
  fg: string;
  border?: string;
  width: number;
  height: number;
  font: string;
}): TextTextureResult {
  return makeTextTexture({
    width: opts.width,
    height: opts.height,
    draw: (ctx, w, h) => {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, w, h);
      if (opts.border) {
        ctx.strokeStyle = opts.border;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, w - 6, h - 6);
      }
      let size = parseInt(opts.font.match(/(\d+)px/)?.[1] ?? '40', 10);
      ctx.font = opts.font;
      while (ctx.measureText(opts.text).width > w - 28 && size > 14) {
        size -= 2;
        ctx.font = opts.font.replace(/\d+px/, `${size}px`);
      }
      ctx.fillStyle = opts.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.text, w / 2, h / 2 + 1);
    },
  });
}

/** Gambar ulang papan nomor antrean digital. */
export function drawQueueDisplay(display: QueueDisplay): void {
  const { ctx, canvas } = display;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

  const label = `${display.prefix}${String(display.number).padStart(3, '0')}`;
  ctx.font = 'bold 64px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#7dd3fc';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 4);
  ctx.shadowBlur = 0;

  display.texture.needsUpdate = true;
}

/** Gelembung bicara: ekor, badan, dan tiga titik animasi. */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
  accent: string,
  dots: number
): void {
  const w = canvas.width;
  const h = canvas.height;
  const top = 8;
  const bottom = h - 26;
  const left = 8;
  const right = w - 8;
  const r = 16;

  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = accent;
  ctx.fillStyle = '#ffffff';

  // Ekor dulu, agar garis tepi badan menutup sambungannya.
  ctx.beginPath();
  ctx.moveTo(w / 2 - 14, bottom - 4);
  ctx.lineTo(w / 2, h - 6);
  ctx.lineTo(w / 2 + 14, bottom - 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Badan gelembung.
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(right - r, top);
  ctx.quadraticCurveTo(right, top, right, top + r);
  ctx.lineTo(right, bottom - r);
  ctx.quadraticCurveTo(right, bottom, right - r, bottom);
  ctx.lineTo(left + r, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const cy = (top + bottom) / 2;
  ctx.fillStyle = accent;
  for (let i = 0; i < 3; i++) {
    const active = i < dots;
    ctx.globalAlpha = active ? 1 : 0.28;
    ctx.beginPath();
    ctx.arc(w / 2 + (i - 1) * 36, cy, active ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  texture.needsUpdate = true;
}
