import { DEFAULT_PLAYBACK_RATE } from '../constants';
import { EventEmitter } from '../events/event-emitter';
import { MediaPlayerError } from '../errors/media-player-error';
import { NativeEngine } from '../engines/native-engine';
import { PluginManager } from '../plugins/plugin-manager';
import { StateStore } from './state-store';
import {
  validateOptions,
  validateSource,
  type ValidatedOptions,
} from './validate-options';
import { clampSeekTarget } from '../tracking/seek-policy';
import { TrackingEngine } from '../tracking/tracking-engine';
import { ThumbnailController } from '../thumbnails/thumbnail-controller';
import { ChapterController } from '../chapters/chapter-controller';
import type {
  MediaPlayerOptions,
  MediaSource,
  Player,
  PlayerEventHandler,
  PlayerEventName,
  PlayerState,
  PlaybackEngine,
  QualityLevel,
  QualitySelection,
  TrackingData,
  TimeRange,
  TimelineThumbnail,
  Chapter,
} from '../types/public';

function rangesFromTimeRanges(ranges: TimeRanges): TimeRange[] {
  const result: TimeRange[] = [];
  for (let index = 0; index < ranges.length; index += 1) {
    result.push({ start: ranges.start(index), end: ranges.end(index) });
  }
  return result;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function isFullscreenTarget(element: HTMLElement): boolean {
  const root = element.getRootNode() as Document | ShadowRoot;
  if ('fullscreenElement' in root && root.fullscreenElement === element) {
    return true;
  }
  const documentFullscreenElement = element.ownerDocument.fullscreenElement;
  return (
    documentFullscreenElement === element ||
    (typeof ShadowRoot !== 'undefined' &&
      root instanceof ShadowRoot &&
      documentFullscreenElement === root.host)
  );
}

export class MediaPlayer implements Player {
  readonly video: HTMLVideoElement;

  private readonly options: ValidatedOptions;
  private readonly fullscreenElement: HTMLElement;
  private readonly events = new EventEmitter();
  private readonly state: StateStore;
  private readonly tracker: TrackingEngine;
  private readonly thumbnails: ThumbnailController;
  private readonly chapters: ChapterController;
  private readonly plugins = new PluginManager();
  private readonly mediaListeners: Array<() => void> = [];
  private readonly engines: PlaybackEngine[];
  private engine?: PlaybackEngine;
  private currentSource?: MediaSource;
  private pendingSeek?: { from: number; to: number };
  private correctingSeek = false;
  private lastReportTime = 0;
  private loadId = 0;
  private destroyed = false;

  constructor(target: HTMLVideoElement | string, options: MediaPlayerOptions = {}) {
    this.video = this.resolveTarget(target);
    this.options = validateOptions(options);
    this.fullscreenElement = options.fullscreenElement ?? this.video;
    this.tracker = new TrackingEngine(this.options.tracking);
    this.engines = this.createEngines();
    this.state = new StateStore({
      status: 'idle',
      streamType: 'vod',
      currentTime: 0,
      duration: null,
      volume: this.video.volume,
      muted: this.video.muted,
      playbackRate: this.video.playbackRate || DEFAULT_PLAYBACK_RATE,
      loop: this.video.loop,
      buffered: [],
      seekable: [],
      fullscreen: false,
      pictureInPicture: false,
      qualityLevels: [],
      quality: 'auto',
      atLiveEdge: false,
      secondsBehindLiveEdge: null,
      maxReachedTime: 0,
      watchedPercentage: null,
    });
    this.thumbnails = new ThumbnailController(
      () => this.state.get(),
      this.options.seekPolicy,
    );
    this.chapters = new ChapterController((chapters) => {
      this.events.emit('chapters-change', { chapters });
    });

    this.attachMediaListeners();
    this.plugins.setup(this.options.plugins, this);

    if (this.options.source) {
      void this.load(this.options.source).catch(() => undefined);
    }
  }

  async load(source: MediaSource): Promise<void> {
    this.assertUsable();
    validateSource(source);
    const id = ++this.loadId;

    this.engine?.destroy();
    this.engine = undefined;
    this.thumbnails.reset(source);
    this.chapters.reset(source);
    this.currentSource = source;
    this.pendingSeek = undefined;
    this.lastReportTime = 0;
    this.state.update({
      status: 'loading',
      currentTime: 0,
      duration: null,
      streamType: source.streamType ?? 'vod',
      buffered: [],
      seekable: [],
      atLiveEdge: false,
      secondsBehindLiveEdge: null,
      qualityLevels: [],
      quality: 'auto',
      maxReachedTime: 0,
      watchedPercentage: null,
    });
    this.events.emit('load-start', { source });

    if (source.poster !== undefined) {
      this.video.poster = source.poster;
    }
    this.syncCaptionTracks(source.captions ?? []);

    const engine = this.engines.find((candidate) =>
      candidate.canPlay(this.video, source),
    );
    if (!engine) {
      const error = new MediaPlayerError(
        'UNSUPPORTED_SOURCE',
        `No playback engine supports source: ${source.src}.`,
      );
      this.handleError(error);
      throw error;
    }

    this.engine = engine;
    engine.setErrorHandler?.((error: unknown) => this.handleError(error));

    try {
      const metadata = await engine.load(this.video, source);
      if (id !== this.loadId || this.destroyed) {
        return;
      }

      const duration = metadata.streamType === 'live' ? null : metadata.duration;
      const numericDuration = duration ?? 0;
      this.tracker.reset(numericDuration, source.id, this.options.tracking.initialData);
      this.video.autoplay = this.options.autoplay;
      this.state.update({
        status: this.video.paused ? 'paused' : 'playing',
        streamType: metadata.streamType,
        duration,
        qualityLevels: metadata.qualityLevels ?? engine.getQualityLevels?.() ?? [],
        quality: metadata.quality ?? engine.getQuality?.() ?? 'auto',
        currentTime: Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0,
        maxReachedTime: this.tracker.getData(this.video.currentTime)?.maxReachedTime ?? 0,
        watchedPercentage: this.tracker.getWatchedPercentage(),
      });
      this.events.emit('loaded', {
        source,
        streamType: metadata.streamType,
        duration,
      });

      if (this.options.autoplay) {
        await this.play();
      }
    } catch (cause) {
      if (id !== this.loadId || this.destroyed) {
        return;
      }
      const error =
        cause instanceof MediaPlayerError
          ? cause
          : new MediaPlayerError('LOAD_FAILED', 'The media source could not be loaded.', {
              cause,
            });
      this.handleError(error);
      throw error;
    }
  }

  async play(): Promise<void> {
    this.assertUsable();
    try {
      await this.video.play();
    } catch (cause) {
      const error = new MediaPlayerError(
        'PLAYBACK_FAILED',
        'The browser rejected the playback request.',
        { cause },
      );
      this.handleError(error);
      throw error;
    }
  }

  private syncCaptionTracks(captions: NonNullable<MediaSource['captions']>): void {
    this.video
      .querySelectorAll<HTMLTrackElement>('track[data-media-player-caption]')
      .forEach((track) => track.remove());
    captions.forEach((caption, index) => {
      const track = this.video.ownerDocument.createElement('track');
      track.dataset.mediaPlayerCaption = 'true';
      track.kind = caption.kind ?? 'subtitles';
      track.src = caption.src;
      track.srclang = caption.srclang ?? '';
      track.label = caption.label ?? caption.srclang ?? `Caption ${index + 1}`;
      track.default = caption.default ?? false;
      this.video.append(track);
      if (track.default) {
        track.track.mode = 'showing';
      }
    });
  }

  pause(): void {
    this.assertUsable();
    this.video.pause();
  }

  seek(time: number): void {
    this.assertUsable();
    if (!Number.isFinite(time)) {
      throw new MediaPlayerError('INVALID_OPTIONS', 'Seek time must be finite.');
    }
    const currentState = this.state.get();
    const target = clampSeekTarget(
      time,
      currentState,
      this.options.seekPolicy.mode,
      this.options.seekPolicy.tolerance,
    );
    if (target > time + Number.EPSILON) {
      return;
    }
    this.video.currentTime = target;
  }

  setVolume(volume: number): void {
    this.assertUsable();
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
      throw new MediaPlayerError(
        'INVALID_OPTIONS',
        'Volume must be a number from 0 to 1.',
      );
    }
    this.video.volume = volume;
    this.state.update({ volume });
  }

  setMuted(muted: boolean): void {
    this.assertUsable();
    if (typeof muted !== 'boolean') {
      throw new MediaPlayerError('INVALID_OPTIONS', 'Muted must be a boolean.');
    }
    this.video.muted = muted;
    this.state.update({ muted });
  }

  setPlaybackRate(rate: number): void {
    this.assertUsable();
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new MediaPlayerError(
        'INVALID_OPTIONS',
        'Playback rate must be a finite number greater than zero.',
      );
    }
    this.video.playbackRate = rate;
    this.state.update({ playbackRate: rate });
  }

  setLoop(loop: boolean): void {
    this.assertUsable();
    if (typeof loop !== 'boolean') {
      throw new MediaPlayerError('INVALID_OPTIONS', 'Loop must be a boolean.');
    }
    this.video.loop = loop;
    this.state.update({ loop });
  }

  getQualityLevels(): QualityLevel[] {
    return this.state.get().qualityLevels;
  }

  setQuality(quality: QualitySelection): void {
    this.assertUsable();
    const levels = this.state.get().qualityLevels;
    if (
      quality !== 'auto' &&
      (!Number.isInteger(quality) || !levels.some((level) => level.id === quality))
    ) {
      throw new MediaPlayerError(
        'INVALID_OPTIONS',
        'Quality must be auto or an available level.',
      );
    }
    if (!this.engine?.setQuality) {
      throw new MediaPlayerError(
        'FEATURE_UNAVAILABLE',
        'Adaptive quality is not available for this source.',
      );
    }
    this.engine.setQuality(quality);
    this.state.update({ quality });
    this.events.emit('quality-change', { quality, levels });
  }

  setPictureInPictureState(pictureInPicture: boolean): void {
    this.assertUsable();
    if (this.state.get().pictureInPicture === pictureInPicture) {
      return;
    }
    this.state.update({ pictureInPicture });
    this.events.emit('picture-in-picture-change', { pictureInPicture });
  }

  async getTimelineThumbnail(time: number): Promise<TimelineThumbnail | null> {
    this.assertUsable();
    return this.thumbnails.get(time);
  }

  getChapters(): Chapter[] {
    return this.chapters.get();
  }

  async enterFullscreen(): Promise<void> {
    this.assertUsable();
    if (!this.fullscreenElement.requestFullscreen) {
      throw new MediaPlayerError(
        'FEATURE_UNAVAILABLE',
        'Fullscreen is not supported by this browser.',
      );
    }
    if (isFullscreenTarget(this.fullscreenElement)) {
      this.syncFullscreenState();
      return;
    }
    await this.fullscreenElement.requestFullscreen();
    this.syncFullscreenState();
  }

  async exitFullscreen(): Promise<void> {
    this.assertUsable();
    const ownerDocument = this.fullscreenElement.ownerDocument;
    if (!ownerDocument.exitFullscreen) {
      throw new MediaPlayerError(
        'FEATURE_UNAVAILABLE',
        'Fullscreen is not supported by this browser.',
      );
    }
    if (!isFullscreenTarget(this.fullscreenElement)) {
      this.syncFullscreenState();
      return;
    }
    const change = new Promise<void>((resolve) => {
      if (!isFullscreenTarget(this.fullscreenElement)) {
        resolve();
        return;
      }
      ownerDocument.addEventListener('fullscreenchange', () => resolve(), {
        once: true,
      });
    });
    await ownerDocument.exitFullscreen();
    await change;
    this.syncFullscreenState();
  }

  async enterPictureInPicture(): Promise<void> {
    this.assertUsable();
    const request = (
      this.video as HTMLVideoElement & {
        requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
      }
    ).requestPictureInPicture;
    if (!request) {
      throw new MediaPlayerError(
        'FEATURE_UNAVAILABLE',
        'Picture-in-picture is not supported by this browser.',
      );
    }
    await request.call(this.video);
  }

  async exitPictureInPicture(): Promise<void> {
    this.assertUsable();
    const exit =
      typeof document === 'undefined'
        ? undefined
        : (document as Document & { exitPictureInPicture?: () => Promise<void> })
            .exitPictureInPicture;
    if (!exit) {
      throw new MediaPlayerError(
        'FEATURE_UNAVAILABLE',
        'Picture-in-picture is not supported by this browser.',
      );
    }
    await exit.call(document);
  }

  getState(): PlayerState {
    return this.state.get();
  }

  getTrackingData(): TrackingData | null {
    if (!this.options.tracking.enabled) {
      return null;
    }
    return this.tracker.getData(this.video.currentTime);
  }

  restoreTrackingData(data: TrackingData): void {
    this.assertUsable();
    if (!this.options.tracking.enabled) {
      return;
    }
    this.tracker.restore(data);
    const state = this.state.get();
    if (state.duration && Number.isFinite(data.currentTime)) {
      this.video.currentTime = Math.min(Math.max(data.currentTime, 0), state.duration);
      this.tracker.markSeek(this.video.currentTime);
    }
    this.updateTrackingState();
  }

  on<K extends PlayerEventName>(event: K, handler: PlayerEventHandler<K>): () => void {
    return this.events.on(event, handler);
  }

  subscribe(handler: (state: PlayerState) => void): () => void {
    return this.state.subscribe(handler);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const removeListener of this.mediaListeners.splice(0)) {
      removeListener();
    }
    this.plugins.destroy();
    this.engine?.destroy();
    this.engine = undefined;
    this.thumbnails.destroy();
    this.chapters.destroy();
    this.events.emit('destroy', undefined);
    this.events.clear();
    this.state.clear();
  }

  private createEngines() {
    return [new NativeEngine(), ...this.options.engines];
  }

  private resolveTarget(target: HTMLVideoElement | string): HTMLVideoElement {
    if (typeof target !== 'string') {
      if (typeof HTMLVideoElement !== 'undefined' && target instanceof HTMLVideoElement) {
        return target;
      }
      throw new MediaPlayerError('INVALID_TARGET', 'Target must be an HTMLVideoElement.');
    }
    if (typeof document === 'undefined') {
      throw new MediaPlayerError(
        'INVALID_TARGET',
        'A selector target can only be resolved in a browser document.',
      );
    }
    const element = document.querySelector(target);
    if (!(element instanceof HTMLVideoElement)) {
      throw new MediaPlayerError(
        'INVALID_TARGET',
        `Selector did not resolve to an HTMLVideoElement: ${target}.`,
      );
    }
    return element;
  }

  private attachMediaListeners(): void {
    this.listen('play', () => {
      this.state.update({ status: 'playing' });
      this.events.emit('play', { currentTime: this.video.currentTime });
    });
    this.listen('pause', () => {
      if (!this.video.ended) {
        this.state.update({ status: 'paused' });
      }
      this.events.emit('pause', { currentTime: this.video.currentTime });
    });
    this.listen('waiting', () => {
      this.state.update({ status: 'buffering' });
      this.events.emit('buffer-start', { currentTime: this.video.currentTime });
    });
    this.listen('stalled', () => {
      this.state.update({ status: 'buffering' });
      this.events.emit('buffer-start', { currentTime: this.video.currentTime });
    });
    this.listen('playing', () => {
      this.state.update({ status: 'playing' });
      this.events.emit('buffer-end', { currentTime: this.video.currentTime });
    });
    this.listen('canplay', () => {
      if (!this.video.paused) {
        this.state.update({ status: 'playing' });
        this.events.emit('buffer-end', { currentTime: this.video.currentTime });
      }
    });
    this.listen('loadedmetadata', () => this.updateMetadata());
    this.listen('durationchange', () => this.updateMetadata());
    this.listen('timeupdate', () => this.handleTimeUpdate());
    this.listen('progress', () => this.updateBufferedRanges());
    this.listen('seeking', () => this.handleSeeking());
    this.listen('seeked', () => this.handleSeeked());
    this.listen('ended', () => this.handleEnded());
    this.listen('error', () => {
      this.handleError(
        new MediaPlayerError('LOAD_FAILED', 'The video element reported an error.'),
      );
    });
    this.listen('volumechange', () => {
      const volume = Number.isFinite(this.video.volume) ? this.video.volume : 1;
      this.state.update({ volume, muted: this.video.muted });
      this.events.emit('volume-change', { volume, muted: this.video.muted });
    });
    this.listen('ratechange', () => {
      this.state.update({ playbackRate: this.video.playbackRate });
      this.events.emit('speed-change', { playbackRate: this.video.playbackRate });
    });
    this.listenCustom('enterpictureinpicture', () => {
      this.state.update({ pictureInPicture: true });
      this.events.emit('picture-in-picture-change', { pictureInPicture: true });
    });
    this.listenCustom('leavepictureinpicture', () => {
      this.state.update({ pictureInPicture: false });
      this.events.emit('picture-in-picture-change', { pictureInPicture: false });
    });
    const ownerDocument = this.fullscreenElement.ownerDocument;
    if (ownerDocument) {
      const onFullscreenChange = () => {
        this.syncFullscreenState();
      };
      ownerDocument.addEventListener('fullscreenchange', onFullscreenChange);
      this.mediaListeners.push(() =>
        ownerDocument.removeEventListener('fullscreenchange', onFullscreenChange),
      );
    }
  }

  private listen<K extends keyof HTMLMediaElementEventMap>(
    event: K,
    handler: (event: HTMLMediaElementEventMap[K]) => void,
  ): void {
    this.video.addEventListener(event, handler as EventListener);
    this.mediaListeners.push(() =>
      this.video.removeEventListener(event, handler as EventListener),
    );
  }

  private listenCustom(event: string, handler: EventListener): void {
    this.video.addEventListener(event, handler);
    this.mediaListeners.push(() => this.video.removeEventListener(event, handler));
  }

  private updateMetadata(): void {
    const state = this.state.get();
    const streamType = state.streamType;
    const duration = streamType === 'live' ? null : finiteOrNull(this.video.duration);
    if (duration !== null && duration !== state.duration) {
      this.tracker.reset(
        duration,
        this.currentSource?.id,
        this.options.tracking.initialData,
      );
    }
    this.state.update({
      duration,
      watchedPercentage: this.tracker.getWatchedPercentage(),
    });
    this.updateBufferedRanges();
  }

  private updateBufferedRanges(): void {
    const state = this.state.get();
    const seekable = rangesFromTimeRanges(this.video.seekable);
    const buffered = rangesFromTimeRanges(this.video.buffered);
    const liveEnd = seekable.at(-1)?.end;
    const secondsBehindLiveEdge =
      state.streamType === 'live' && liveEnd !== undefined
        ? Math.max(0, liveEnd - this.video.currentTime)
        : null;
    this.state.update({
      buffered,
      seekable,
      atLiveEdge: secondsBehindLiveEdge !== null && secondsBehindLiveEdge < 3,
      secondsBehindLiveEdge,
    });
  }

  private handleTimeUpdate(): void {
    const playing = !this.video.paused && !this.video.ended;
    const update = this.options.tracking.enabled
      ? this.tracker.observePlayback(this.video.currentTime, playing)
      : { milestones: [], completed: false };
    this.updateTrackingState();

    for (const milestone of update.milestones) {
      this.events.emit('milestone', {
        milestone,
        watchedPercentage: this.tracker.getWatchedPercentage() ?? 0,
      });
    }
    if (update.completed) {
      const data = this.getTrackingData();
      if (data) {
        this.events.emit('completed', data);
      }
    }

    const currentTime = this.video.currentTime;
    if (
      this.options.tracking.enabled &&
      (currentTime - this.lastReportTime >= this.options.tracking.reportInterval ||
        currentTime < this.lastReportTime)
    ) {
      const data = this.getTrackingData();
      if (data) {
        this.events.emit('tracking-report', data);
      }
      this.lastReportTime = currentTime;
    }
    this.events.emit('progress', {
      currentTime,
      duration: this.state.get().duration,
      watchedPercentage: this.tracker.getWatchedPercentage(),
      watchedSeconds: this.tracker.getData(currentTime)?.watchedSeconds ?? 0,
    });
  }

  private handleSeeking(): void {
    if (this.correctingSeek) {
      return;
    }
    const state = this.state.get();
    const requested = this.video.currentTime;
    const from = state.currentTime;
    const allowed = clampSeekTarget(
      requested,
      state,
      this.options.seekPolicy.mode,
      this.options.seekPolicy.tolerance,
    );
    if (allowed < requested - Number.EPSILON) {
      this.correctingSeek = true;
      try {
        this.video.currentTime = allowed;
      } finally {
        this.correctingSeek = false;
      }
      this.events.emit('seek-blocked', { from, to: allowed, requested, allowed });
    }
    this.pendingSeek = { from, to: allowed };
    this.tracker.markSeek(allowed);
    this.events.emit('seek-start', { from, to: allowed });
  }

  private handleSeeked(): void {
    const currentTime = this.video.currentTime;
    const seek = this.pendingSeek ?? {
      from: this.state.get().currentTime,
      to: currentTime,
    };
    this.pendingSeek = undefined;
    this.tracker.markSeek(currentTime);
    this.state.update({ currentTime });
    this.events.emit('seek-end', { from: seek.from, to: currentTime });
  }

  private handleEnded(): void {
    const currentTime = this.video.currentTime;
    if (this.options.tracking.enabled) {
      const update = this.tracker.observePlayback(currentTime, true);
      this.updateTrackingState();
      for (const milestone of update.milestones) {
        this.events.emit('milestone', {
          milestone,
          watchedPercentage: this.tracker.getWatchedPercentage() ?? 0,
        });
      }
      if (update.completed) {
        const data = this.getTrackingData();
        if (data) {
          this.events.emit('completed', data);
        }
      }
    }
    this.state.update({ status: 'ended', currentTime });
    this.events.emit('ended', { currentTime });
  }

  private updateTrackingState(): void {
    this.state.update({
      currentTime: Number.isFinite(this.video.currentTime) ? this.video.currentTime : 0,
      maxReachedTime: this.options.tracking.enabled
        ? (this.tracker.getData(this.video.currentTime)?.maxReachedTime ?? 0)
        : 0,
      watchedPercentage: this.options.tracking.enabled
        ? this.tracker.getWatchedPercentage()
        : null,
    });
  }

  private syncFullscreenState(): void {
    const fullscreen = isFullscreenTarget(this.fullscreenElement);
    if (fullscreen === this.state.get().fullscreen) {
      return;
    }
    this.state.update({ fullscreen });
    this.events.emit('fullscreen-change', { fullscreen });
  }

  private handleError(error: unknown): void {
    if (this.destroyed) {
      return;
    }
    this.state.update({ status: 'error' });
    this.events.emit('error', { error });
  }

  private assertUsable(): void {
    if (this.destroyed) {
      throw new MediaPlayerError('DESTROYED', 'This media player has been destroyed.');
    }
  }
}
