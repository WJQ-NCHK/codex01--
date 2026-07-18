import * as THREE from "three/webgpu";
import type { ChunkMeshPayload, GameSettings, RenderBackend, Vec3 } from "./types";

type ChunkObject = { solid?: THREE.Mesh; water?: THREE.Mesh };
type Particle = { points: THREE.Points; velocity: THREE.Vector3; life: number };

export class VoxelRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(65, 1, 0.08, 190);
  private readonly renderer: THREE.WebGPURenderer;
  private readonly chunks = new Map<string, ChunkObject>();
  private readonly particles: Particle[] = [];
  private readonly sun = new THREE.DirectionalLight(0xfff1c4, 2.15);
  private readonly ambient = new THREE.HemisphereLight(0xb7d8ff, 0x415132, 1.15);
  private readonly outline: THREE.LineSegments;
  private solidMaterial!: THREE.MeshLambertMaterial;
  private waterMaterial!: THREE.MeshLambertMaterial;
  private canvas: HTMLCanvasElement;
  private totalFaces = 0;
  readonly backend: RenderBackend;

  constructor(canvas: HTMLCanvasElement, forceWebGL: boolean) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, forceWebGL });
    this.backend = forceWebGL || !("gpu" in navigator) ? "WebGL 2" : "WebGPU";
    const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006));
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xfff1a3, transparent: true, opacity: 0.95 });
    this.outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
    this.outline.visible = false;
  }

  async initialize(settings: GameSettings): Promise<void> {
    await this.renderer.init();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.scene.background = new THREE.Color(0x88bce8);
    this.scene.fog = new THREE.Fog(0x88bce8, 42, 135);
    const texture = this.createAtlas();
    this.solidMaterial = new THREE.MeshLambertMaterial({ map: texture });
    this.waterMaterial = new THREE.MeshLambertMaterial({ map: texture, transparent: true, opacity: 0.68, depthWrite: false });
    this.sun.position.set(45, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -44;
    this.sun.shadow.camera.right = 44;
    this.sun.shadow.camera.top = 44;
    this.sun.shadow.camera.bottom = -44;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 150;
    this.scene.add(this.ambient, this.sun, this.sun.target, this.outline);
    this.resize();
  }

  private createAtlas(): THREE.CanvasTexture {
    const tile = 16;
    const count = 10;
    const atlas = document.createElement("canvas");
    atlas.width = tile * count;
    atlas.height = tile;
    const context = atlas.getContext("2d");
    if (!context) throw new Error("无法创建像素纹理");
    const bases = ["#68a94b", "#84603b", "#795337", "#7d8382", "#966437", "#ad7b42", "#4f8b46", "#d7c57f", "#3f89b4", "#b98b52"];
    for (let t = 0; t < count; t += 1) {
      for (let y = 0; y < tile; y += 1) {
        for (let x = 0; x < tile; x += 1) {
          const noise = ((x * 17 + y * 31 + t * 47) * 1103515245 >>> 27) - 8;
          let base = bases[t];
          if (t === 1 && y < 4) base = "#68a94b";
          const color = new THREE.Color(base);
          color.offsetHSL(0, 0, noise / 255);
          context.fillStyle = `#${color.getHexString()}`;
          context.fillRect(t * tile + x, y, 1, 1);
        }
      }
    }
    const texture = new THREE.CanvasTexture(atlas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private geometryFrom(mesh: ChunkMeshPayload["solid"]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(mesh.normals), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(mesh.uvs), 2));
    geometry.computeBoundingSphere();
    return geometry;
  }

  setChunk(payload: ChunkMeshPayload): void {
    const key = `${payload.cx},${payload.cy},${payload.cz}`;
    const old = this.chunks.get(key);
    if (old?.solid) {
      this.scene.remove(old.solid);
      old.solid.geometry.dispose();
    }
    if (old?.water) {
      this.scene.remove(old.water);
      old.water.geometry.dispose();
    }
    const next: ChunkObject = {};
    if (payload.solid.vertexCount > 0) {
      next.solid = new THREE.Mesh(this.geometryFrom(payload.solid), this.solidMaterial);
      next.solid.receiveShadow = true;
      next.solid.castShadow = payload.cy > 0;
      this.scene.add(next.solid);
    }
    if (payload.water.vertexCount > 0) {
      next.water = new THREE.Mesh(this.geometryFrom(payload.water), this.waterMaterial);
      next.water.renderOrder = 1;
      this.scene.add(next.water);
    }
    this.chunks.set(key, next);
    this.totalFaces = 0;
    for (const chunk of this.chunks.values()) {
      this.totalFaces += ((chunk.solid?.geometry.getAttribute("position").count ?? 0) + (chunk.water?.geometry.getAttribute("position").count ?? 0)) / 6;
    }
  }

  clearWorld(): void {
    for (const chunk of this.chunks.values()) {
      if (chunk.solid) {
        this.scene.remove(chunk.solid);
        chunk.solid.geometry.dispose();
      }
      if (chunk.water) {
        this.scene.remove(chunk.water);
        chunk.water.geometry.dispose();
      }
    }
    this.chunks.clear();
    this.totalFaces = 0;
  }

  get faceCount(): number {
    return Math.round(this.totalFaces);
  }

  setShadows(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
  }

  spawnParticles(position: Vec3, color: number): void {
    for (let index = 0; index < 7; index += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([position.x, position.y, position.z], 3));
      const material = new THREE.PointsMaterial({ color, size: 0.11, sizeAttenuation: true });
      const points = new THREE.Points(geometry, material);
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 1.7, Math.random() * 1.8, (Math.random() - 0.5) * 1.7);
      this.particles.push({ points, velocity, life: 0.55 });
      this.scene.add(points);
    }
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(player: Vec3, yaw: number, pitch: number, worldTime: number, target: Vec3 | null, delta: number): void {
    this.camera.position.set(player.x, player.y + 1.62, player.z);
    const cp = Math.cos(pitch);
    this.camera.lookAt(player.x + Math.sin(yaw) * cp, player.y + 1.62 + Math.sin(pitch), player.z - Math.cos(yaw) * cp);
    const angle = worldTime * Math.PI * 2;
    const daylight = THREE.MathUtils.clamp(Math.sin(angle - Math.PI / 2) * 0.52 + 0.58, 0.12, 1);
    const sky = new THREE.Color().setRGB(0.12 + 0.34 * daylight, 0.18 + 0.48 * daylight, 0.3 + 0.55 * daylight);
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);
    this.sun.intensity = 0.25 + daylight * 2.2;
    this.ambient.intensity = 0.28 + daylight * 1.05;
    this.sun.position.set(player.x + Math.cos(angle) * 62, player.y + Math.sin(angle) * 72, player.z + 28);
    this.sun.target.position.set(player.x, 0, player.z);
    this.outline.visible = target !== null;
    if (target) this.outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= delta;
      particle.velocity.y -= 4.5 * delta;
      particle.points.position.addScaledVector(particle.velocity, delta);
      if (particle.life <= 0) {
        this.scene.remove(particle.points);
        particle.points.geometry.dispose();
        (particle.points.material as THREE.Material).dispose();
        this.particles.splice(index, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.clearWorld();
    this.solidMaterial?.dispose();
    this.waterMaterial?.dispose();
    this.renderer.dispose();
  }
}
