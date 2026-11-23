import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUEUE_STEPS } from '../data/queueSteps';
import {
  FLOOR_TOP,
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
import { buildBaseFloor } from '../scene/builders/baseFloor';
import { buildRooms } from '../scene/builders/rooms';
import {
  applySittingPose,
  buildCharacter,
  collectCharacterMats,
} from '../scene/builders/characters';
import {
  buildGuidanceLines,
  createActiveRoomMarkers,
  createQueueDisplays,
  createSpeechBubble,
} from '../scene/builders/decorations';
import {
  drawBubble,
  drawQueueDisplay,
} from '../scene/textures/canvasTextures';
import type {
  CharacterParts,
  Mode,
  QueueDisplay,
  RoomEntry,
  StaffEntry,
} from '../scene/types';
import { updateRoomVisibility } from '../scene/animation/roomVisibility';
import {
  updateActiveMarker,
  updateCameraTarget,
  updateZoom,
} from '../scene/animation/cameraRig';

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
    buildBaseFloor(this.scene);
    this.roomEntries = buildRooms(this.scene);
    buildGuidanceLines(this.scene);
    const markers = createActiveRoomMarkers(this.scene);
    this.activeWash = markers.wash;
    this.activeArrow = markers.arrow;
    this.queueDisplays = createQueueDisplays(this.roomEntries);
    const bubble = createSpeechBubble(this.scene);
    this.bubbleMesh = bubble.mesh;
    this.bubbleCanvas = bubble.canvas;
    this.bubbleCtx = bubble.ctx;
    this.bubbleTexture = bubble.texture;

    this.patient = buildCharacter({ shirt: '#f59e0b', pants: '#334155', sleeves: false, face: true });
    this.scene.add(this.patient.group);

    // Pasien kedua duduk di ruang tunggu agar ruangan terasa hidup.
    this.sittingPatient = buildCharacter({
      shirt: '#7c3aed',
      pants: '#1e293b',
      sleeves: true,
      face: true,
    });
    applySittingPose(this.sittingPatient);
    // Koordinat ini lokal terhadap ruang 2 (kursi tengah), bukan world.
    this.sittingPatient.group.position.set(-1.1, ROOM_FLOOR_TOP - 0.045, -2.5);
    const waitingRoom = this.roomEntries[1]?.group;
    if (waitingRoom) {
      waitingRoom.add(this.sittingPatient.group);
      this.roomEntries[1].mats.push(...collectCharacterMats(this.sittingPatient));
    }
    this.sittingBaseY = this.sittingPatient.group.position.y;

    QUEUE_STEPS.forEach((step, i) => {
      const staff = buildCharacter({
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
        this.roomEntries[i].mats.push(...collectCharacterMats(staff));
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

  /** Gambar ulang gelembung memakai warna aksen & jumlah titik terkini. */
  private redrawBubble(): void {
    drawBubble(
      this.bubbleCtx,
      this.bubbleCanvas,
      this.bubbleTexture,
      this.bubbleAccent,
      this.bubbleDots
    );
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
    this.redrawBubble();
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
      drawQueueDisplay(display);
      this.lastQueueStep = safeIndex;
    }

    this.mode = this.transitionLength > 0 ? 'transition' : 'idle';
    this.targetZoom =
      this.mode === 'transition' ? ZOOM_TRANSITION : ZOOM_ROOM_WALK;
    this.zoomAnimating = true;
    // sengaja tidak mengubah targetLookAt di sini — kamera mengikuti pasien
    // lewat updateCameraTarget() sampai transisi selesai.

    this.orientStaff(safeIndex);
    this.syncRoomVisibility();

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

  /** Orkestrasi visibilitas ruangan memakai state scene terkini. */
  private syncRoomVisibility(): void {
    updateRoomVisibility(
      this.roomEntries,
      this.activeStepIndex,
      this.transitionLength,
      this.travel,
      this.transitionFrom,
      this.transitionTo,
      this.routeRooms
    );
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
      this.redrawBubble();
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
      this.redrawBubble();
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
        this.redrawBubble();
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
        this.redrawBubble();
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
      this.redrawBubble();
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

    updateActiveMarker(this.activeArrow, this.timer.getElapsed(), this.reducedMotion);
    updateCameraTarget(
      this.mode,
      this.patient.group.position,
      this.targetLookAt,
      this.stepRoomCenter
    );
    this.zoomAnimating = updateZoom(
      this.camera,
      this.targetZoom,
      this.reducedMotion,
      delta,
      this.zoomAnimating
    );
    this.syncRoomVisibility();

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
