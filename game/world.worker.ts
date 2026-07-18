import { buildChunkMesh } from "./mesh";
import { generateWorld } from "./world";
import type { WorkerRequest, WorkerResponse } from "./types";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
let worldData: Uint8Array | null = null;

scope.onmessage = (event) => {
  const request = event.data;
  try {
    if (request.type === "generateWorld") {
      const generated = generateWorld(request.seed, request.changes);
      worldData = generated.data;
      const copy = generated.data.slice().buffer;
      scope.postMessage({ type: "worldGenerated", requestId: request.requestId, data: copy, spawn: generated.spawn }, [copy]);
      return;
    }
    if (!worldData) throw new Error("世界尚未生成");
    if (request.type === "remeshChunk") {
      for (const [index, block] of request.changes) {
        if (index >= 0 && index < worldData.length) worldData[index] = block;
      }
    }
    const mesh = buildChunkMesh(worldData, request.cx, request.cy, request.cz);
    const transfer = [
      mesh.solid.positions, mesh.solid.normals, mesh.solid.uvs,
      mesh.water.positions, mesh.water.normals, mesh.water.uvs,
    ];
    scope.postMessage({ type: "chunkMeshed", requestId: request.requestId, mesh }, transfer);
  } catch (error) {
    scope.postMessage({
      type: "workerError",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Worker 未知错误",
    });
  }
};

