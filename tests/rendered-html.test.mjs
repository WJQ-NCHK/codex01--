import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("renders the game directly through the app route", async () => {
  const [page, gameApp, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/game-app.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
  ]);

  assert.doesNotMatch(page, /iframe/i);
  assert.match(page, /GameApp/);
  assert.match(gameApp, /<canvas\b/i);
  assert.match(gameApp, /WEBGPU \/ WEBGL 2/i);
  assert.match(gameApp, /data-game-root/);
  assert.match(layout, /lang=["']zh-CN["']/);
  assert.match(layout, /方块世界/);

  await assert.rejects(access(new URL("index.html", projectRoot)));
  for (const asset of ["file.svg", "globe.svg", "window.svg"]) {
    await assert.rejects(access(new URL(`public/${asset}`, projectRoot)));
  }
});
