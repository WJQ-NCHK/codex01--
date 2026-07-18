import { BLOCKS, BlockId } from "./blocks";
import type { Vec3 } from "./types";

export const WORLD_WIDTH = 128;
export const WORLD_HEIGHT = 64;
export const WORLD_DEPTH = 128;
export const CHUNK_SIZE = 16;
export const CHUNKS_X = WORLD_WIDTH / CHUNK_SIZE;
export const CHUNKS_Y = WORLD_HEIGHT / CHUNK_SIZE;
export const CHUNKS_Z = WORLD_DEPTH / CHUNK_SIZE;
export const SEA_LEVEL = 13;

export function worldIndex(x: number, y: number, z: number): number {
  return x + WORLD_WIDTH * (z + WORLD_DEPTH * y);
}

export function insideWorld(x: number, y: number, z: number): boolean {
  return x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < WORLD_DEPTH;
}

export function getBlock(data: Uint8Array, x: number, y: number, z: number): BlockId {
  if (!insideWorld(x, y, z)) return BlockId.Air;
  return data[worldIndex(x, y, z)] as BlockId;
}

export function setBlock(data: Uint8Array, x: number, y: number, z: number, block: BlockId): boolean {
  if (!insideWorld(x, y, z)) return false;
  data[worldIndex(x, y, z)] = block;
  return true;
}

export function hash2(seed: number, x: number, z: number): number {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 69069);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function terrainHeight(seed: number, x: number, z: number): number {
  const sx = x + (seed % 997) * 0.013;
  const sz = z - (seed % 613) * 0.017;
  const broad = Math.sin(sx * 0.075) * 4.2 + Math.cos(sz * 0.064) * 3.5;
  const ridges = Math.sin((sx + sz) * 0.033) * 2.7 + Math.cos((sx - sz) * 0.041) * 1.8;
  const detail = (hash2(seed, x, z) - 0.5) * 2.2;
  const edge = Math.min(x, z, WORLD_WIDTH - 1 - x, WORLD_DEPTH - 1 - z);
  const coast = Math.min(1, Math.max(0, edge / 12));
  return Math.max(7, Math.min(31, Math.floor(10 + coast * (7 + broad + ridges + detail))));
}

export function surfaceAt(data: Uint8Array, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y -= 1) {
    const block = getBlock(data, x, y, z);
    if (block !== BlockId.Air && block !== BlockId.Water && block !== BlockId.Leaves && block !== BlockId.Wood) {
      return y;
    }
  }
  return 0;
}

export function generateWorld(seed: number, changes: Array<[number, number]> = []): { data: Uint8Array; spawn: Vec3 } {
  const data = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT * WORLD_DEPTH);
  for (let z = 0; z < WORLD_DEPTH; z += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const top = terrainHeight(seed, x, z);
      for (let y = 0; y <= top; y += 1) {
        const block = y < top - 3 ? BlockId.Stone : y < top ? BlockId.Dirt : top <= SEA_LEVEL + 1 ? BlockId.Sand : BlockId.Grass;
        setBlock(data, x, y, z, block);
      }
      for (let y = top + 1; y <= SEA_LEVEL; y += 1) setBlock(data, x, y, z, BlockId.Water);
    }
  }

  for (let z = 5; z < WORLD_DEPTH - 5; z += 1) {
    for (let x = 5; x < WORLD_WIDTH - 5; x += 1) {
      const top = surfaceAt(data, x, z);
      if (getBlock(data, x, top, z) !== BlockId.Grass || hash2(seed + 19, x * 3, z * 5) < 0.965) continue;
      if (Math.abs(x - WORLD_WIDTH / 2) + Math.abs(z - WORLD_DEPTH / 2) < 12) continue;
      const trunk = hash2(seed + 7, x, z) > 0.55 ? 5 : 4;
      for (let y = 1; y <= trunk; y += 1) setBlock(data, x, top + y, z, BlockId.Wood);
      for (let oy = trunk - 2; oy <= trunk + 1; oy += 1) {
        for (let oz = -2; oz <= 2; oz += 1) {
          for (let ox = -2; ox <= 2; ox += 1) {
            const crown = Math.abs(ox) + Math.abs(oz) + (oy === trunk + 1 ? 1 : 0);
            if (crown <= 3 && getBlock(data, x + ox, top + oy, z + oz) === BlockId.Air) {
              setBlock(data, x + ox, top + oy, z + oz, BlockId.Leaves);
            }
          }
        }
      }
    }
  }

  const spawnX = Math.floor(WORLD_WIDTH / 2);
  const spawnZ = Math.floor(WORLD_DEPTH / 2);
  const spawnTop = 22;
  for (let oz = -5; oz <= 5; oz += 1) {
    for (let ox = -5; ox <= 5; ox += 1) {
      const distance = Math.max(Math.abs(ox), Math.abs(oz));
      const top = spawnTop - Math.max(0, distance - 3);
      for (let y = 0; y < WORLD_HEIGHT; y += 1) {
        const block = y < top - 3 ? BlockId.Stone : y < top ? BlockId.Dirt : y === top ? BlockId.Grass : BlockId.Air;
        setBlock(data, spawnX + ox, y, spawnZ + oz, block);
      }
    }
  }

  for (const [index, block] of changes) {
    if (index >= 0 && index < data.length && block >= BlockId.Air && block <= BlockId.Planks) data[index] = block;
  }

  return { data, spawn: { x: spawnX + 0.5, y: spawnTop + 1.01, z: spawnZ + 0.5 } };
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  block: BlockId;
  previous: Vec3 | null;
}

export function raycast(data: Uint8Array, origin: Vec3, direction: Vec3, maxDistance = 6): RayHit | null {
  let previous: Vec3 | null = null;
  let lastKey = "";
  for (let distance = 0; distance <= maxDistance; distance += 0.035) {
    const x = Math.floor(origin.x + direction.x * distance);
    const y = Math.floor(origin.y + direction.y * distance);
    const z = Math.floor(origin.z + direction.z * distance);
    const key = `${x},${y},${z}`;
    if (key === lastKey) continue;
    lastKey = key;
    const block = getBlock(data, x, y, z);
    if (block !== BlockId.Air && block !== BlockId.Water) return { x, y, z, block, previous };
    previous = { x, y, z };
  }
  return null;
}

export function collides(data: Uint8Array, position: Vec3): boolean {
  const minX = Math.floor(position.x - 0.3);
  const maxX = Math.floor(position.x + 0.3);
  const minY = Math.floor(position.y + 0.01);
  const maxY = Math.floor(position.y + 1.78);
  const minZ = Math.floor(position.z - 0.3);
  const maxZ = Math.floor(position.z + 0.3);
  if (minX < 0 || maxX >= WORLD_WIDTH || minZ < 0 || maxZ >= WORLD_DEPTH || position.y < 0) return true;
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (BLOCKS[getBlock(data, x, y, z)]?.solid) return true;
      }
    }
  }
  return false;
}

