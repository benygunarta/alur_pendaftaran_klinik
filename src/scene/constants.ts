/** Puncak lantai dasar — juga tinggi kaki karakter saat berdiri. */
export const FLOOR_TOP = 0.15;
/** Puncak lantai ruangan, 0.01 di atas lantai dasar agar tidak z-fighting. */
export const ROOM_FLOOR_TOP = 0.16;

export const ZOOM_TRANSITION = 0.72;
export const ZOOM_ROOM_WALK = 0.95;
export const ZOOM_IDLE = 1.6;

/** Amplitudo ayunan langkah (rad). */
export const WALK_AMPLITUDE = 0.85;
/** Panjang kaki dari hip ke telapak. */
export const LEG_LENGTH = 0.62;
/** Jarak tanah yang tercakup satu siklus langkah penuh. */
export const STRIDE_SPAN = 2 * LEG_LENGTH * Math.sin(WALK_AMPLITUDE);
/** Kecepatan jalan di dalam ruangan & saat menyeberangi koridor. */
export const SPEED_ROOM = 1.6;
export const SPEED_TRANSITION = 2.4;
/** Kemiringan lengan santai (positif = ke luar untuk lengan kanan). */
export const REST_ARM_Z = 0.06;
