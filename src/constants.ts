import type { SeekPolicyOptions, TrackingOptions } from './types/public';

export const DEFAULT_TRACKING_OPTIONS: Required<Omit<TrackingOptions, 'initialData'>> = {
  enabled: true,
  reportInterval: 10,
  milestones: [25, 50, 75, 90, 100],
  completionThreshold: 90,
};

export const DEFAULT_SEEK_POLICY: Required<SeekPolicyOptions> = {
  mode: 'unrestricted',
  tolerance: 1,
};

export const HLS_MIME_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
]);

export const DEFAULT_VOLUME = 1;
export const DEFAULT_PLAYBACK_RATE = 1;
