import type { InventorySlot, ItemId } from "./types";

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Wood = 4,
  Leaves = 5,
  Sand = 6,
  Water = 7,
  Planks = 8,
}

export interface BlockDefinition {
  id: BlockId;
  name: string;
  solid: boolean;
  hardness: number;
  itemId: ItemId | null;
}

export const BLOCKS: Record<number, BlockDefinition> = {
  [BlockId.Air]: { id: BlockId.Air, name: "空气", solid: false, hardness: 0, itemId: null },
  [BlockId.Grass]: { id: BlockId.Grass, name: "草方块", solid: true, hardness: 0.55, itemId: "grass" },
  [BlockId.Dirt]: { id: BlockId.Dirt, name: "泥土", solid: true, hardness: 0.5, itemId: "dirt" },
  [BlockId.Stone]: { id: BlockId.Stone, name: "圆石", solid: true, hardness: 0.95, itemId: "stone" },
  [BlockId.Wood]: { id: BlockId.Wood, name: "橡木", solid: true, hardness: 0.8, itemId: "wood" },
  [BlockId.Leaves]: { id: BlockId.Leaves, name: "树叶", solid: true, hardness: 0.25, itemId: "leaves" },
  [BlockId.Sand]: { id: BlockId.Sand, name: "沙子", solid: true, hardness: 0.4, itemId: "sand" },
  [BlockId.Water]: { id: BlockId.Water, name: "水", solid: false, hardness: 0, itemId: null },
  [BlockId.Planks]: { id: BlockId.Planks, name: "木板", solid: true, hardness: 0.7, itemId: "planks" },
};

export const ITEM_META: Record<ItemId, { name: string; blockId: BlockId | null; color: string }> = {
  grass: { name: "草方块", blockId: BlockId.Grass, color: "#6fa94b" },
  dirt: { name: "泥土", blockId: BlockId.Dirt, color: "#845936" },
  stone: { name: "圆石", blockId: BlockId.Stone, color: "#7f8584" },
  wood: { name: "橡木", blockId: BlockId.Wood, color: "#9b6937" },
  leaves: { name: "树叶", blockId: BlockId.Leaves, color: "#4f8b46" },
  sand: { name: "沙子", blockId: BlockId.Sand, color: "#d7c57f" },
  planks: { name: "木板", blockId: BlockId.Planks, color: "#b9884f" },
  apple: { name: "苹果", blockId: null, color: "#dc4540" },
};

export function createStarterInventory(): InventorySlot[] {
  return [
    { itemId: "grass", count: 16 },
    { itemId: "dirt", count: 24 },
    { itemId: "stone", count: 18 },
    { itemId: "wood", count: 10 },
    { itemId: "leaves", count: 8 },
    { itemId: "sand", count: 12 },
    { itemId: "planks", count: 16 },
    { itemId: "apple", count: 3 },
    { itemId: null, count: 0 },
  ];
}

export function addItem(inventory: InventorySlot[], itemId: ItemId, amount = 1): boolean {
  const existing = inventory.find((slot) => slot.itemId === itemId && slot.count < 99);
  if (existing) {
    existing.count = Math.min(99, existing.count + amount);
    return true;
  }
  const empty = inventory.find((slot) => slot.itemId === null);
  if (!empty) return false;
  empty.itemId = itemId;
  empty.count = Math.min(99, amount);
  return true;
}

export function consumeSelected(inventory: InventorySlot[], selected: number, amount = 1): boolean {
  const slot = inventory[selected];
  if (!slot || slot.count < amount) return false;
  slot.count -= amount;
  if (slot.count === 0) slot.itemId = null;
  return true;
}

