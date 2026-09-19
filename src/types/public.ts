export type PlayerStatus =
  'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export type StreamType = 'vod' | 'live';

export type ThumbnailFallback = 'none' | 'generated';
export type ThumbnailCrossOrigin = 'anonymous' | 'use-credentials';

export interface TimelineThumbnailOptions {
  /** URL of a WebVTT file containing image or sprite cues. */
  src?: string;
  /** Use a hidden video and canvas when a VTT cue is unavailable. */
  fallback?: ThumbnailFallback;
  /** CORS mode for generated frame extraction. */
  crossOrigin?: ThumbnailCrossOrigin;
}

export interface TimelineThumbnailCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TimelineThumbnail {
  kind: 'vtt' | 'generated';
  time: number;
  src: string;
  crop: TimelineThumbnailCrop | null;
}

export interface MediaSource {
  /** Optional stable identifier used to match persisted tracking data. */
  id?: string;
  src: string;
  /** MIME type, for example video/mp4 or application/vnd.apple.mpegurl. */
  type?: string;
  poster?: string;
  streamType?: StreamType;
  thumbnails?: TimelineThumbnailOptions;
  captions?: CaptionTrack[];
  chapters?: Chapter[];
  chapterTrack?: ChapterTrack;
}

export interface CaptionTrack {
  src: string;
  kind?: 'subtitles' | 'captions' | 'descriptions' | 'metadata';
  srclang?: string;
  label?: string;
  default?: boolean;
}

export interface Chapter {
  id?: string;
  title: string;
  startTime: number;
  endTime: number;
}

export interface ChapterTrack {
  src: string;
  srclang?: string;
  label?: string;
}

export type CaptionColor =
  | '#ffffff'
  | '#000000'
  | '#ff0000'
  | '#00ff00'
  | '#0000ff'
  | '#ffff00'
  | '#ff00ff'
  | '#00ffff';

export type CaptionFontFamily =
  | 'monospaced-serif'
  | 'proportional-serif'
  | 'monospaced-sans-serif'
  | 'proportional-sans-serif'
  | 'casual'
  | 'cursive'
  | 'small-capitals';

export type CaptionEdgeStyle =
  'none' | 'drop-shadow' | 'raised' | 'depressed' | 'outline';

export interface CaptionPosition {
  /** Normalized horizontal center and caption-bottom anchor within the displayed video. */
  x: number;
  y: number;
}

export interface CaptionPreferences {
  textColor: CaptionColor;
  textOpacity: number;
  backgroundColor: CaptionColor;
  backgroundOpacity: number;
  fontSize: number;
  edgeStyle: CaptionEdgeStyle;
  fontFamily: CaptionFontFamily;
  position: CaptionPosition;
}

export type CaptionPreferencePatch = Partial<Omit<CaptionPreferences, 'position'>> & {
  position?: Partial<CaptionPosition>;
};

export interface CaptionPreferencesChangeDetail {
  preferences: CaptionPreferences;
}

export interface TimeRange {
  start: number;
  end: number;
}

export interface PlayerState {
  status: PlayerStatus;
  streamType: StreamType;
  currentTime: number;
  duration: number | null;
  volume: number;
  muted: boolean;
  playbackRate: number;
  loop: boolean;
  buffered: TimeRange[];
  seekable: TimeRange[];
  fullscreen: boolean;
  pictureInPicture: boolean;
  qualityLevels: QualityLevel[];
  quality: QualitySelection;
  atLiveEdge: boolean;
  secondsBehindLiveEdge: number | null;
  maxReachedTime: number;
  watchedPercentage: number | null;
}

export interface TrackingData {
  version: 1;
  sourceId?: string;
  duration: number;
  currentTime: number;
  maxReachedTime: number;
  watchedSeconds: number;
  watchedPercentage: number;
  completed: boolean;
  ranges: TimeRange[];
  reachedMilestones: number[];
}

export interface TrackingOptions {
  enabled?: boolean;
  reportInterval?: number;
  milestones?: number[];
  completionThreshold?: number;
  initialData?: TrackingData;
}

export type SeekPolicyMode = 'unrestricted' | 'watched';

export interface SeekPolicyOptions {
  mode?: SeekPolicyMode;
  tolerance?: number;
}

export interface EngineMetadata {
  streamType: StreamType;
  duration: number | null;
  qualityLevels?: QualityLevel[];
  quality?: QualitySelection;
}

export interface QualityLevel {
  id: number;
  width: number | null;
  height: number | null;
  bitrate: number | null;
  label: string;
}

export type QualitySelection = 'auto' | number;

export type EngineErrorHandler = (error: unknown) => void;

export interface PlaybackEngine {
  readonly name: string;
  canPlay(video: HTMLVideoElement, source: MediaSource): boolean;
  load(
    video: HTMLVideoElement,
    source: MediaSource,
    signal?: AbortSignal,
  ): Promise<EngineMetadata>;
  destroy(): void;
  setErrorHandler?(handler: EngineErrorHandler | undefined): void;
  getQualityLevels?(): QualityLevel[];
  getQuality?(): QualitySelection;
  setQuality?(quality: QualitySelection): void;
}

export interface ProgressEvent {
  currentTime: number;
  duration: number | null;
  watchedPercentage: number | null;
  watchedSeconds: number;
}

export interface SeekEvent {
  from: number;
  to: number;
}

export interface SeekBlockedEvent extends SeekEvent {
  requested: number;
  allowed: number;
}

export interface MilestoneEvent {
  milestone: number;
  watchedPercentage: number;
}

export interface ErrorEvent {
  error: unknown;
}

export type PlayerWarning =
  | {
      kind: 'resource';
      resource: 'chapters' | 'thumbnail-vtt' | 'thumbnail-generated' | 'engine';
      src?: string;
      error: unknown;
    }
  | {
      kind: 'plugin';
      plugin: string;
      phase: 'setup' | 'cleanup';
      error: unknown;
    };

export interface PlayerEventMap {
  'load-start': { source: MediaSource };
  loaded: { source: MediaSource; streamType: StreamType; duration: number | null };
  'chapters-change': { chapters: Chapter[] };
  play: { currentTime: number };
  pause: { currentTime: number };
  'buffer-start': { currentTime: number };
  'buffer-end': { currentTime: number };
  'seek-start': SeekEvent;
  'seek-end': SeekEvent;
  'seek-blocked': SeekBlockedEvent;
  progress: ProgressEvent;
  'tracking-report': TrackingData;
  'volume-change': { volume: number; muted: boolean };
  'speed-change': { playbackRate: number };
  'fullscreen-change': { fullscreen: boolean };
  'picture-in-picture-change': { pictureInPicture: boolean };
  'quality-change': { quality: QualitySelection; levels: QualityLevel[] };
  milestone: MilestoneEvent;
  completed: TrackingData;
  ended: { currentTime: number };
  error: ErrorEvent;
  warning: PlayerWarning;
  destroy: undefined;
}

export type PlayerEventName = keyof PlayerEventMap;
export type PlayerEventHandler<K extends PlayerEventName> = (
  event: PlayerEventMap[K],
) => void;

export interface PlayerPlugin {
  name: string;
  setup(player: Player): void | (() => void);
}

export interface Player {
  load(source: MediaSource): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setPlaybackRate(rate: number): void;
  setLoop(loop: boolean): void;
  getQualityLevels(): QualityLevel[];
  setQuality(quality: QualitySelection): void;
  getTimelineThumbnail(time: number): Promise<TimelineThumbnail | null>;
  getChapters(): Chapter[];
  enterFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  enterPictureInPicture(): Promise<void>;
  exitPictureInPicture(): Promise<void>;
  getState(): PlayerState;
  getTrackingData(): TrackingData | null;
  restoreTrackingData(data: TrackingData): void;
  on<K extends PlayerEventName>(event: K, handler: PlayerEventHandler<K>): () => void;
  subscribe(handler: (state: PlayerState) => void): () => void;
  destroy(): void;
}

export interface MediaPlayerOptions {
  source?: MediaSource;
  autoplay?: boolean;
  /** Element to fullscreen when custom controls live outside the video element. */
  fullscreenElement?: HTMLElement;
  engines?: PlaybackEngine[];
  tracking?: TrackingOptions;
  seekPolicy?: SeekPolicyOptions;
  plugins?: PlayerPlugin[];
}

export interface MediaPlayerElementOptions {
  tagName?: string;
}

export interface MediaPlayerChangeDetail {
  player: Player | null;
}
