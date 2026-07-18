import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSnapshot } from "@/game/types";

const startNewWorld = vi.fn(async () => undefined);
const resume = vi.fn(async () => undefined);

const snapshot: GameSnapshot = {
  phase: "menu",
  hasSave: false,
  loadingProgress: 0,
  loadingLabel: "",
  backend: "WebGL 2",
  player: { x: 64.5, y: 24, z: 64.5 },
  yaw: Math.PI,
  vitals: { health: 20, hunger: 20 },
  inventory: Array.from({ length: 9 }, () => ({ itemId: null, count: 0 })),
  selectedSlot: 0,
  targetName: null,
  breakProgress: 0,
  worldTime: 0.35,
  day: 1,
  fps: 60,
  faces: 0,
  mapImage: null,
  saveState: "idle",
  settings: { sensitivity: 1, invertY: false, volume: 0.65, muted: false, shadows: true },
  error: null,
};

vi.mock("@/game/runtime", () => ({
  GameRuntime: class {
    subscribe(listener: () => void) { queueMicrotask(listener); return () => undefined; }
    getSnapshot() { return snapshot; }
    initialize = vi.fn(async () => undefined);
    startNewWorld = startNewWorld;
    resume = resume;
    continueWorld = vi.fn(async () => undefined);
    updateSettings = vi.fn();
    selectSlot = vi.fn();
    dispose = vi.fn();
  },
}));

import { GameApp } from "@/app/game-app";

describe("游戏主菜单", () => {
  beforeEach(() => {
    startNewWorld.mockClear();
    resume.mockClear();
  });

  afterEach(() => cleanup());

  it("显示中文品牌、新世界入口和设置", async () => {
    render(<GameApp />);
    expect(await screen.findByRole("heading", { name: "方块世界" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入世界" })).toBeInTheDocument();
    expect(screen.getByLabelText("鼠标灵敏度")).toBeInTheDocument();
  });

  it("从菜单创建世界后请求进入第一人称视角", async () => {
    render(<GameApp />);
    fireEvent.click(await screen.findByRole("button", { name: "进入世界" }));
    await waitFor(() => expect(startNewWorld).toHaveBeenCalledOnce());
    expect(resume).toHaveBeenCalledOnce();
  });
});
