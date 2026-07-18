import type { GameSettings, InventorySlot, WorldSaveV1 } from "./types";

const DATABASE_NAME = "block-world";
const DATABASE_VERSION = 1;
const WORLD_STORE = "world";
const SETTINGS_STORE = "settings";
const WORLD_KEY = "primary";
const SETTINGS_KEY = "player";

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  invertY: false,
  volume: 0.65,
  muted: false,
  shadows: true,
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WORLD_STORE)) database.createObjectStore(WORLD_STORE);
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) database.createObjectStore(SETTINGS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地存档"));
  });
}

async function readStore<T>(storeName: string, key: string): Promise<T | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("读取本地数据失败"));
    transaction.oncomplete = () => database.close();
  });
}

async function writeStore<T>(storeName: string, key: string, value: T): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("写入本地数据失败"));
  });
}

export function isValidWorldSave(value: unknown): value is WorldSaveV1 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorldSaveV1>;
  return candidate.schemaVersion === 1
    && candidate.generatorVersion === 1
    && Number.isInteger(candidate.seed)
    && Array.isArray(candidate.modifiedBlocks)
    && Array.isArray(candidate.inventory)
    && candidate.inventory.length === 9
    && typeof candidate.worldTime === "number"
    && typeof candidate.day === "number"
    && !!candidate.player
    && typeof candidate.player.x === "number"
    && !!candidate.vitals
    && typeof candidate.vitals.health === "number";
}

export function sanitizeInventory(value: InventorySlot[]): InventorySlot[] {
  return value.slice(0, 9).map((slot) => ({
    itemId: slot?.itemId ?? null,
    count: Math.max(0, Math.min(99, Number(slot?.count) || 0)),
  }));
}

export async function hasWorldSave(): Promise<boolean> {
  try {
    return isValidWorldSave(await readStore<unknown>(WORLD_STORE, WORLD_KEY));
  } catch {
    return false;
  }
}

export async function loadWorldSave(): Promise<WorldSaveV1 | null> {
  const value = await readStore<unknown>(WORLD_STORE, WORLD_KEY);
  if (value === null) return null;
  if (!isValidWorldSave(value)) throw new Error("本地存档已损坏或版本不兼容");
  return { ...value, inventory: sanitizeInventory(value.inventory) };
}

export function saveWorld(save: WorldSaveV1): Promise<void> {
  return writeStore(WORLD_STORE, WORLD_KEY, save);
}

export async function deleteWorldSave(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(WORLD_STORE, "readwrite");
    transaction.objectStore(WORLD_STORE).delete(WORLD_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("删除存档失败"));
  });
}

export async function loadSettings(): Promise<GameSettings> {
  try {
    const value = await readStore<Partial<GameSettings>>(SETTINGS_STORE, SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(value ?? {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): Promise<void> {
  return writeStore(SETTINGS_STORE, SETTINGS_KEY, settings);
}

