import { describe, expect, it } from "vitest";
import { addItem, BlockId, consumeSelected, createStarterInventory } from "@/game/blocks";
import { buildChunkMesh } from "@/game/mesh";
import { isValidWorldSave } from "@/game/storage";
import type { WorldSaveV1 } from "@/game/types";
import {
  WORLD_DEPTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  collides,
  generateWorld,
  getBlock,
  insideWorld,
  raycast,
  setBlock,
} from "@/game/world";

describe("世界生成", () => {
  it("同一种子始终生成相同世界", () => {
    const first = generateWorld(20260718);
    const second = generateWorld(20260718);
    expect(first.spawn).toEqual(second.spawn);
    expect(first.data).toEqual(second.data);
  }, 15_000);

  it("正确处理边界与方块读写", () => {
    const data = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT * WORLD_DEPTH);
    expect(insideWorld(0, 0, 0)).toBe(true);
    expect(insideWorld(WORLD_WIDTH, 0, 0)).toBe(false);
    expect(setBlock(data, 2, 3, 4, BlockId.Stone)).toBe(true);
    expect(getBlock(data, 2, 3, 4)).toBe(BlockId.Stone);
    expect(getBlock(data, -1, 3, 4)).toBe(BlockId.Air);
  });

  it("只为孤立方块生成六个可见面", () => {
    const data = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT * WORLD_DEPTH);
    setBlock(data, 2, 2, 2, BlockId.Grass);
    const mesh = buildChunkMesh(data, 0, 0, 0);
    expect(mesh.solid.vertexCount).toBe(36);
    expect(mesh.water.vertexCount).toBe(0);
  });

  it("射线命中方块并保留放置位置", () => {
    const data = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT * WORLD_DEPTH);
    setBlock(data, 5, 5, 5, BlockId.Wood);
    const hit = raycast(data, { x: 5.5, y: 5.5, z: 1.5 }, { x: 0, y: 0, z: 1 }, 6);
    expect(hit?.block).toBe(BlockId.Wood);
    expect(hit?.previous).toEqual({ x: 5, y: 5, z: 4 });
  });

  it("玩家碰撞只被实体方块阻挡", () => {
    const data = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT * WORLD_DEPTH);
    setBlock(data, 10, 10, 10, BlockId.Water);
    expect(collides(data, { x: 10.5, y: 10, z: 10.5 })).toBe(false);
    setBlock(data, 10, 10, 10, BlockId.Stone);
    expect(collides(data, { x: 10.5, y: 10, z: 10.5 })).toBe(true);
  });
});

describe("背包与存档", () => {
  it("可堆叠物品并消耗选中物品", () => {
    const inventory = createStarterInventory();
    expect(addItem(inventory, "apple", 1)).toBe(true);
    expect(inventory[7].count).toBe(4);
    expect(consumeSelected(inventory, 7)).toBe(true);
    expect(inventory[7].count).toBe(3);
  });

  it("拒绝损坏的存档结构", () => {
    expect(isValidWorldSave({ schemaVersion: 2 })).toBe(false);
    const valid: WorldSaveV1 = {
      schemaVersion: 1,
      generatorVersion: 1,
      seed: 7,
      modifiedBlocks: [],
      player: { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, velocityY: 0 },
      inventory: createStarterInventory(),
      vitals: { health: 20, hunger: 20 },
      selectedSlot: 0,
      worldTime: 0.4,
      day: 1,
      updatedAt: Date.now(),
    };
    expect(isValidWorldSave(valid)).toBe(true);
  });
});
