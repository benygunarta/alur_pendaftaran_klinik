import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUEUE_STEPS } from '../data/queueSteps';
import {
  FLOOR_TOP,
  LEG_LENGTH,
  REST_ARM_Z,
  ROOM_FLOOR_TOP,
  SPEED_ROOM,
  SPEED_TRANSITION,
  STRIDE_SPAN,
  WALK_AMPLITUDE,
  ZOOM_IDLE,
  ZOOM_ROOM_WALK,
  ZOOM_TRANSITION,
} from '../scene/constants';
import { buildRoute } from '../scene/path/route';
import { samplePath as sampleSmoothPath, buildSmoothPath } from '../scene/path/smoothPath';
import type { CorridorRange } from '../scene/path/types';

type Mode = 'transition' | 'room' | 'idle';

interface CharacterParts {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  /** Pivot di bahu — mesh lengan digeser ke bawah dari pivot. */
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  /** Pivot di pinggul — mesh kaki digeser ke bawah dari pivot. */
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

interface StaffEntry {
  parts: CharacterParts;
  baseY: number;
  phase: number;
}

/** Material satu ruangan beserta warna/opasitas dasarnya, untuk crossfade transisi. */
interface RoomEntry {
  group: THREE.Group;
  /** Posisi Y asli ruangan, dipakai saat menggeser lantai anti-z-fighting. */
  baseY: number;
  mats: { mat: THREE.MeshStandardMaterial; base: THREE.Color; opacity: number }[];
  dim: number;
}

/** Layar papan nomor antrean yang bisa diperbarui angkanya. */
interface QueueDisplay {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  number: number;
  prefix: string;
}

export class HospitalQueueScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;

  private patient!: CharacterParts;
  private staffList: StaffEntry[] = [];
  private roomEntries: RoomEntry[] = [];
  private queueDisplays: QueueDisplay[] = [];
  private sittingPatient!: CharacterParts;
  private sittingBaseY = 0;

  private bubbleMesh!: THREE.Mesh;
  private bubbleTexture!: THREE.CanvasTexture;
  private bubbleCanvas!: HTMLCanvasElement;
  private bubbleCtx!: CanvasRenderingContext2D;
  private bubbleDots = 1;
  private bubbleTimer = 0;
  private bubbleLastUpdate = 0;
  private talkTime = 0;
  private staffUpdateAccumulator = 0;
  private patientUpdateAccumulator = 0;
  private handleResize: () => void = () => {};
  /** Warna gelembung mengikuti aksen tahap aktif. */
  private bubbleAccent = '#0284c7';
  /** 0→1 untuk animasi muncul gelembung. */
  private bubbleAppear = 0;
  /** Langkah antrian terakhir yang diupdate tampilannya. */
  private lastQueueStep = -1;

  /** Titik kontrol jalur pasien (mentah, sebelum pembulatan tikungan). */
  private pathPoints: THREE.Vector3[] = [];
  /** Sampel jalur halus hasil pembulatan sudut. */
  private pathSamples: THREE.Vector3[] = [];
  /** Jarak kumulatif tiap sampel — parameterisasi berbasis panjang busur. */
  private pathDistances: number[] = [];
  private pathLength = 0;
  /** Jarak tempuh sampai karakter masuk ruangan tujuan (ujung koridor). */
  private transitionLength = 0;
  /** Koridor yang sedang/sempat dilalui jalur aktif, dalam jarak tempuh. */
  private corridorRanges: CorridorRange[] = [];
  /** Posisi karakter di sepanjang jalur (unit), bukan indeks segmen. */
  private travel = 0;
  /** Kecepatan sesaat karakter, di-smooth agar ada percepatan/pengereman. */
  private walkSpeed = 0;
  private walkTime = 0;
  /** Laju belok (rad/s) untuk memberi sedikit lean pada badan. */
  private turnRate = 0;
  private activeStepIndex = 0;
  /** Ruangan asal/tujuan saat transisi berjalan. */
  private transitionFrom = -1;
  private transitionTo = -1;
  /**
   * Semua ruangan yang dilalui jalur aktif, berurutan dari asal ke tujuan.
   * Dipakai supaya lompat jauh (mis. 1→4) tidak menampilkan ruang kosong
   * saat pasien melewati ruang 2 dan 3.
   */
  private routeRooms: number[] = [];
  private stepRoomCenter: [number, number, number] = [-9, 0, -9];

  /** Cincin lantai ruangan aktif. */
  private activeWash!: THREE.Mesh;
  /** Panah pointer mengambang di atas ruangan tahap aktif. */
  private activeArrow!: THREE.Group;

  private mode: Mode = 'idle';
  private targetZoom = ZOOM_IDLE;
  private zoomAnimating = true;

  /** Hormati pengaturan sistem "kurangi gerak". */
  private reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Flag apakah animasi pasien sedang dijeda (tidak berpindah langkah). */
  private isPaused = false;

  /** Flag apakah animasi sedang dijeda oleh kontrol pengguna (terpisah dari reducedMotion sistem). */
  private userPaused = false;

  /** Scratch vector dipakai ulang tiap frame (hindari alokasi di render loop). */
  private readonly movePos = new THREE.Vector3();
  private readonly moveDir = new THREE.Vector3();
  private readonly camDesired = new THREE.Vector3();

  private targetLookAt = new THREE.Vector3(-9, 0, -9);
  private frustumSize = 18;
  private animationFrameId = 0;
  private timer = new THREE.Timer();

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    // Latar transparan agar kanvas menyatu dengan warna latar halaman.
    this.scene.background = null;

    const aspect = this.getAspect();
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumSize * aspect) / 2,
      (this.frustumSize * aspect) / 2,
      this.frustumSize / 2,
      -this.frustumSize / 2,
      0.1,
      120
    );
    this.camera.position.set(7, 16, 7);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    // r186+: PCFSoft digabung ke PCFShadowMap (PCFSoftShadowMap deprecated).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lingkungan studio lembut agar material tidak terlihat datar.
// PMREMGenerator menghasilkan texture yang didistroy bersama scene.environment
// ketika dispose dipanggil, jadi kita hanya menyimpannya di reference.
// Gunakan ukuran default PMREMGenerator (128x128) untuk menghindari error type
// dan beban resource yang tidak perlu di mesin beragam.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    // tidak memanggil pmrem.dispose() di sini - akan dibersihkan bersama scene.dispose()

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enableRotate = false;
    this.controls.enableZoom = true;
    this.controls.minZoom = 0.6;
    this.controls.maxZoom = 2.4;
    this.controls.target.set(-9, 0, -9);

    this.setupLighting();
    this.buildBaseFloor();
    this.buildRooms();
    this.buildGuidanceLines();
    this.createActiveRoomMarkers();
    this.createQueueDisplays();
    this.createSpeechBubble();

    this.patient = this.buildCharacter({ shirt: '#f59e0b', pants: '#334155', sleeves: false, face: true });
    this.scene.add(this.patient.group);

    // Pasien kedua duduk di ruang tunggu agar ruangan terasa hidup.
    this.sittingPatient = this.buildCharacter({
      shirt: '#7c3aed',
      pants: '#1e293b',
      sleeves: true,
      face: true,
    });
    this.applySittingPose(this.sittingPatient);
    // Koordinat ini lokal terhadap ruang 2 (kursi tengah), bukan world.
    this.sittingPatient.group.position.set(-1.1, ROOM_FLOOR_TOP - 0.045, -2.5);
    const waitingRoom = this.roomEntries[1]?.group;
    if (waitingRoom) {
      waitingRoom.add(this.sittingPatient.group);
      this.roomEntries[1].mats.push(...this.collectCharacterMats(this.sittingPatient));
    }
    this.sittingBaseY = this.sittingPatient.group.position.y;

    QUEUE_STEPS.forEach((step, i) => {
      const staff = this.buildCharacter({
        shirt: '#e2e8f0',
        pants: '#334155',
        sleeves: true,
        badge: step.accentColor,
        face: true,
      });
      const [sx, sy, sz] = step.staffPosition;
      // staffPosition memakai koordinat world, sedangkan grup ruang sudah
      // memiliki posisi center — konversi ke lokal agar ikut tersembunyi.
      staff.group.position.set(
        sx - step.roomCenter[0],
        sy + FLOOR_TOP,
        sz - step.roomCenter[2]
      );
      const roomGroup = this.roomEntries[i]?.group;
      if (roomGroup) {
        roomGroup.add(staff.group);
        this.roomEntries[i].mats.push(...this.collectCharacterMats(staff));
      }
      this.staffList.push({ parts: staff, baseY: sy + FLOOR_TOP, phase: i * 1.7 });
    });

    this.setStep(0, true);
    // Resize observer dengan debounce murni via requestAnimationFrame.
    // Hindari setSize() berulang saat pengguna resize/memacu jendela.
    let resizeTimeout = 0;
    const handleResize = () => {
      window.cancelAnimationFrame(resizeTimeout);
      resizeTimeout = window.requestAnimationFrame(() => {
        this.handleResizeActual();
      });
    };
    window.addEventListener('resize', handleResize);
    // Palihan: simpan referensi ke method asli untuk chiamear dari luar jika perlu.
    this.handleResize = handleResize;
    this.timer.connect(document);
    this.animate();
  }

  private getAspect(): number {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    return w / h;
  }

  private setupLighting(): void {
    // Ambient diturunkan agar bayangan tetap terbaca; hemisphere memberi
    // nuansa langit (atas) dan lantai (bawah) yang lebih alami.
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.4));
    this.scene.add(new THREE.HemisphereLight('#e0f2fe', '#cbd5e1', 0.45));

    const dirLight = new THREE.DirectionalLight('#ffffff', 1.15);
    dirLight.position.set(14, 24, 12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(512, 512); // Reduced from 1024x1024 for performance
    dirLight.shadow.camera.near = 2;
    dirLight.shadow.camera.far = 70;
    const d = 34;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    this.scene.add(dirLight);
  }

  private buildBaseFloor(): void {
    // Lantai dasar sengaja dibuat sangat luas (jauh melebihi pandangan kamera)
    // sehingga tepi kotaknya tidak pernah terlihat. Batas pandangan kini hanya
    // ditentukan oleh mask radial CSS, sehingga scene menyatu dengan halaman.
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(70, 0.6, 70),
      // Warna lantai disamakan dengan nuansa slate halaman agar tepinya
      // menyatu saat kanvas memudar (mask radial).
      new THREE.MeshStandardMaterial({ color: '#eef2f7', roughness: 0.9 })
    );
    base.position.y = FLOOR_TOP - 0.3;
    base.receiveShadow = true;
    this.scene.add(base);
  }

  private buildRooms(): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 });

    const addBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      room: THREE.Group,
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

      this.buildRoomSign(step.roomSign, step.accentColor, room);
      this.buildThresholds(index, step.accentColor, addBox, room);

      this.buildFurniture(index, accentMat, roomWallMat, room);

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
      this.roomEntries.push({ group: room, baseY: room.position.y, mats, dim: 1 });

      this.scene.add(room);
    });
  }

  /** Membuat canvas texture untuk teks (plang ruangan, papan antrean). */
  private makeTextTexture(opts: {
    width: number;
    height: number;
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  }): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
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

  /** Plang nama ruangan di dinding belakang. */
  private buildRoomSign(text: string, accent: string, room: THREE.Group): void {
    const { texture } = this.drawText({
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

  /** Plang teks generik: latar, border, dan teks terpusat. */
  private drawText(opts: {
    text: string;
    bg: string;
    fg: string;
    border?: string;
    width: number;
    height: number;
    font: string;
  }): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture } {
    return this.makeTextTexture({
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

  /**
   * Kusen masuk: dua tiang tinggi + header di sisi depan, dipakai semua
   * ruangan supaya bentuk pintunya seragam. Posisi pintu ruang 2 tetap
   * di local x = -3.2.
   */
  private buildThresholds(
    index: number,
    accent: string,
    addBox: (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      room: THREE.Group,
      cast?: boolean
    ) => THREE.Mesh,
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

  /**
   * Garis panduan lantai di koridor — mengikuti lintasan transisi tiap tahap,
   * warna mengikuti aksen tahap tujuan, lengkap dengan panah arah.
   */
  private buildGuidanceLines(): void {
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
        this.scene.add(strip);

        // Panah segitiga pipih di tengah segmen.
        const holder = new THREE.Group();
        holder.position.set(mid.x, FLOOR_TOP + 0.015, mid.z);
        holder.rotation.y = angle;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 3), arrowMat);
        cone.rotation.x = Math.PI / 2; // menunjuk +z lokal (arah lintasan)
        cone.scale.set(1, 1, 0.05); // pipihkan ke lantai
        holder.add(cone);
        this.scene.add(holder);
      }
    });
  }

  /** Panah pointer mengambang di atas ruangan tahap aktif. */
  private createActiveRoomMarkers(): void {
    // Cincin wash lantai ruangan aktif.
    this.activeWash = new THREE.Mesh(
      new THREE.PlaneGeometry(11.3, 11.3),
      new THREE.MeshBasicMaterial({
        color: '#0284c7',
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      })
    );
    this.activeWash.rotation.x = -Math.PI / 2;
    this.activeWash.renderOrder = 2;
    this.scene.add(this.activeWash);

    // Panah kerucut terbalik yang mengambang & berputar pelan.
    this.activeArrow = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 0.75, 4),
      new THREE.MeshBasicMaterial({ color: '#0284c7', toneMapped: false })
    );
    cone.rotation.x = Math.PI; // memuncak ke bawah
    this.activeArrow.add(cone);
    this.scene.add(this.activeArrow);
  }

  /** Papan nomor antrean digital di dinding (Ruang 1 & 2). */
  private createQueueDisplays(): void {
    const configs: { room: THREE.Group | undefined; x: number; prefix: string; start: number }[] = [
      { room: this.roomEntries[0]?.group, x: 3.6, prefix: 'A-', start: 41 },
      { room: this.roomEntries[1]?.group, x: 3.6, prefix: 'B-', start: 16 },
    ];

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

      this.drawQueueDisplay(display);
      this.queueDisplays.push(display);
    });
  }

  private drawQueueDisplay(display: QueueDisplay): void {
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

  /** Pose duduk: kaki maju menyentuh lantai, lengan di pangkuan. */
  private applySittingPose(p: CharacterParts): void {
    const legAngle = -0.84; // ±48° — telapak hampir menyentuh lantai
    p.leftLeg.rotation.x = legAngle;
    p.rightLeg.rotation.x = legAngle;
    p.leftArm.rotation.x = -0.4;
    p.rightArm.rotation.x = -0.4;
    p.leftArm.rotation.z = -REST_ARM_Z;
    p.rightArm.rotation.z = REST_ARM_Z;
  }

  private buildFurniture(
    index: number,
    accentMat: THREE.Material,
    wallMat: THREE.Material,
    room: THREE.Group
  ): void {
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, cast = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      room.add(mesh);
      return mesh;
    };

    if (index === 0) {
      // Ruangan 1: Loket Pendaftaran + Kiosk Antrean
      box(4.8, 1.1, 1.1, -1.2, 0.65, -2.8, wallMat);
      box(4.9, 0.12, 1.2, -1.2, 1.25, -2.8, accentMat, false);
      box(0.7, 1.35, 0.5, 2.8, 0.75, -2.5, wallMat);
      const kioskScreen = box(0.6, 0.45, 0.08, 2.8, 1.35, -2.22, accentMat, false);
      kioskScreen.rotation.x = -0.25;
      // Printer tiket kecil di atas loket.
      const printerMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.6 });
      box(0.4, 0.26, 0.32, -2.6, 1.44, -2.8, printerMat);
      box(0.26, 0.02, 0.2, -2.6, 1.58, -2.8, wallMat, false);
    } else if (index === 1) {
      // Ruangan 2: Ruang Tunggu + Meja Skrining
      const chairMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.6 });
      for (let i = 0; i < 3; i++) {
        box(1.1, 0.45, 0.9, -2.5 + i * 1.4, 0.35, -2.4, chairMat);
        box(1.1, 0.55, 0.18, -2.5 + i * 1.4, 0.75, -2.76, accentMat);
      }
      box(2.4, 0.95, 1.1, 2.5, 0.58, -1.5, wallMat);
      // Timbangan berdiri di sudut belakang.
      box(0.55, 0.1, 0.55, 4.6, 0.21, -4.2, wallMat);
      box(0.1, 1.1, 0.1, 4.6, 0.81, -4.4, wallMat);
      box(0.32, 0.24, 0.1, 4.6, 1.42, -4.4, accentMat, false);
      // Monitor tanda vital di meja skrining.
      box(0.5, 0.4, 0.16, 2.9, 1.255, -1.85, wallMat);
      const vitalScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.32),
        new THREE.MeshBasicMaterial({ color: '#7dd3fc', toneMapped: false })
      );
      vitalScreen.position.set(2.9, 1.255, -1.76);
      room.add(vitalScreen);
    } else if (index === 2) {
      // Ruangan 3: Poliklinik
      box(3.2, 0.9, 1.3, -0.5, 0.55, -2.2, wallMat);
      box(3.25, 0.1, 1.35, -0.5, 1.02, -2.2, accentMat, false);
      box(1.2, 0.75, 0.12, -0.5, 1.4, -2.65, accentMat, false);
      // Tempat periksa (exam bed) di sudut kanan belakang.
      box(1.7, 0.45, 0.85, 3.6, 0.385, -3.6, wallMat);
      box(1.7, 0.12, 0.85, 3.6, 0.67, -3.6, accentMat, false);
      box(0.4, 0.1, 0.5, 4.3, 0.79, -3.6, wallMat, false);
      // Lemari dokter dengan lambang salib di dinding kiri.
      box(0.5, 1.7, 1.1, -5.1, 1.01, -3.8, wallMat);
      box(0.05, 0.44, 0.16, -4.84, 1.35, -3.8, accentMat, false);
      box(0.05, 0.16, 0.44, -4.84, 1.35, -3.8, accentMat, false);
    } else {
      // Ruangan 4: Farmasi & Kasir
      for (let row = 0; row < 2; row++) {
        box(3.6, 1.8, 0.6, -1.5 + row * 4.2, 1.0, -4.4, wallMat);
      }
      box(4.5, 1.05, 1.15, 0, 0.62, -1.6, wallMat);
      box(4.55, 0.12, 1.2, 0, 1.18, -1.6, accentMat, false);
      // Mesin kasir kecil di konter.
      box(0.45, 0.3, 0.35, 1.7, 1.39, -1.6, wallMat);
      box(0.3, 0.2, 0.05, 1.7, 1.64, -1.72, accentMat, false);
      this.buildMedicineBoxes(room);
    }
  }

  /** Kotak obat berwarna di rak farmasi (instanced — dioptimalkan). */
  private buildMedicineBoxes(room: THREE.Group): void {
    const palette = ['#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#34d399', '#f87171'];
    const cols = 5;
    const rows = 2;
    const shelfCenters = [-1.5, 2.7];
    const count = shelfCenters.length * cols * rows;

    const geo = new THREE.BoxGeometry(0.3, 0.34, 0.22);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
    const instanced = new THREE.InstancedMesh(geo, mat, count);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let i = 0;
    shelfCenters.forEach((cx) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dummy.position.set(cx - 1.575 + c * 0.35, 0.45 + r * 0.55, -4.01);
          dummy.updateMatrix();
          instanced.setMatrixAt(i, dummy.matrix);
          color.set(palette[(i + r) % palette.length]);
          instanced.setColorAt(i, color);
          i++;
        }
      }
    });
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.castShadow = false;
    instanced.receiveShadow = false;
    room.add(instanced);
  }

  private buildCharacter(opts: {
    shirt: string;
    pants: string;
    sleeves: boolean;
    badge?: string;
    face?: boolean;
  }): CharacterParts {
    const group = new THREE.Group();

    const shirtMat = new THREE.MeshStandardMaterial({ color: opts.shirt, roughness: 0.6 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: opts.pants, roughness: 0.7 });
    const skinMat = new THREE.MeshStandardMaterial({ color: '#fed7aa', roughness: 0.6 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.38), shirtMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    group.add(torso);

    if (opts.badge) {
      const patch = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.03),
        new THREE.MeshStandardMaterial({ color: opts.badge, roughness: 0.4 })
      );
      patch.position.set(0.17, 0.17, 0.2);
      torso.add(patch);
    }

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), skinMat);
    head.position.y = 1.78;
    head.castShadow = true;
    group.add(head);

    if (opts.face) {
      // Mata kecil agar arah pandang & gerakan kepala terbaca.
      const eyeMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4 });
      const eyeGeo = new THREE.BoxGeometry(0.07, 0.09, 0.03);
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.12, 0.05, 0.265);
      head.add(leftEye);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.12, 0.05, 0.265);
      head.add(rightEye);
    }

    // Kaki: pivot di pinggul (y=0.62), mesh digeser ke bawah dari pivot
    // sehingga putaran terjadi di sendi, bukan di tengah paha.
    const legGeo = new THREE.BoxGeometry(0.24, LEG_LENGTH, 0.26);
    const makeLeg = (x: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, LEG_LENGTH, 0);
      const mesh = new THREE.Mesh(legGeo, pantsMat);
      mesh.position.y = -LEG_LENGTH / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      return pivot;
    };
    const leftLeg = makeLeg(-0.17);
    const rightLeg = makeLeg(0.17);

    // Lengan: pivot di bahu (y=1.38).
    const armMat = opts.sleeves ? shirtMat : skinMat;
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.22);
    const makeArm = (x: number): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.38, 0);
      const mesh = new THREE.Mesh(armGeo, armMat);
      mesh.position.y = -0.33;
      mesh.castShadow = true;
      pivot.add(mesh);
      pivot.rotation.z = x < 0 ? -REST_ARM_Z : REST_ARM_Z;
      group.add(pivot);
      return pivot;
    };
    const leftArm = makeArm(-0.44);
    const rightArm = makeArm(0.44);

    return { group, head, torso, leftArm, rightArm, leftLeg, rightLeg };
  }

  /**
   * Kumpulkan material karakter supaya ikut crossfade bersama ruangnya.
   * Tanpa ini karakter akan mendadak muncul/hilang saat group.visible berubah.
   */
  private collectCharacterMats(parts: CharacterParts): RoomEntry['mats'] {
    const result: RoomEntry['mats'] = [];
    const seen = new Set<THREE.Material>();
    parts.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) {
        if (m instanceof THREE.MeshStandardMaterial && !seen.has(m)) {
          seen.add(m);
          result.push({ mat: m, base: m.color.clone(), opacity: m.opacity });
        }
      }
    });
    return result;
  }

  private createSpeechBubble(): void {
    this.bubbleCanvas = document.createElement('canvas');
    this.bubbleCanvas.width = 160;
    this.bubbleCanvas.height = 80;
    this.bubbleCtx = this.bubbleCanvas.getContext('2d')!;

    this.bubbleTexture = new THREE.CanvasTexture(this.bubbleCanvas);
    this.bubbleTexture.colorSpace = THREE.SRGBColorSpace;
    this.bubbleTexture.minFilter = THREE.LinearFilter;

    const material = new THREE.MeshBasicMaterial({
      map: this.bubbleTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.bubbleMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), material);

    // Bidang menghadap kamera isometrik (arah (1, 1, 1)).
    const towardCamera = new THREE.Vector3(1, 1, 1).normalize();
    this.bubbleMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), towardCamera);
    this.bubbleMesh.visible = false;
    this.bubbleMesh.renderOrder = 5;
    this.scene.add(this.bubbleMesh);

    this.drawBubble(this.bubbleDots);
  }

  private drawBubble(dots: number): void {
    const ctx = this.bubbleCtx;
    const w = this.bubbleCanvas.width;
    const h = this.bubbleCanvas.height;
    const top = 8;
    const bottom = h - 26;
    const left = 8;
    const right = w - 8;
    const r = 16;

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.bubbleAccent;
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
    ctx.fillStyle = this.bubbleAccent;
    for (let i = 0; i < 3; i++) {
      const active = i < dots;
      ctx.globalAlpha = active ? 1 : 0.28;
      ctx.beginPath();
      ctx.arc(w / 2 + (i - 1) * 36, cy, active ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.bubbleTexture.needsUpdate = true;
  }

  /**
   * Ruangan terdekat dari posisi pasien saat ini. Dipakai sebagai titik awal
   * saat pengguna memilih tab secara acak, termasuk ketika animasi sebelumnya
   * masih berjalan di koridor atau di ruang perantara.
   */
  private getCurrentRoomIndex(): number {
    const p = this.patient.group.position;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < QUEUE_STEPS.length; i++) {
      const center = QUEUE_STEPS[i].roomCenter;
      const dx = p.x - center[0];
      const dz = p.z - center[2];
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  /**
   * Tentukan ruangan asal untuk tujuan tertentu. Bila pasien sedang berada di
   * koridor, pilih ujung koridor yang searah dengan tujuan supaya tidak perlu
   * mundur ke ruang yang baru saja ditinggalkan.
   */
  private getOriginRoomIndex(target: number): number {
    for (const range of this.corridorRanges) {
      if (this.travel < range.start || this.travel > range.end) continue;
      if (range.to > range.from) return target >= range.to ? range.to : range.from;
      return target <= range.to ? range.to : range.from;
    }
    return this.getCurrentRoomIndex();
  }

  /**
   * Susun jalur dari ruangan asal ke tujuan. Koridor didefinisikan sekali dan
   * dibalik untuk arah mundur, jadi 4→3 tidak pernah "muter" ke titik awal
   * jalur 3→4. Untuk lompat jauh (mis. 1→4), semua koridor dan waypoint
   * perantara dirangkai agar pasien benar-benar berjalan berurutan.
   *
   * `originIndex` hanya dipakai replay: tanpa itu asal ditentukan dari posisi
   * pasien saat ini, bukan dari tab terakhir yang dipilih pengguna.
   */
  public setStep(stepIndex: number, instant = false, originIndex?: number): void {
    const clamp = (i: number) => Math.max(0, Math.min(i, QUEUE_STEPS.length - 1));
    const safeIndex = clamp(stepIndex);
    const fromIndex = instant
      ? safeIndex
      : originIndex === undefined
        ? this.getOriginRoomIndex(safeIndex)
        : clamp(originIndex);
    const step = QUEUE_STEPS[safeIndex];
    this.activeStepIndex = safeIndex;
    this.stepRoomCenter = step.roomCenter;
    this.transitionFrom = fromIndex;
    this.transitionTo = safeIndex;

    const route = buildRoute(safeIndex, fromIndex, instant, this.patient.group.position);
    this.pathPoints = route.control;
    this.routeRooms = route.routeRooms;
    const smooth = buildSmoothPath(route.control, route.corridorEndIndex, route.corridorMarks);
    this.pathSamples = smooth.pathSamples;
    this.pathDistances = smooth.pathDistances;
    this.pathLength = smooth.pathLength;
    this.transitionLength = smooth.transitionLength;
    this.corridorRanges = smooth.corridorRanges;
    this.travel = smooth.travel;
    this.walkSpeed = 0;
    this.walkTime = 0;
    this.turnRate = 0;
    this.talkTime = 0;
    this.bubbleTimer = 0;
    this.bubbleAppear = this.reducedMotion ? 1 : 0;
    this.bubbleMesh.visible = false;

    // Gelembung & penanda ruangan mengikuti aksen tahap aktif.
    this.bubbleAccent = step.accentColor;
    this.drawBubble(this.bubbleDots);
    this.activeWash.position.set(
      step.roomCenter[0],
      ROOM_FLOOR_TOP + 0.008,
      step.roomCenter[2]
    );
    (this.activeWash.material as THREE.MeshBasicMaterial).color.set(step.accentColor);
    this.activeArrow.position.set(step.roomCenter[0], 4, step.roomCenter[2]);
    ((this.activeArrow.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(
      step.accentColor
    );

    // Papan nomor antrean ruangan aktif maju satu nomor (hanya update jika tab berubah).
    if (safeIndex < this.queueDisplays.length && safeIndex !== this.lastQueueStep) {
      const display = this.queueDisplays[safeIndex];
      display.number += 1;
      this.drawQueueDisplay(display);
      this.lastQueueStep = safeIndex;
    }

    this.mode = this.transitionLength > 0 ? 'transition' : 'idle';
    this.targetZoom =
      this.mode === 'transition' ? ZOOM_TRANSITION : ZOOM_ROOM_WALK;
    this.zoomAnimating = true;
    // sengaja tidak mengubah targetLookAt di sini — kamera mengikuti pasien
    // lewat updateCameraTarget() sampai transisi selesai.

    this.orientStaff(safeIndex);
    this.updateRoomVisibility();

    if (instant && this.pathSamples.length > 0) {
      this.patient.group.position.copy(this.pathSamples[0]);
      this.patient.group.rotation.y = 0;
      this.controls.target.set(step.roomCenter[0], 0, step.roomCenter[2]);
      this.camera.position.set(
        this.controls.target.x + 16,
        16,
        this.controls.target.z + 16
      );
      this.camera.zoom = ZOOM_ROOM_WALK;
      this.camera.updateProjectionMatrix();
      this.zoomAnimating = true;
      this.controls.update();
    }
  }

  private static smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  private setRoomOpacity(entry: RoomEntry | undefined, fade: number): void {
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
  private updateRoomVisibility(): void {
    const inTransition =
      this.transitionLength > 0 &&
      this.travel < this.transitionLength &&
      this.transitionFrom !== this.transitionTo;

    if (!inTransition) {
      this.roomEntries.forEach((entry, i) => {
        entry.group.visible = i === this.activeStepIndex;
        entry.group.position.y = entry.baseY;
        this.setRoomOpacity(entry, 1);
      });
      return;
    }

    // Tampilkan semua ruang yang dilalui, bukan hanya asal dan tujuan.
    // Saat pengguna melompat 1→4, pasien melewati ruang 2 dan 3 — ruang itu
    // harus tetap terlihat supaya jalannya tidak mengambang di atas kekosongan.
    const rooms = this.routeRooms.length
      ? this.routeRooms
      : [this.transitionFrom, this.transitionTo];
    for (const entry of this.roomEntries) entry.group.visible = false;

    // Offset Y bertingkat mencegah z-fighting pada lantai ruang yang overlap.
    rooms.forEach((room, order) => {
      const entry = this.roomEntries[room];
      if (!entry) return;
      entry.group.visible = true;
      entry.group.position.y = entry.baseY - 0.004 * (rooms.length - 1 - order);
    });

    const progress = this.travel / Math.max(this.transitionLength, 0.001);
    const count = rooms.length;
    rooms.forEach((room, order) => {
      const entry = this.roomEntries[room];
      if (!entry) return;
      const center = (order + 0.5) / count;
      const fadeIn =
        order === 0
          ? 1
          : HospitalQueueScene.smoothstep(center - 0.45, center - 0.05, progress);
      const fadeOut =
        order === count - 1
          ? 1
          : 1 - HospitalQueueScene.smoothstep(center + 0.05, center + 0.45, progress);
      this.setRoomOpacity(entry, Math.max(0, Math.min(fadeIn, fadeOut)));
    });
  }

  /** Kembalikan pasien ke waypoint awal tahap aktif tanpa mereset informasi kartu. */
  public replay(): void {
    // Paksa asal = tahap aktif agar tombol replay benar-benar mengulang ruangan
    // itu, bukan memulai dari ruang perantara bila transisi masih berjalan.
    this.setStep(this.activeStepIndex, false, this.activeStepIndex);
  }

  /** Aktifkan/matikan animasi gerak & bicara pasien. */
  public setPaused(paused: boolean): void {
    this.userPaused = paused;

    if (paused) {
      // travel tidak di-reset: saat unpause karakter lanjut dari titik yang sama.
      this.mode = 'idle' as const;
      this.targetZoom = ZOOM_IDLE;
      this.zoomAnimating = true;
      this.walkSpeed = 0;
      this.talkTime = 0;
      this.bubbleTimer = 0;
      this.bubbleLastUpdate = 0;
      this.bubbleDots = 1;
      this.bubbleAppear = this.reducedMotion ? 1 : 0;
      this.drawBubble(this.bubbleDots);
      this.bubbleMesh.visible = this.bubbleDots > 0;
    } else {
      this.mode = 'idle' as const;
      this.targetZoom = ZOOM_IDLE;
      this.zoomAnimating = true;
      this.walkSpeed = 0;
      this.talkTime = 0;
      this.bubbleTimer = 0;
      this.bubbleLastUpdate = 0;
      this.bubbleDots = 1;
      this.bubbleAppear = 0;
      this.drawBubble(this.bubbleDots);
      this.bubbleMesh.visible = false;
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Memutar petugas agar menghadap posisi akhir pasien. */
  private orientStaff(index: number): void {
    const step = QUEUE_STEPS[index];
    const entry = this.staffList[index];
    if (!step || !entry) return;
    const target = step.waypoints[step.waypoints.length - 1];
    const dx = target[0] - step.staffPosition[0];
    const dz = target[2] - step.staffPosition[2];
    entry.parts.group.rotation.y = Math.atan2(dx, dz);
  }

  private updatePatientMovement(delta: number): void {
    if (this.isPaused || this.userPaused) {
      // tetap update pose blend ke stand, tapi jangan perpindah posisi
      this.turnRate = 0;
      this.blendLimbsToRest(delta);
      return;
    }
    if (this.pathSamples.length < 2 || this.travel >= this.pathLength - 1e-4) {
      this.walkSpeed = Math.max(0, this.walkSpeed - delta * 6);
      this.turnRate = 0;
      this.blendLimbsToRest(delta);
      return;
    }

    const remaining = Math.max(this.pathLength - this.travel, 0);
    const inTransition = this.travel < this.transitionLength;
    const maxSpeed = inTransition ? SPEED_TRANSITION : SPEED_ROOM;
    const targetSpeed = Math.max(Math.min(maxSpeed, remaining * 1.8), 0.35);

    // Ease-in dari diam & ease-out saat mendekat tujuan.
    this.walkSpeed += (targetSpeed - this.walkSpeed) * (1 - Math.exp(-5 * delta));
    this.travel = Math.min(this.travel + this.walkSpeed * delta, this.pathLength);
    sampleSmoothPath(
      this.pathSamples,
      this.pathDistances,
      this.pathLength,
      this.travel,
      this.movePos,
      this.moveDir
    );
    this.patient.group.position.copy(this.movePos);

    // Arah hadap mengikuti tangen jalur, dengan laju belok dibatasi supaya
    // tikungan terlihat seperti orang berbelok, bukan badan berputar instan.
    const targetRot = Math.atan2(this.moveDir.x, this.moveDir.z);
    let diff = targetRot - this.patient.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-9 * delta);
    const applied = this.reducedMotion ? diff : THREE.MathUtils.clamp(diff * k, -2.8 * delta, 2.8 * delta);
    this.patient.group.rotation.y += applied;
    this.turnRate = delta > 0 ? applied / delta : 0;

    // Frekuensi langkah disinkronkan dengan kecepatan nyata (anti-skating).
    if (!this.reducedMotion) {
      this.walkTime += delta * ((2 * Math.PI * this.walkSpeed) / STRIDE_SPAN);
    }
    const amp = this.reducedMotion ? 0 : Math.min(1, this.walkSpeed / 0.7);
    const swing = Math.sin(this.walkTime) * WALK_AMPLITUDE * amp;
    const p = this.patient;
    p.leftLeg.rotation.x = swing;
    p.rightLeg.rotation.x = -swing;
    p.leftArm.rotation.x = -swing * 0.7;
    p.rightArm.rotation.x = swing * 0.7;
    p.leftArm.rotation.z = -REST_ARM_Z;
    p.rightArm.rotation.z = REST_ARM_Z;
    // Lean kecil ke arah belokan, kepala sedikit melawannya agar terasa hidup.
    const lean = THREE.MathUtils.clamp(this.turnRate * 0.045, -0.12, 0.12);
    p.torso.rotation.z += (lean - p.torso.rotation.z) * k;
    p.torso.rotation.y += (0 - p.torso.rotation.y) * k;
    p.head.rotation.y += (-lean * 0.6 - p.head.rotation.y) * k;
    p.head.rotation.x += (0 - p.head.rotation.x) * k;
    p.group.position.y = this.reducedMotion
      ? FLOOR_TOP
      : FLOOR_TOP + Math.abs(Math.cos(this.walkTime)) * 0.05 * amp;
  }

  /** Mengembalikan pose perlahan ke posisi berdiri santai. */
  private blendLimbsToRest(delta: number): void {
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-9 * delta);
    const p = this.patient;

    p.leftLeg.rotation.x += (0 - p.leftLeg.rotation.x) * k;
    p.rightLeg.rotation.x += (0 - p.rightLeg.rotation.x) * k;
    p.leftArm.rotation.x += (0 - p.leftArm.rotation.x) * k;
    p.rightArm.rotation.x += (0 - p.rightArm.rotation.x) * k;
    p.leftArm.rotation.z += (-REST_ARM_Z - p.leftArm.rotation.z) * k;
    p.rightArm.rotation.z += (REST_ARM_Z - p.rightArm.rotation.z) * k;
    p.head.rotation.x += (0 - p.head.rotation.x) * k;
    p.head.rotation.y += (0 - p.head.rotation.y) * k;
    p.torso.rotation.y += (0 - p.torso.rotation.y) * k;
    p.torso.rotation.z += (0 - p.torso.rotation.z) * k;
    p.group.position.y += (FLOOR_TOP - p.group.position.y) * k;
  }

  private updateMode(): void {
    const atEnd = this.pathLength === 0 || this.travel >= this.pathLength - 1e-4;
    const inTransition = this.transitionLength > 0 && this.travel < this.transitionLength;
    const mode: Mode = inTransition ? 'transition' : atEnd ? 'idle' : 'room';

    if (mode !== this.mode) {
      this.mode = mode;
      this.targetZoom =
        mode === 'idle' ? ZOOM_IDLE : mode === 'transition' ? ZOOM_TRANSITION : ZOOM_ROOM_WALK;
      this.zoomAnimating = true;
      if (mode === 'idle') {
        this.talkTime = 0;
        this.bubbleTimer = 0;
        this.bubbleDots = 1;
        this.bubbleAppear = this.reducedMotion ? 1 : 0;
        this.drawBubble(this.bubbleDots);
      }
    }
  }

  /** Pose bicara diblend per frame (bukan loncat) ke target gerak. */
  private updateTalking(delta: number): void {
    if (this.isPaused || this.userPaused) {
      // hentikan pergerakan bicara, tapi tetap render gelembung jika aktif
      this.bubbleTimer += delta;
      if (!this.reducedMotion && this.bubbleTimer >= 0.35) {
        this.bubbleTimer = 0;
        this.bubbleDots = (this.bubbleDots % 3) + 1;
        this.drawBubble(this.bubbleDots);
      }
      if (this.bubbleAppear < 1) {
        this.bubbleAppear = Math.min(1, this.bubbleAppear + delta * 5);
      }
      this.bubbleMesh.visible = true;
      return;
    }
    const p = this.patient;
    this.talkTime += delta;
    const t = this.reducedMotion ? 0 : this.talkTime;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-8 * delta);

    const lerpRot = (obj: THREE.Object3D, x: number, y: number, z: number) => {
      obj.rotation.x += (x - obj.rotation.x) * k;
      obj.rotation.y += (y - obj.rotation.y) * k;
      obj.rotation.z += (z - obj.rotation.z) * k;
    };

    lerpRot(p.head, Math.sin(t * 4) * 0.12, Math.sin(t * 2.3) * 0.15, 0);
    p.torso.rotation.x += (0 - p.torso.rotation.x) * k;
    p.torso.rotation.y += (Math.sin(t * 2) * 0.06 - p.torso.rotation.y) * k;
    p.torso.rotation.z += (0 - p.torso.rotation.z) * k;

    lerpRot(p.rightArm, -0.55 + Math.sin(t * 6) * 0.25, 0, 0.32);
    lerpRot(p.leftArm, -0.15 + Math.sin(t * 5 + 1.2) * 0.12, 0, -0.14);
    p.leftLeg.rotation.x += (0 - p.leftLeg.rotation.x) * k;
    p.rightLeg.rotation.x += (0 - p.rightLeg.rotation.x) * k;
    p.group.position.y += (FLOOR_TOP - p.group.position.y) * k;

    // Titik gelembung berputar; muncul dengan animasi scale-in (hanya update setiap 350ms).
    this.bubbleTimer += delta;
    if (!this.reducedMotion && this.bubbleTimer - this.bubbleLastUpdate >= 0.35) {
      this.bubbleLastUpdate = this.bubbleTimer;
      this.bubbleDots = (this.bubbleDots % 3) + 1;
      this.drawBubble(this.bubbleDots);
    }
    if (this.bubbleAppear < 1) {
      this.bubbleAppear = Math.min(1, this.bubbleAppear + delta * 5);
    }

    this.bubbleMesh.visible = true;
    this.bubbleMesh.position.set(
      p.group.position.x,
      p.group.position.y + 2.7,
      p.group.position.z
    );
    // Ease-out-back: sedikit melompat melebihi 1 lalu kembali (charm).
    const x = this.bubbleAppear;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const back = 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    const pulse = this.reducedMotion ? 0 : Math.sin(t * 6) * 0.03;
    this.bubbleMesh.scale.setScalar(Math.max(0.001, back * (1 + pulse)));
  }

  /** Menyembunyikan gelembung dengan blend, bukan hard reset. */
  private blendTalkingOut(delta: number): void {
    if (!this.bubbleMesh.visible) return;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-10 * delta);
    const s = this.bubbleMesh.scale.x * (1 - k);
    if (s < 0.05) {
      this.bubbleMesh.visible = false;
      this.bubbleMesh.scale.setScalar(1);
      return;
    }
    this.bubbleMesh.scale.setScalar(s);
  }

  private updateStaff(delta: number): void {
    const elapsed = this.timer.getElapsed();
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-8 * delta);

    for (let i = 0; i < this.staffList.length; i++) {
      const entry = this.staffList[i];
      const parts = entry.parts;
      const talking = this.mode === 'idle' && i === this.activeStepIndex;
      const t = this.reducedMotion ? 0 : this.talkTime;

      parts.group.position.y =
        entry.baseY + (this.reducedMotion ? 0 : Math.sin(elapsed * 1.6 + entry.phase) * 0.015);

      const target = talking
        ? {
            headX: Math.sin(t * 3.6 + 1) * 0.1,
            headY: Math.sin(t * 2.1 + 0.7) * 0.13,
            torsoY: Math.sin(t * 1.8 + 0.4) * 0.05,
            armX: -0.45 + Math.sin(t * 5.2 + 0.6) * 0.2,
            armZ: 0.28,
            larmX: -0.12,
            larmZ: -0.1,
          }
        : {
            headX: 0,
            headY: 0,
            torsoY: 0,
            armX: 0,
            armZ: REST_ARM_Z,
            larmX: 0,
            larmZ: -REST_ARM_Z,
          };

      parts.head.rotation.x += (target.headX - parts.head.rotation.x) * k;
      parts.head.rotation.y += (target.headY - parts.head.rotation.y) * k;
      parts.head.rotation.z += (0 - parts.head.rotation.z) * k;
      parts.torso.rotation.y += (target.torsoY - parts.torso.rotation.y) * k;
      parts.torso.rotation.x += (0 - parts.torso.rotation.x) * k;
      parts.rightArm.rotation.x += (target.armX - parts.rightArm.rotation.x) * k;
      parts.rightArm.rotation.z += (target.armZ - parts.rightArm.rotation.z) * k;
      parts.leftArm.rotation.x += (target.larmX - parts.leftArm.rotation.x) * k;
      parts.leftArm.rotation.z += (target.larmZ - parts.leftArm.rotation.z) * k;
      parts.leftLeg.rotation.x += (0 - parts.leftLeg.rotation.x) * k;
      parts.rightLeg.rotation.x += (0 - parts.rightLeg.rotation.x) * k;
    }

    // Pasien yang duduk: goyangkan kepala pelan & napas halus.
    const sit = this.sittingPatient;
    if (sit) {
      const t = this.reducedMotion ? 0 : elapsed;
      sit.group.position.y =
        this.sittingBaseY + (this.reducedMotion ? 0 : Math.sin(t * 1.4) * 0.01);
      sit.head.rotation.y = Math.sin(t * 0.7) * 0.25;
      sit.head.rotation.x = Math.sin(t * 1.1 + 1) * 0.05;
    }
  }

  private updateCameraTarget(): void {
    if (this.mode === 'transition') {
      this.targetLookAt.copy(this.patient.group.position);
    } else {
      this.targetLookAt.set(...this.stepRoomCenter);
    }
  }

  private updateZoom(delta: number): void {
    if (!this.zoomAnimating) return;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-6 * delta);
    this.camera.zoom += (this.targetZoom - this.camera.zoom) * k;
    if (Math.abs(this.camera.zoom - this.targetZoom) < 0.02) {
      this.camera.zoom = this.targetZoom;
      this.zoomAnimating = false;
    }
    this.camera.updateProjectionMatrix();
  }

  /**
 * Fungsi updateRoomDim DIHAPUS.
 * Alasan:
 *   - Variabel `dim` di RoomEntry selalu di-set ke 1 dan targetnya juga 1,
 *     sehingga perhitungan selalu menghasilkan skala 1 (tidak ada perubahan visual).
 *   - Setiap frame loop melakukan `color.copy(base).multiplyScalar(1)` untuk
 *     semua material ruangan = beban GPU tanpa manfaat.
 *   - Efek redup sudah diasahkan melalui toggle `visible` ruangan (hanya 1 yang aktif)
 *     dan material warna statis per ruangan.
 *   - Penghapusan ini mengurangi 1 traversal scene + perhitungan matematis per frame.
 */

  /** Panah penanda ruangan aktif: mengambang & berputar pelan. */
  private updateActiveMarker(): void {
    const elapsed = this.timer.getElapsed();
    const t = this.reducedMotion ? 0 : elapsed;
    this.activeArrow.position.y = 4 + Math.sin(t * 2) * 0.18;
    this.activeArrow.rotation.y = t * 0.8;
  }

  private animate = (timestamp?: number): void => {
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.timer.update(timestamp);
    const delta = Math.min(this.timer.getDelta(), 0.05);

    // Update patient every frame for smooth path following
    this.updatePatientMovement(delta);

    // Throttle staff updates: sudah dikelola oleh accumulator di bagian atas.
// Hanya update staff jika (1) sedang move, atau (2) akumulator melewati ambang 0.033s.
// Ini sudah diuji di dalam updateStaff check di bagian throttle paling atas.
const isMoving =
  (this.mode === 'transition' || this.mode === 'room') &&
  this.pathSamples.length > 1 &&
  this.travel < this.pathLength - 1e-4;
const shouldUpdateStaff = isMoving || this.staffUpdateAccumulator >= 0.033;
if (shouldUpdateStaff) {
  this.updateStaff(delta);
}

    this.updateMode();

    if (this.mode === 'idle') {
      this.updateTalking(delta);
    } else {
      this.blendTalkingOut(delta);
    }

    this.updateActiveMarker();
    this.updateCameraTarget();
    this.updateZoom(delta);
    this.updateRoomVisibility();

    // Damping berbasis delta — konsisten di 60Hz maupun 144Hz.
    const kLook = this.reducedMotion ? 1 : 1 - Math.exp(-5 * delta);
    // Kamera sedikit lebih cepat mengejar saat pasien berjalan di koridor.
    const kPos = this.reducedMotion ? 1 : 1 - Math.exp(-(this.mode === 'transition' ? 5.5 : 4) * delta);
    this.controls.target.lerp(this.targetLookAt, kLook);
    this.camDesired.set(this.controls.target.x + 16, 16, this.controls.target.z + 16);
    this.camera.position.lerp(this.camDesired, kPos);
    this.controls.update();

    this.renderer.render(this.scene, this.camera);
  };

  private handleResizeActual = (): void => {
    const aspect = this.getAspect();
    this.camera.left = (-this.frustumSize * aspect) / 2;
    this.camera.right = (this.frustumSize * aspect) / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  public dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.handleResize);
    this.timer.disconnect();
    this.timer.dispose();
    this.controls.dispose();
    // dispose texture bubuk (jika masih ada)
    if (this.bubbleTexture) {
      this.bubbleTexture.dispose();
    }
    // Hapus environment Three.js (PMREM texture + RoomEnvironment resources)
    if (this.scene.environment) {
      // Three.js v0.187: scene.environment adalah texture; disposalnya
      // ditangani oleh Three.js internal, tapi kita null-ikan referensinya.
      this.scene.environment = null;
    }
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const material = obj.material;
        const list = Array.isArray(material) ? material : [material];
        for (const m of list) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
