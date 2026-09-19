import { describe, expect, it } from 'vitest';
import { clampSeekTarget } from '../../src/tracking/seek-policy';

describe('clampSeekTarget', () => {
  const state = {
    streamType: 'vod' as const,
    duration: 100,
    maxReachedTime: 40,
  };

  it('allows backward seeks and clamps forward seeks in watched mode', () => {
    expect(clampSeekTarget(10, state, 'watched', 1)).toBe(10);
    expect(clampSeekTarget(40, state, 'watched', 1)).toBe(40);
    expect(clampSeekTarget(80, state, 'watched', 1)).toBe(41);
  });

  it('allows unrestricted VOD seeks', () => {
    expect(clampSeekTarget(80, state, 'unrestricted', 1)).toBe(80);
  });

  it('does not restrict live DVR seeking', () => {
    expect(clampSeekTarget(80, { ...state, streamType: 'live' }, 'watched', 1)).toBe(80);
  });
});
