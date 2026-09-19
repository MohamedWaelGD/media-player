import type { PlayerState, SeekPolicyMode } from '../types/public';

export function clampSeekTarget(
  target: number,
  state: Pick<PlayerState, 'streamType' | 'duration' | 'maxReachedTime'>,
  mode: SeekPolicyMode,
  tolerance: number,
): number {
  if (!Number.isFinite(target) || !state.duration || state.duration <= 0) {
    return target;
  }
  if (mode === 'unrestricted' || state.streamType === 'live') {
    return Math.min(Math.max(target, 0), state.duration);
  }
  const maximum = Math.min(state.duration, state.maxReachedTime + tolerance);
  return Math.min(Math.max(target, 0), maximum);
}
