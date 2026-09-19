import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailController } from '../../src/thumbnails/thumbnail-controller';
import type { PlayerState } from '../../src/types/public';

function createState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    status: 'paused',
    streamType: 'vod',
    currentTime: 0,
    duration: 10,
    volume: 1,
    muted: false,
    playbackRate: 1,
    loop: false,
    buffered: [],
    seekable: [],
    fullscreen: false,
    pictureInPicture: false,
    qualityLevels: [],
    quality: 'auto',
    atLiveEdge: false,
    secondsBehindLiveEdge: null,
    maxReachedTime: 2,
    watchedPercentage: 20,
    ...overrides,
  };
}

describe('ThumbnailController', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clamps VTT preview requests through watched-only policy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        url: 'https://cdn.example.test/lesson.vtt',
        text: () => Promise.resolve('WEBVTT\n\n00:00.000 --> 00:10.000\nframe.jpg'),
      }),
    );
    let state = createState();
    const controller = new ThumbnailController(() => state, {
      mode: 'watched',
      tolerance: 1,
    });
    controller.reset({
      src: 'https://cdn.example.test/lesson.mp4',
      thumbnails: { src: 'https://cdn.example.test/lesson.vtt' },
    });

    await expect(controller.get(9)).resolves.toMatchObject({
      kind: 'vtt',
      time: 3,
      src: 'https://cdn.example.test/frame.jpg',
    });
    state = createState({ streamType: 'live', duration: null });
    await expect(controller.get(3)).resolves.toBeNull();
    await expect(controller.get(Number.NaN)).resolves.toBeNull();
    controller.destroy();
  });
});
