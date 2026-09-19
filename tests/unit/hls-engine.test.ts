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

  static autoComplete = true;
  static instances: FakeHls[] = [];

  readonly levels = [
    { width: 1920, height: 1080, bitrate: 5_000_000 },
    { width: 1280, height: 720, bitrate: 2_500_000 },
  ];

  currentLevel = -1;
  startLoadCalls = 0;
  recoverMediaErrorCalls = 0;
  private readonly listeners = new Map<string, Set<Handler>>();

  constructor() {
    FakeHls.instances.push(this);
  }

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
    if (FakeHls.autoComplete) {
      this.emit(FakeHls.Events.LEVEL_LOADED, { details: { live: false } });
    }
  }

  loadSource(): void {}

  startLoad(): void {
    this.startLoadCalls += 1;
  }

  recoverMediaError(): void {
    this.recoverMediaErrorCalls += 1;
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler);
  }

  destroy(): void {
    this.listeners.clear();
  }

  emit(event: string, data: unknown): void {
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

describe('HlsEngine errors and cancellation', () => {
  it('preserves fatal HLS error data as the load failure cause', async () => {
    FakeHls.autoComplete = false;
    FakeHls.instances.length = 0;
    const engine = new HlsEngine(FakeHls as unknown as HlsConstructor);
    const load = engine.load({ duration: 120 } as HTMLVideoElement, {
      src: 'https://cdn.example.test/master.m3u8',
      type: 'application/vnd.apple.mpegurl',
    });
    const hls = FakeHls.instances[0]!;
    hls.emit(FakeHls.Events.ERROR, {
      fatal: true,
      type: 'networkError',
      details: 'manifestLoadError',
      error: new Error('network'),
    });

    await expect(load).rejects.toMatchObject({
      code: 'LOAD_FAILED',
      cause: { type: 'networkError', details: 'manifestLoadError' },
    });
    engine.destroy();
    FakeHls.autoComplete = true;
  });

  it('cancels a pending load when destroyed', async () => {
    FakeHls.autoComplete = false;
    FakeHls.instances.length = 0;
    const engine = new HlsEngine(FakeHls as unknown as HlsConstructor);
    const load = engine.load({ duration: 120 } as HTMLVideoElement, {
      src: 'https://cdn.example.test/master.m3u8',
      type: 'application/vnd.apple.mpegurl',
    });

    engine.destroy();

    await expect(load).rejects.toMatchObject({ name: 'AbortError' });
    FakeHls.autoComplete = true;
  });
});
