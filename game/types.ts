export type Vec3 = { x: number; y: number; z: number };

export type GamePhase = "menu" | "loading" | "playing" | "paused" | "dead" | "error";

export type RenderBackend = "WebGPU" | "WebGL 2" | "检测中";

export type ItemId =
  | "grass"
  | "dirt"
  | "stone"
  | "wood"
  | "leaves"
  | "sand"
  | "planks"
  | "apple";

export interface InventorySlot {
  itemId: ItemId | null;
  count: number;
}

export interface PlayerVitals {
  health: number;
  hunger: number;
}

export interface GameSettings {
  sensitivity: number;
  invertY: boolean;
  volume: number;
  muted: boolean;
  shadows: boolean;
}

export interface GameSnapshot {
  phase: GamePhase;
  hasSave: boolean;
  loadingProgress: number;
  loadingLabel: string;
  backend: RenderBackend;
  player: Vec3;
  yaw: number;
  vitals: PlayerVitals;
  inventory: InventorySlot[];
  selectedSlot: number;
  targetName: string | null;
  breakProgress: number;
  worldTime: number;
  day: number;
  fps: number;
  faces: number;
  mapImage: string | null;
  saveState: "idle" | "saving" | "saved" | "error";
  settings: GameSettings;
  error: string | null;
}

export interface WorldSaveV1 {
  schemaVersion: 1;
  generatorVersion: 1;
  seed: number;
  modifiedBlocks: Array<[number, number]>;
  player: Vec3 & { yaw: number; pitch: number; velocityY: number };
  inventory: InventorySlot[];
  vitals: PlayerVitals;
  selectedSlot: number;
  worldTime: number;
  day: number;
  updatedAt: number;
}

export interface MeshBuffers {
  positions: ArrayBuffer;
  normals: ArrayBuffer;
  uvs: ArrayBuffer;
  vertexCount: number;
}

export interface ChunkMeshPayload {
  cx: number;
  cy: number;
  cz: number;
  solid: MeshBuffers;
  water: MeshBuffers;
}

export type WorkerRequest =
  | { type: "generateWorld"; requestId: number; seed: number; changes: Array<[number, number]> }
  | { type: "meshChunk"; requestId: number; cx: number; cy: number; cz: number }
  | {
      type: "remeshChunk";
      requestId: number;
      cx: number;
      cy: number;
      cz: number;
      changes: Array<[number, number]>;
    };

export type WorkerResponse =
  | { type: "worldGenerated"; requestId: number; data: ArrayBuffer; spawn: Vec3 }
  | { type: "chunkMeshed"; requestId: number; mesh: ChunkMeshPayload }
  | { type: "workerError"; requestId: number; message: string };
