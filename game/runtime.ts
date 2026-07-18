import { addItem, BLOCKS, BlockId, consumeSelected, createStarterInventory, ITEM_META } from "./blocks";
import { GameAudio } from "./audio";
import { VoxelRenderer } from "./renderer";
import {
  DEFAULT_SETTINGS,
  deleteWorldSave,
  hasWorldSave,
  loadSettings,
  loadWorldSave,
  saveSettings,
  saveWorld,
} from "./storage";
import type { GameSettings, GameSnapshot, InventorySlot, Vec3, WorldSaveV1 } from "./types";
import { WorldWorkerClient } from "./worker-client";
import {
  CHUNK_SIZE,
  CHUNKS_X,
  CHUNKS_Y,
  CHUNKS_Z,
  WORLD_DEPTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  collides,
  getBlock,
  raycast,
  setBlock,
  worldIndex,
  type RayHit,
} from "./world";

type Player = Vec3 & {
  yaw: number;
  pitch: number;
  velocityY: number;
  grounded: boolean;
  fallStartY: number;
};

const EMPTY_POSITION = { x: WORLD_WIDTH / 2 + 0.5, y: 24, z: WORLD_DEPTH / 2 + 0.5 };

function initialSnapshot(): GameSnapshot {
  return {
    phase: "menu",
    hasSave: false,
    loadingProgress: 0,
    loadingLabel: "正在准备体素引擎",
    backend: "检测中",
    player: { ...EMPTY_POSITION },
    yaw: Math.PI,
    vitals: { health: 20, hunger: 20 },
    inventory: createStarterInventory(),
    selectedSlot: 0,
    targetName: null,
    breakProgress: 0,
    worldTime: 0.35,
    day: 1,
    fps: 60,
    faces: 0,
    mapImage: null,
    saveState: "idle",
    settings: { ...DEFAULT_SETTINGS },
    error: null,
  };
}

export class GameRuntime {
  private readonly canvas: HTMLCanvasElement;
  private readonly worker = new WorldWorkerClient();
  private readonly renderer: VoxelRenderer;
  private audio!: GameAudio;
  private snapshot = initialSnapshot();
  private readonly listeners = new Set<() => void>();
  private readonly inputAbort = new AbortController();
  private data: Uint8Array | null = null;
  private seed: number | null = null;
  private spawn: Vec3 = { ...EMPTY_POSITION };
  private player: Player = { ...EMPTY_POSITION, yaw: Math.PI, pitch: -0.08, velocityY: 0, grounded: false, fallStartY: 24 };
  private inventory: InventorySlot[] = createStarterInventory();
  private vitals = { health: 20, hunger: 20 };
  private selectedSlot = 0;
  private worldTime = 0.35;
  private day = 1;
  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private readonly changes = new Map<number, number>();
  private readonly keys = new Set<string>();
  private currentTarget: RayHit | null = null;
  private mining = false;
  private miningKey = "";
  private breakProgress = 0;
  private animationFrame = 0;
  private lastFrame = performance.now();
  private accumulator = 0;
  private snapshotTimer = 0;
  private fpsTimer = 0;
  private fpsFrames = 0;
  private fps = 60;
  private hungerDamageTimer = 0;
  private regenTimer = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private locked = false;
  private fallbackLook = false;
  private fallbackMouse: { x: number; y: number } | null = null;
  private loadingToken = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const forceWebGL = new URLSearchParams(window.location.search).get("renderer") === "webgl2";
    this.renderer = new VoxelRenderer(canvas, forceWebGL);
  }

  async initialize(): Promise<void> {
    this.settings = await loadSettings();
    this.audio = new GameAudio(this.settings);
    await this.renderer.initialize(this.settings);
    this.snapshot = {
      ...this.snapshot,
      hasSave: await hasWorldSave(),
      backend: this.renderer.backend,
      settings: { ...this.settings },
    };
    this.bindInput();
    this.emit();
    this.lastFrame = performance.now();
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameSnapshot => this.snapshot;

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  async startNewWorld(): Promise<void> {
    await deleteWorldSave();
    const seedArray = new Uint32Array(1);
    crypto.getRandomValues(seedArray);
    await this.loadWorld(seedArray[0] | 0, [], null);
  }

  async continueWorld(): Promise<void> {
    try {
      const save = await loadWorldSave();
      if (!save) {
        await this.startNewWorld();
        return;
      }
      await this.loadWorld(save.seed, save.modifiedBlocks, save);
    } catch (error) {
      this.snapshot = { ...this.snapshot, phase: "error", error: error instanceof Error ? error.message : "存档加载失败" };
      this.emit();
    }
  }

  private async loadWorld(seed: number, changes: Array<[number, number]>, save: WorldSaveV1 | null): Promise<void> {
    const token = ++this.loadingToken;
    this.snapshot = { ...this.snapshot, phase: "loading", loadingProgress: 0.02, loadingLabel: "正在生成地形", error: null };
    this.emit();
    this.renderer.clearWorld();
    this.changes.clear();
    for (const [index, block] of changes) this.changes.set(index, block);
    const generated = await this.worker.generate(seed, changes);
    if (token !== this.loadingToken) return;
    this.data = generated.data;
    this.seed = seed;
    this.spawn = generated.spawn;
    this.player = save
      ? { ...save.player, grounded: false, fallStartY: save.player.y }
      : { ...generated.spawn, yaw: Math.PI, pitch: -0.08, velocityY: 0, grounded: false, fallStartY: generated.spawn.y };
    this.inventory = save ? save.inventory.map((slot) => ({ ...slot })) : createStarterInventory();
    this.vitals = save ? { ...save.vitals } : { health: 20, hunger: 20 };
    this.selectedSlot = save?.selectedSlot ?? 0;
    this.worldTime = save?.worldTime ?? 0.35;
    this.day = save?.day ?? 1;
    const chunkCount = CHUNKS_X * CHUNKS_Y * CHUNKS_Z;
    let completed = 0;
    for (let cy = 0; cy < CHUNKS_Y; cy += 1) {
      for (let cz = 0; cz < CHUNKS_Z; cz += 1) {
        const row = [];
        for (let cx = 0; cx < CHUNKS_X; cx += 1) row.push(this.worker.mesh(cx, cy, cz));
        const meshes = await Promise.all(row);
        if (token !== this.loadingToken) return;
        for (const mesh of meshes) this.renderer.setChunk(mesh);
        completed += meshes.length;
        this.snapshot = {
          ...this.snapshot,
          loadingProgress: 0.08 + (completed / chunkCount) * 0.9,
          loadingLabel: `正在构建区块 ${completed}/${chunkCount}`,
        };
        this.emit();
      }
    }
    this.snapshot = {
      ...this.snapshot,
      phase: "paused",
      hasSave: true,
      loadingProgress: 1,
      loadingLabel: "世界已就绪",
      mapImage: this.createMapImage(),
    };
    this.syncSnapshot();
    this.scheduleSave();
  }

  async resume(): Promise<void> {
    if (!this.data || this.snapshot.phase === "loading" || this.snapshot.phase === "dead") return;
    void this.audio.unlock().catch(() => undefined);
    window.setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && this.snapshot.phase === "paused") this.enableFallbackLook();
    }, 220);
    try {
      const result = this.canvas.requestPointerLock();
      if (result && "catch" in result) void result.catch(() => this.enableFallbackLook());
    } catch {
      this.enableFallbackLook();
    }
  }

  private enableFallbackLook(): void {
    this.fallbackLook = true;
    this.fallbackMouse = null;
    this.locked = true;
    this.snapshot = { ...this.snapshot, phase: "playing" };
    this.emit();
  }

  pause(): void {
    if (this.snapshot.phase !== "playing") return;
    this.locked = false;
    this.fallbackLook = false;
    this.fallbackMouse = null;
    this.keys.clear();
    this.mining = false;
    this.breakProgress = 0;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.snapshot = { ...this.snapshot, phase: "paused" };
    this.syncSnapshot();
    void this.flushSave();
  }

  respawn(): void {
    this.player = { ...this.spawn, yaw: Math.PI, pitch: -0.08, velocityY: 0, grounded: false, fallStartY: this.spawn.y };
    this.vitals = { health: 20, hunger: 20 };
    this.snapshot = { ...this.snapshot, phase: "paused" };
    this.syncSnapshot();
    this.scheduleSave();
  }

  selectSlot(index: number): void {
    if (index < 0 || index >= 9) return;
    this.selectedSlot = index;
    this.audio.play("ui");
    this.syncSnapshot();
  }

  updateSettings(next: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...next };
    this.audio.updateSettings(this.settings);
    this.renderer.setShadows(this.settings.shadows);
    this.snapshot = { ...this.snapshot, settings: { ...this.settings } };
    this.emit();
    void saveSettings(this.settings);
  }

  private bindInput(): void {
    const signal = this.inputAbort.signal;
    document.addEventListener("pointerlockchange", () => {
      const pointerLocked = document.pointerLockElement === this.canvas;
      if (!pointerLocked && this.fallbackLook) return;
      this.locked = pointerLocked;
      if (this.locked && this.snapshot.phase !== "dead") {
        this.fallbackLook = false;
        this.snapshot = { ...this.snapshot, phase: "playing" };
      } else if (this.snapshot.phase === "playing") this.snapshot = { ...this.snapshot, phase: "paused" };
      if (!this.locked) this.keys.clear();
      this.emit();
    }, { signal });
    document.addEventListener("pointerlockerror", () => {
      this.enableFallbackLook();
    }, { signal });
    document.addEventListener("mousemove", (event) => {
      if (!this.locked || this.snapshot.phase !== "playing") return;
      let movementX = event.movementX;
      let movementY = event.movementY;
      if (this.fallbackLook) {
        if (!this.fallbackMouse) {
          this.fallbackMouse = { x: event.clientX, y: event.clientY };
          return;
        }
        movementX = event.clientX - this.fallbackMouse.x;
        movementY = event.clientY - this.fallbackMouse.y;
        this.fallbackMouse = { x: event.clientX, y: event.clientY };
      }
      this.player.yaw += movementX * 0.00225 * this.settings.sensitivity;
      const direction = this.settings.invertY ? 1 : -1;
      this.player.pitch = Math.max(-1.52, Math.min(1.52, this.player.pitch + movementY * 0.00225 * this.settings.sensitivity * direction));
    }, { signal });
    document.addEventListener("keydown", (event) => {
      if (this.snapshot.phase !== "playing") return;
      if (event.code === "Escape" && this.fallbackLook) {
        this.pause();
        return;
      }
      this.keys.add(event.code);
      if (/^Digit[1-9]$/.test(event.code)) this.selectSlot(Number(event.code.slice(5)) - 1);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
    }, { signal });
    document.addEventListener("keyup", (event) => this.keys.delete(event.code), { signal });
    this.canvas.addEventListener("mousedown", (event) => {
      if (this.snapshot.phase !== "playing") return;
      event.preventDefault();
      if (event.button === 0) this.mining = true;
      if (event.button === 2) this.useSelected();
    }, { signal });
    document.addEventListener("mouseup", (event) => {
      if (event.button === 0) {
        this.mining = false;
        this.breakProgress = 0;
      }
    }, { signal });
    this.canvas.addEventListener("wheel", (event) => {
      if (this.snapshot.phase !== "playing") return;
      event.preventDefault();
      this.selectSlot((this.selectedSlot + (event.deltaY > 0 ? 1 : -1) + 9) % 9);
    }, { passive: false, signal });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
    window.addEventListener("blur", () => this.pause(), { signal });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
    }, { signal });
    window.addEventListener("resize", () => this.renderer.resize(), { signal });
  }

  private frame = (now: number): void => {
    const delta = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    this.accumulator += delta;
    this.fpsFrames += 1;
    this.fpsTimer += delta;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }
    while (this.accumulator >= 1 / 60) {
      this.update(1 / 60);
      this.accumulator -= 1 / 60;
    }
    this.snapshotTimer += delta;
    if (this.snapshotTimer >= 0.1) {
      this.snapshotTimer = 0;
      this.syncSnapshot();
    }
    const target = this.currentTarget ? { x: this.currentTarget.x, y: this.currentTarget.y, z: this.currentTarget.z } : null;
    this.renderer.render(this.player, this.player.yaw, this.player.pitch, this.worldTime, target, delta);
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private update(delta: number): void {
    if (this.snapshot.phase !== "playing" || !this.data) return;
    const forwardX = Math.sin(this.player.yaw);
    const forwardZ = -Math.cos(this.player.yaw);
    const rightX = Math.cos(this.player.yaw);
    const rightZ = Math.sin(this.player.yaw);
    let moveX = 0;
    let moveZ = 0;
    if (this.keys.has("KeyW")) { moveX += forwardX; moveZ += forwardZ; }
    if (this.keys.has("KeyS")) { moveX -= forwardX; moveZ -= forwardZ; }
    if (this.keys.has("KeyD")) { moveX += rightX; moveZ += rightZ; }
    if (this.keys.has("KeyA")) { moveX -= rightX; moveZ -= rightZ; }
    const moving = Math.hypot(moveX, moveZ) > 0.01;
    const sprinting = moving && this.vitals.hunger >= 6 && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
    const length = Math.hypot(moveX, moveZ) || 1;
    const speed = sprinting ? 6.1 : 4.35;
    if (moving) {
      this.moveAxis("x", (moveX / length) * speed * delta);
      this.moveAxis("z", (moveZ / length) * speed * delta);
      if (this.player.grounded) this.audio.play("step");
    }
    if (this.keys.has("Space") && this.player.grounded) {
      this.player.velocityY = 7.55;
      this.player.grounded = false;
      this.player.fallStartY = this.player.y;
    }
    if (!this.player.grounded) this.player.fallStartY = Math.max(this.player.fallStartY, this.player.y);
    this.player.velocityY -= 20 * delta;
    const verticalMoved = this.moveAxis("y", this.player.velocityY * delta);
    if (!verticalMoved) {
      if (this.player.velocityY < 0 && !this.player.grounded) {
        const fallDistance = this.player.fallStartY - this.player.y;
        if (fallDistance > 3.2) this.damage(Math.ceil((fallDistance - 3.2) * 1.6));
      }
      if (this.player.velocityY < 0) this.player.grounded = true;
      this.player.velocityY = 0;
      this.player.fallStartY = this.player.y;
    } else if (Math.abs(this.player.velocityY) > 0.05) {
      this.player.grounded = false;
    }

    this.vitals.hunger = Math.max(0, this.vitals.hunger - delta * (sprinting ? 0.035 : moving ? 0.012 : 0.005));
    if (this.vitals.hunger <= 0) {
      this.hungerDamageTimer += delta;
      if (this.hungerDamageTimer >= 4) {
        this.hungerDamageTimer = 0;
        this.damage(1);
      }
    } else this.hungerDamageTimer = 0;
    if (this.vitals.hunger >= 18 && this.vitals.health < 20) {
      this.regenTimer += delta;
      if (this.regenTimer >= 4) {
        this.regenTimer = 0;
        this.vitals.health = Math.min(20, this.vitals.health + 1);
        this.vitals.hunger = Math.max(0, this.vitals.hunger - 0.5);
      }
    } else this.regenTimer = 0;

    this.worldTime += delta / 720;
    if (this.worldTime >= 1) {
      this.worldTime -= 1;
      this.day += 1;
      this.scheduleSave();
    }
    const cp = Math.cos(this.player.pitch);
    this.currentTarget = raycast(
      this.data,
      { x: this.player.x, y: this.player.y + 1.62, z: this.player.z },
      { x: Math.sin(this.player.yaw) * cp, y: Math.sin(this.player.pitch), z: -Math.cos(this.player.yaw) * cp },
    );
    this.updateMining(delta);
  }

  private moveAxis(axis: "x" | "y" | "z", amount: number): boolean {
    if (!this.data || amount === 0) return true;
    const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.045));
    const step = amount / steps;
    for (let index = 0; index < steps; index += 1) {
      const next = { x: this.player.x, y: this.player.y, z: this.player.z };
      next[axis] += step;
      if (collides(this.data, next)) return false;
      this.player[axis] += step;
    }
    return true;
  }

  private updateMining(delta: number): void {
    if (!this.mining || !this.currentTarget || !this.data || this.currentTarget.y <= 0) {
      this.breakProgress = 0;
      this.miningKey = "";
      return;
    }
    const key = `${this.currentTarget.x},${this.currentTarget.y},${this.currentTarget.z}`;
    if (key !== this.miningKey) {
      this.miningKey = key;
      this.breakProgress = 0;
    }
    const definition = BLOCKS[this.currentTarget.block];
    this.breakProgress += delta / Math.max(0.12, definition.hardness);
    if (this.breakProgress >= 1) {
      const hit = this.currentTarget;
      this.breakProgress = 0;
      this.breakBlock(hit);
    }
  }

  private breakBlock(hit: RayHit): void {
    if (!this.data) return;
    const index = worldIndex(hit.x, hit.y, hit.z);
    setBlock(this.data, hit.x, hit.y, hit.z, BlockId.Air);
    this.changes.set(index, BlockId.Air);
    const itemId = BLOCKS[hit.block]?.itemId;
    if (itemId) addItem(this.inventory, itemId);
    if (hit.block === BlockId.Leaves && Math.random() < 0.22) addItem(this.inventory, "apple");
    this.audio.play("break");
    const color = itemId ? Number.parseInt(ITEM_META[itemId].color.slice(1), 16) : 0xffffff;
    this.renderer.spawnParticles({ x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 }, color);
    void this.rebuildAround(hit.x, hit.y, hit.z, [[index, BlockId.Air]]);
    this.snapshot = { ...this.snapshot, mapImage: this.createMapImage() };
    this.scheduleSave();
  }

  private useSelected(): void {
    if (!this.data) return;
    const slot = this.inventory[this.selectedSlot];
    if (!slot?.itemId || slot.count <= 0) return;
    if (slot.itemId === "apple") {
      if (this.vitals.hunger >= 20) return;
      consumeSelected(this.inventory, this.selectedSlot);
      this.vitals.hunger = Math.min(20, this.vitals.hunger + 5);
      this.vitals.health = Math.min(20, this.vitals.health + 1);
      this.audio.play("eat");
      this.scheduleSave();
      return;
    }
    const block = ITEM_META[slot.itemId].blockId;
    const place = this.currentTarget?.previous;
    if (block === null || !place) return;
    const old = getBlock(this.data, place.x, place.y, place.z);
    if (old !== BlockId.Air && old !== BlockId.Water) return;
    setBlock(this.data, place.x, place.y, place.z, block);
    if (collides(this.data, this.player)) {
      setBlock(this.data, place.x, place.y, place.z, old);
      return;
    }
    const index = worldIndex(place.x, place.y, place.z);
    this.changes.set(index, block);
    consumeSelected(this.inventory, this.selectedSlot);
    this.audio.play("place");
    this.renderer.spawnParticles({ x: place.x + 0.5, y: place.y + 0.5, z: place.z + 0.5 }, Number.parseInt(ITEM_META[slot.itemId]?.color.slice(1) ?? "ffffff", 16));
    void this.rebuildAround(place.x, place.y, place.z, [[index, block]]);
    this.snapshot = { ...this.snapshot, mapImage: this.createMapImage() };
    this.scheduleSave();
  }

  private async rebuildAround(x: number, y: number, z: number, changes: Array<[number, number]>): Promise<void> {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const keys = new Set([`${cx},${cy},${cz}`]);
    if (x % CHUNK_SIZE === 0) keys.add(`${cx - 1},${cy},${cz}`);
    if (x % CHUNK_SIZE === CHUNK_SIZE - 1) keys.add(`${cx + 1},${cy},${cz}`);
    if (y % CHUNK_SIZE === 0) keys.add(`${cx},${cy - 1},${cz}`);
    if (y % CHUNK_SIZE === CHUNK_SIZE - 1) keys.add(`${cx},${cy + 1},${cz}`);
    if (z % CHUNK_SIZE === 0) keys.add(`${cx},${cy},${cz - 1}`);
    if (z % CHUNK_SIZE === CHUNK_SIZE - 1) keys.add(`${cx},${cy},${cz + 1}`);
    const primary = await this.worker.remesh(cx, cy, cz, changes);
    this.renderer.setChunk(primary);
    for (const key of keys) {
      const [nx, ny, nz] = key.split(",").map(Number);
      if (nx === cx && ny === cy && nz === cz) continue;
      if (nx < 0 || nx >= CHUNKS_X || ny < 0 || ny >= CHUNKS_Y || nz < 0 || nz >= CHUNKS_Z) continue;
      this.renderer.setChunk(await this.worker.mesh(nx, ny, nz));
    }
  }

  private damage(amount: number): void {
    if (amount <= 0 || this.snapshot.phase === "dead") return;
    this.vitals.health = Math.max(0, this.vitals.health - amount);
    this.audio.play("hurt");
    if (this.vitals.health <= 0) {
      this.locked = false;
      this.keys.clear();
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      this.snapshot = { ...this.snapshot, phase: "dead" };
      this.syncSnapshot();
      void this.flushSave();
    }
  }

  private syncSnapshot(): void {
    const targetName = this.currentTarget ? BLOCKS[this.currentTarget.block]?.name ?? "方块" : null;
    this.snapshot = {
      ...this.snapshot,
      player: { x: this.player.x, y: this.player.y, z: this.player.z },
      yaw: this.player.yaw,
      vitals: { ...this.vitals },
      inventory: this.inventory.map((slot) => ({ ...slot })),
      selectedSlot: this.selectedSlot,
      targetName,
      breakProgress: this.breakProgress,
      worldTime: this.worldTime,
      day: this.day,
      fps: this.fps,
      faces: this.renderer.faceCount,
      settings: { ...this.settings },
    };
    this.emit();
  }

  private createMapImage(): string | null {
    if (!this.data) return null;
    const canvas = document.createElement("canvas");
    canvas.width = WORLD_WIDTH;
    canvas.height = WORLD_DEPTH;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const colors: Record<number, string> = {
      [BlockId.Grass]: "#638f46", [BlockId.Dirt]: "#795337", [BlockId.Stone]: "#7d8382",
      [BlockId.Wood]: "#79502d", [BlockId.Leaves]: "#3d7138", [BlockId.Sand]: "#d1bf78",
      [BlockId.Water]: "#3b7fa9", [BlockId.Planks]: "#ae7f48",
    };
    for (let z = 0; z < WORLD_DEPTH; z += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        let block = BlockId.Air;
        for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
          block = getBlock(this.data, x, y, z);
          if (block !== BlockId.Air) break;
        }
        context.fillStyle = colors[block] ?? "#151a19";
        context.fillRect(x, z, 1, 1);
      }
    }
    return canvas.toDataURL("image/png");
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.snapshot = { ...this.snapshot, saveState: "saving" };
    this.emit();
    this.saveTimer = setTimeout(() => void this.flushSave(), 900);
  }

  private async flushSave(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.seed === null) return;
    const save: WorldSaveV1 = {
      schemaVersion: 1,
      generatorVersion: 1,
      seed: this.seed,
      modifiedBlocks: [...this.changes.entries()],
      player: {
        x: this.player.x, y: this.player.y, z: this.player.z,
        yaw: this.player.yaw, pitch: this.player.pitch, velocityY: this.player.velocityY,
      },
      inventory: this.inventory.map((slot) => ({ ...slot })),
      vitals: { ...this.vitals },
      selectedSlot: this.selectedSlot,
      worldTime: this.worldTime,
      day: this.day,
      updatedAt: Date.now(),
    };
    try {
      await saveWorld(save);
      this.snapshot = { ...this.snapshot, saveState: "saved", hasSave: true };
    } catch {
      this.snapshot = { ...this.snapshot, saveState: "error" };
    }
    this.emit();
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.inputAbort.abort();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    void this.flushSave();
    this.worker.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    this.listeners.clear();
  }
}
