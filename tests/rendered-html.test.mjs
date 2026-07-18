import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("keeps the game entry point wired into the app shell", async () => {
  const [game, page, layout] = await Promise.all([
    readFile(new URL("index.html", projectRoot), "utf8"),
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
  ]);

  assert.match(game, /<canvas\b/i);
  assert.match(game, /WebGL/i);
  assert.match(page, /src=["']\/index\.html["']/);
  assert.match(layout, /lang=["']zh-CN["']/);

  for (const asset of ["file.svg", "globe.svg", "window.svg"]) {
    await assert.rejects(access(new URL(`public/${asset}`, projectRoot)));
  }
});
