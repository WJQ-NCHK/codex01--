import type { ChunkMeshPayload, Vec3, WorkerRequest, WorkerResponse } from "./types";

type Pending = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
};

type WithoutRequestId<T> = T extends unknown ? Omit<T, "requestId"> : never;
type WorkerRequestPayload = WithoutRequestId<WorkerRequest>;

export class WorldWorkerClient {
  private readonly worker: Worker;
  private nextRequestId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL("./world.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      this.pending.delete(response.requestId);
      if (response.type === "workerError") pending.reject(new Error(response.message));
      else pending.resolve(response);
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || "世界 Worker 加载失败");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  private request(payload: WorkerRequestPayload): Promise<WorkerResponse> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.worker.postMessage({ ...payload, requestId } as WorkerRequest);
    });
  }

  async generate(seed: number, changes: Array<[number, number]>): Promise<{ data: Uint8Array; spawn: Vec3 }> {
    const response = await this.request({ type: "generateWorld", seed, changes });
    if (response.type !== "worldGenerated") throw new Error("世界生成响应无效");
    return { data: new Uint8Array(response.data), spawn: response.spawn };
  }

  async mesh(cx: number, cy: number, cz: number): Promise<ChunkMeshPayload> {
    const response = await this.request({ type: "meshChunk", cx, cy, cz });
    if (response.type !== "chunkMeshed") throw new Error("区块网格响应无效");
    return response.mesh;
  }

  async remesh(cx: number, cy: number, cz: number, changes: Array<[number, number]>): Promise<ChunkMeshPayload> {
    const response = await this.request({ type: "remeshChunk", cx, cy, cz, changes });
    if (response.type !== "chunkMeshed") throw new Error("区块重建响应无效");
    return response.mesh;
  }

  dispose(): void {
    this.worker.terminate();
    const error = new Error("世界 Worker 已停止");
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
