import { describe, expect, it } from 'vitest';
import { HlsEngine, type HlsConstructor } from '../../src/hls/hls-engine';

type Handler = (...args: unknown[]) => void;

class FakeHls {
  static readonly Events = {
    ERROR: 'error',
    MEDIA_ATTACHED: 'mediaAttached',
    LEVEL_LOADED: 'levelLoaded',
  };

  static isSupported(): boolean {
    return true;
  }

  readonly levels = [
    { width: 1920, height: 1080, bitrate: 5_000_000 },
    { width: 1280, height: 720, bitrate: 2_500_000 },
  ];

  currentLevel = -1;
  private readonly listeners = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): void {
    const listeners = this.listeners.get(event) ?? new Set<Handler>();
    listeners.add(handler);
    this.listeners.set(event, listeners);
  }

  once(event: string, handler: Handler): void {
    const onceHandler: Handler = (...args) => {
      this.listeners.get(event)?.delete(onceHandler);
      handler(...args);
    };
    this.on(event, onceHandler);
  }

  attachMedia(): void {
    this.emit(FakeHls.Events.MEDIA_ATTACHED, {});
    this.emit(FakeHls.Events.LEVEL_LOADED, { details: { live: false } });
  }

  loadSource(): void {}

  destroy(): void {
    this.listeners.clear();
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((handler) => handler(event, data));
  }
}

describe('HlsEngine quality levels', () => {
  it('exposes manifest resolutions and switches explicit levels', async () => {
    const engine = new HlsEngine(FakeHls as unknown as HlsConstructor);
    const metadata = await engine.load({ duration: 120 } as HTMLVideoElement, {
      src: 'https://cdn.example.test/master.m3u8',
      type: 'application/vnd.apple.mpegurl',
    });

    expect(metadata.qualityLevels).toEqual([
      {
        id: 0,
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        label: '1080p',
      },
      {
        id: 1,
        width: 1280,
        height: 720,
        bitrate: 2_500_000,
        label: '720p',
      },
    ]);
    expect(metadata.quality).toBe('auto');

    engine.setQuality(1);
    expect(engine.getQuality()).toBe(1);
    engine.setQuality('auto');
    expect(engine.getQuality()).toBe('auto');
    engine.destroy();
  });
});
