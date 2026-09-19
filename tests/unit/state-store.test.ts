import { describe, expect, it } from 'vitest';
import { StateStore } from '../../src/player/state-store';
import type { PlayerState } from '../../src/types/public';

const createState = (): PlayerState => ({
  status: 'idle',
  streamType: 'vod',
  currentTime: 0,
  duration: 10,
  volume: 1,
  muted: false,
  playbackRate: 1,
  loop: false,
  buffered: [{ start: 0, end: 1 }],
  seekable: [{ start: 0, end: 10 }],
  fullscreen: false,
  pictureInPicture: false,
  qualityLevels: [{ id: 1, width: 1920, height: 1080, bitrate: 1000, label: '1080p' }],
  quality: 'auto',
  atLiveEdge: false,
  secondsBehindLiveEdge: null,
  maxReachedTime: 0,
  watchedPercentage: 0,
});

describe('StateStore', () => {
  it('does not expose mutable nested state', () => {
    const store = new StateStore(createState());
    const state = store.get();

    state.buffered[0]!.end = 99;
    state.seekable[0]!.end = 99;
    state.qualityLevels[0]!.label = 'changed';

    expect(store.get()).toMatchObject({
      buffered: [{ end: 1 }],
      seekable: [{ end: 10 }],
      qualityLevels: [{ label: '1080p' }],
    });
  });

  it('gives subscribers independent snapshots', () => {
    const store = new StateStore(createState());
    let first: PlayerState | undefined;
    let second: PlayerState | undefined;
    store.subscribe((state) => {
      first = state;
      state.qualityLevels[0]!.label = 'mutated';
    });
    store.subscribe((state) => {
      second = state;
    });

    store.update({ currentTime: 1 });

    expect(first).not.toBe(second);
    expect(second?.qualityLevels[0]?.label).toBe('1080p');
  });
});
