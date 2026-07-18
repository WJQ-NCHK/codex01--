import type { GameSettings } from "./types";

export type SoundName = "step" | "break" | "place" | "hurt" | "eat" | "ui";

export class GameAudio {
  private context: AudioContext | null = null;
  private settings: GameSettings;
  private lastStep = 0;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  async unlock(): Promise<void> {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }

  play(name: SoundName): void {
    if (!this.context || this.settings.muted || this.settings.volume <= 0) return;
    if (name === "step" && performance.now() - this.lastStep < 230) return;
    if (name === "step") this.lastStep = performance.now();
    const now = this.context.currentTime;
    const gain = this.context.createGain();
    const levels: Record<SoundName, number> = { step: 0.08, break: 0.14, place: 0.11, hurt: 0.16, eat: 0.1, ui: 0.07 };
    gain.gain.setValueAtTime(levels[name] * this.settings.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (name === "hurt" ? 0.24 : 0.12));
    gain.connect(this.context.destination);

    const oscillator = this.context.createOscillator();
    oscillator.type = name === "hurt" ? "sawtooth" : name === "ui" ? "sine" : "square";
    const frequency: Record<SoundName, number> = { step: 92, break: 150, place: 105, hurt: 210, eat: 280, ui: 440 };
    oscillator.frequency.setValueAtTime(frequency[name], now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, frequency[name] * 0.58), now + 0.12);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + (name === "hurt" ? 0.24 : 0.13));
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}

