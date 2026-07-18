"use client";

import { useEffect, useRef, useState } from "react";
import { ITEM_META } from "@/game/blocks";
import { GameRuntime } from "@/game/runtime";
import type { GameSettings, GameSnapshot } from "@/game/types";

function SettingsPanel({ snapshot, onChange }: { snapshot: GameSnapshot; onChange: (settings: Partial<GameSettings>) => void }) {
  const { settings } = snapshot;
  return (
    <div className="settings-grid">
      <label className="setting setting-wide">
        <span>鼠标灵敏度</span>
        <input
          aria-label="鼠标灵敏度"
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={settings.sensitivity}
          onChange={(event) => onChange({ sensitivity: Number(event.target.value) })}
        />
        <output>{Math.round(settings.sensitivity * 100)}%</output>
      </label>
      <label className="setting setting-wide">
        <span>主音量</span>
        <input
          aria-label="主音量"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.volume}
          onChange={(event) => onChange({ volume: Number(event.target.value) })}
        />
        <output>{Math.round(settings.volume * 100)}%</output>
      </label>
      <label className="toggle"><input type="checkbox" checked={settings.invertY} onChange={(event) => onChange({ invertY: event.target.checked })} />反转 Y 轴</label>
      <label className="toggle"><input type="checkbox" checked={settings.shadows} onChange={(event) => onChange({ shadows: event.target.checked })} />动态阴影</label>
      <label className="toggle"><input type="checkbox" checked={settings.muted} onChange={(event) => onChange({ muted: event.target.checked })} />静音</label>
    </div>
  );
}

function WorldHud({ snapshot, runtime }: { snapshot: GameSnapshot; runtime: GameRuntime }) {
  const totalMinutes = Math.floor(snapshot.worldTime * 24 * 60) % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const directionIndex = Math.round((((snapshot.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4;
  const direction = ["北", "东", "南", "西"][directionIndex];
  const saveLabel = snapshot.saveState === "saving" ? "保存中" : snapshot.saveState === "error" ? "保存失败" : snapshot.saveState === "saved" ? "已保存" : "";

  return (
    <div className="hud" aria-hidden={snapshot.phase !== "playing"}>
      <div className="brand-corner">
        <span className="brand-cube" />
        <div><strong>方块世界</strong><small>VOXEL SURVIVAL</small></div>
      </div>
      <div className="debug-panel">
        <span>XYZ {snapshot.player.x.toFixed(1)} / {snapshot.player.y.toFixed(1)} / {snapshot.player.z.toFixed(1)}</span>
        <span>朝向 {direction} · {snapshot.backend}</span>
        <span>{snapshot.fps} FPS · {snapshot.faces.toLocaleString()} 面</span>
      </div>
      <div className="world-clock">
        <strong>第 {snapshot.day} 天</strong>
        <span>{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}</span>
        {saveLabel && <small>{saveLabel}</small>}
      </div>
      <div className="crosshair"><i /><b /></div>
      {snapshot.targetName && (
        <div className="target-label">
          {snapshot.targetName}
          {snapshot.breakProgress > 0 && <span><i style={{ width: `${Math.min(100, snapshot.breakProgress * 100)}%` }} /></span>}
        </div>
      )}
      <div className="survival-bar">
        <div className="vitals" aria-label={`生命 ${Math.ceil(snapshot.vitals.health)}，饥饿 ${Math.ceil(snapshot.vitals.hunger)}`}>
          <div className="hearts">{Array.from({ length: 10 }, (_, index) => <span className={snapshot.vitals.health > index * 2 ? "filled" : ""} key={index}>♥</span>)}</div>
          <div className="hunger">{Array.from({ length: 10 }, (_, index) => <span className={snapshot.vitals.hunger > index * 2 ? "filled" : ""} key={index}>◆</span>)}</div>
        </div>
        <div className="hotbar" role="toolbar" aria-label="快捷栏">
          {snapshot.inventory.map((slot, index) => {
            const item = slot.itemId ? ITEM_META[slot.itemId] : null;
            return (
              <button
                type="button"
                className={`hotbar-slot ${snapshot.selectedSlot === index ? "selected" : ""}`}
                key={index}
                aria-label={item ? `选择${item.name}` : `空槽位 ${index + 1}`}
                onClick={() => runtime.selectSlot(index)}
              >
                <small>{index + 1}</small>
                {item && <i style={{ "--item-color": item.color } as React.CSSProperties} className={slot.itemId === "apple" ? "item apple" : "item"} />}
                {slot.count > 0 && <b>{slot.count}</b>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="controls-hint"><b>WASD</b> 移动 <b>Shift</b> 疾跑 <b>Space</b> 跳跃<br /><b>左键</b> 持续挖掘 <b>右键</b> 放置 / 进食</div>
      <div className="minimap" style={snapshot.mapImage ? { backgroundImage: `url(${snapshot.mapImage})` } : undefined}>
        <div className="map-title"><span>地形地图</span><span>{Math.round(snapshot.player.x)}, {Math.round(snapshot.player.z)}</span></div>
        <i
          className="map-player"
          style={{ left: `${(snapshot.player.x / 128) * 100}%`, top: `${(snapshot.player.z / 128) * 100}%`, transform: `translate(-50%, -50%) rotate(${-snapshot.yaw}rad)` }}
        />
      </div>
      <div className="desktop-required"><strong>需要桌面设备</strong><span>请使用键盘和鼠标进入这个体素世界。</span></div>
    </div>
  );
}

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [runtime, setRuntime] = useState<GameRuntime | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const gameRuntime = new GameRuntime(canvasRef.current);
    setRuntime(gameRuntime);
    const unsubscribe = gameRuntime.subscribe(() => setSnapshot(gameRuntime.getSnapshot()));
    void gameRuntime.initialize().then(() => setSnapshot(gameRuntime.getSnapshot())).catch((error: unknown) => {
      setInitializationError(error instanceof Error ? error.message : "游戏引擎初始化失败");
    });
    return () => {
      unsubscribe();
      gameRuntime.dispose();
    };
  }, []);

  const startNew = async () => {
    if (!runtime) return;
    setConfirmReset(false);
    await runtime.startNewWorld();
    await runtime.resume();
  };
  const continueWorld = async () => {
    if (!runtime) return;
    await runtime.continueWorld();
    if (runtime.getSnapshot().phase !== "error") await runtime.resume();
  };

  return (
    <main className="game-shell" data-game-root>
      <canvas ref={canvasRef} id="game-canvas" aria-label="第一人称 3D 方块世界" />
      {snapshot && runtime && snapshot.hasSave && snapshot.phase !== "menu" && snapshot.phase !== "loading" && snapshot.phase !== "error" && <WorldHud snapshot={snapshot} runtime={runtime} />}

      {(!snapshot || snapshot.phase === "menu") && (
        <div className="menu-layer">
          <section className="hero-card">
            <div className="eyebrow"><span /> THREE.JS · WEBGPU / WEBGL 2</div>
            <div className="title-lockup"><span className="hero-cube" /><div><h1>方块世界</h1><p>VOXEL SURVIVAL</p></div></div>
            <p className="hero-copy">穿过动态光影与雾色，探索由种子生成的体素大地。<br />采集、生存，在黑夜来临前建造你的落脚处。</p>
            <div className="menu-actions">
              {snapshot?.hasSave && <button className="primary-action" type="button" onClick={() => void continueWorld()}>继续世界 <span>→</span></button>}
              <button className={snapshot?.hasSave ? "secondary-action" : "primary-action"} type="button" onClick={() => snapshot?.hasSave ? setConfirmReset(true) : void startNew()}>
                {snapshot?.hasSave ? "创建新世界" : "进入世界"}
              </button>
            </div>
            {snapshot && runtime && <SettingsPanel snapshot={snapshot} onChange={(settings) => runtime.updateSettings(settings)} />}
            <div className="feature-line"><span>◇ 128×64×128 分块世界</span><span>◇ 本地自动存档</span><span>◇ 桌面键鼠</span></div>
          </section>
        </div>
      )}

      {snapshot?.phase === "loading" && (
        <div className="menu-layer loading-layer"><section className="loading-card"><span className="loading-cube" /><h2>正在塑造世界</h2><p>{snapshot.loadingLabel}</p><div className="loading-track"><i style={{ width: `${snapshot.loadingProgress * 100}%` }} /></div><small>{Math.round(snapshot.loadingProgress * 100)}%</small></section></div>
      )}

      {snapshot?.phase === "paused" && runtime && (
        <div className="menu-layer pause-layer"><section className="pause-card"><div className="eyebrow"><span /> 游戏已暂停</div><h2>继续你的旅程</h2><p>世界已停止流动，本地进度已安全保存。</p><button className="primary-action" type="button" onClick={() => void runtime.resume()}>返回世界 <span>→</span></button><SettingsPanel snapshot={snapshot} onChange={(settings) => runtime.updateSettings(settings)} /><button className="text-action" type="button" onClick={() => setConfirmReset(true)}>重新生成世界</button></section></div>
      )}

      {snapshot?.phase === "dead" && runtime && (
        <div className="menu-layer death-layer"><section className="death-card"><div className="death-mark">☠</div><h2>你倒下了</h2><p>这个世界会记住你的建造。背包中的物品也将保留。</p><button className="primary-action" type="button" onClick={() => { runtime.respawn(); void runtime.resume(); }}>在出生点重生</button></section></div>
      )}

      {(snapshot?.phase === "error" || initializationError) && (
        <div className="menu-layer error-layer"><section className="error-card"><h2>无法进入世界</h2><p>{initializationError ?? snapshot?.error}</p><button className="secondary-action" type="button" onClick={() => window.location.reload()}>重新加载</button></section></div>
      )}

      {confirmReset && (
        <div className="confirm-layer" role="dialog" aria-modal="true" aria-labelledby="reset-title"><section><h2 id="reset-title">要放下现在的世界吗？</h2><p>创建新世界会删除当前的本地地形修改和玩家进度。此操作无法撤销。</p><div><button className="secondary-action" type="button" onClick={() => setConfirmReset(false)}>取消</button><button className="danger-action" type="button" onClick={() => void startNew()}>删除并重开</button></div></section></div>
      )}
    </main>
  );
}
