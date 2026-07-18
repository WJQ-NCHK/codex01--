import { BlockId } from "./blocks";
import { CHUNK_SIZE, getBlock } from "./world";
import type { ChunkMeshPayload, MeshBuffers } from "./types";

type Face = { normal: [number, number, number]; vertices: Array<[number, number, number]> };

const FACES: Face[] = [
  { normal: [1, 0, 0], vertices: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [-1, 0, 0], vertices: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { normal: [0, 1, 0], vertices: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { normal: [0, -1, 0], vertices: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
  { normal: [0, 0, 1], vertices: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { normal: [0, 0, -1], vertices: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

const ORDER = [0, 1, 2, 0, 2, 3];
const ATLAS_TILES = 10;

function tileFor(block: BlockId, face: number): number {
  if (block === BlockId.Grass) return face === 2 ? 0 : face === 3 ? 2 : 1;
  if (block === BlockId.Dirt) return 2;
  if (block === BlockId.Stone) return 3;
  if (block === BlockId.Wood) return face === 2 || face === 3 ? 5 : 4;
  if (block === BlockId.Leaves) return 6;
  if (block === BlockId.Sand) return 7;
  if (block === BlockId.Water) return 8;
  return 9;
}

function emptyBuffers(): { positions: number[]; normals: number[]; uvs: number[] } {
  return { positions: [], normals: [], uvs: [] };
}

function finalize(buffers: ReturnType<typeof emptyBuffers>): MeshBuffers {
  const positions = new Float32Array(buffers.positions);
  const normals = new Float32Array(buffers.normals);
  const uvs = new Float32Array(buffers.uvs);
  return { positions: positions.buffer, normals: normals.buffer, uvs: uvs.buffer, vertexCount: positions.length / 3 };
}

export function buildChunkMesh(data: Uint8Array, cx: number, cy: number, cz: number): ChunkMeshPayload {
  const solid = emptyBuffers();
  const water = emptyBuffers();
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  for (let y = startY; y < startY + CHUNK_SIZE; y += 1) {
    for (let z = startZ; z < startZ + CHUNK_SIZE; z += 1) {
      for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
        const block = getBlock(data, x, y, z);
        if (block === BlockId.Air) continue;
        const target = block === BlockId.Water ? water : solid;
        for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
          const face = FACES[faceIndex];
          const neighbor = getBlock(data, x + face.normal[0], y + face.normal[1], z + face.normal[2]);
          const visible = block === BlockId.Water
            ? neighbor === BlockId.Air
            : neighbor === BlockId.Air || neighbor === BlockId.Water;
          if (!visible) continue;
          const tile = tileFor(block, faceIndex);
          const pad = 0.035 / ATLAS_TILES;
          const u0 = tile / ATLAS_TILES + pad;
          const u1 = (tile + 1) / ATLAS_TILES - pad;
          const uv: Array<[number, number]> = [[u0, 0.965], [u0, 0.035], [u1, 0.035], [u1, 0.965]];
          for (const vertexIndex of ORDER) {
            const vertex = face.vertices[vertexIndex];
            target.positions.push(x + vertex[0], y + vertex[1], z + vertex[2]);
            target.normals.push(...face.normal);
            target.uvs.push(...uv[vertexIndex]);
          }
        }
      }
    }
  }

  return { cx, cy, cz, solid: finalize(solid), water: finalize(water) };
}
