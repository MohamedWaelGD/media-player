import type Hls from 'hls.js';
import type { HlsConfig } from 'hls.js';
import { MediaPlayerError } from '../errors/media-player-error';
import { isHlsSource } from '../engines/native-engine';
import type {
  EngineErrorHandler,
  EngineMetadata,
  MediaSource,
  PlaybackEngine,
  QualityLevel,
  QualitySelection,
} from '../types/public';

export type HlsConstructor = typeof Hls;

function formatQualityLabel(
  height: number | null,
  width: number | null,
  bitrate: number | null,
  index: number,
): string {
  if (height !== null) {
    return `${height}p`;
  }
  if (width !== null) {
    return `${width}px`;
  }
  if (bitrate !== null) {
    return `${Math.round(bitrate / 1000)} kbps`;
  }
  return `Quality ${index + 1}`;
}

export class HlsEngine implements PlaybackEngine {
  readonly name = 'hls.js';
  private hls?: InstanceType<HlsConstructor>;
  private errorHandler?: EngineErrorHandler;
  private cancelLoad?: () => void;

  constructor(
    private readonly Hls: HlsConstructor,
    private readonly config?: Partial<HlsConfig>,
  ) {}

  canPlay(_video: HTMLVideoElement, source: MediaSource): boolean {
    return isHlsSource(source) && this.Hls.isSupported();
  }

  async load(
    video: HTMLVideoElement,
    source: MediaSource,
    signal?: AbortSignal,
  ): Promise<EngineMetadata> {
    this.destroy();
    if (!this.Hls.isSupported()) {
      throw new MediaPlayerError(
        'UNSUPPORTED_SOURCE',
        'HLS playback requires MediaSource Extensions or native HLS support.',
      );
    }

    const hls = new this.Hls(this.config);
    this.hls = hls;
    return new Promise<EngineMetadata>((resolve, reject) => {
      let settled = false;
      const off = (event: string, handler: (...args: never[]) => void) => {
        (
          hls as unknown as {
            off?: (name: string, callback: (...args: never[]) => void) => void;
          }
        ).off?.(event, handler);
      };
      const cleanup = () => {
        off(this.Hls.Events.ERROR, onError);
        off(this.Hls.Events.MEDIA_ATTACHED, onAttached);
        off(this.Hls.Events.LEVEL_LOADED, onLevelLoaded);
        signal?.removeEventListener('abort', abort);
        if (this.cancelLoad === abort) {
          this.cancelLoad = undefined;
        }
      };
      const abort = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(
          Object.assign(new Error('HLS media load was cancelled.'), {
            name: 'AbortError',
          }),
        );
      };
      const fail = (cause: unknown) => {
        const error =
          cause instanceof MediaPlayerError
            ? cause
            : new MediaPlayerError('LOAD_FAILED', 'The HLS stream could not be loaded.', {
                cause,
              });
        if (!settled) {
          settled = true;
          reject(error);
        } else {
          this.errorHandler?.(error);
        }
      };
      const onError = (
        _event: string,
        data: { fatal?: boolean; error?: unknown; type?: string; details?: string },
      ) => {
        if (this.hls !== hls) {
          return;
        }
        if (data.fatal) {
          fail(data);
        }
      };
      const onAttached = () => hls.loadSource(source.src);
      const onLevelLoaded = (
        _event: string,
        data: { details?: { live?: boolean }; live?: boolean },
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        this.cancelLoad = undefined;
        const streamType =
          source.streamType ?? (data.details?.live || data.live ? 'live' : 'vod');
        resolve({
          streamType,
          duration:
            streamType === 'live'
              ? null
              : Number.isFinite(video.duration)
                ? video.duration
                : null,
          qualityLevels: this.getQualityLevels(),
          quality: this.getQuality(),
        });
      };

      hls.on(this.Hls.Events.ERROR, onError);
      hls.once(this.Hls.Events.MEDIA_ATTACHED, onAttached);
      hls.once(this.Hls.Events.LEVEL_LOADED, onLevelLoaded);
      signal?.addEventListener('abort', abort, { once: true });
      this.cancelLoad = abort;
      hls.attachMedia(video);
    });
  }

  destroy(): void {
    this.cancelLoad?.();
    this.cancelLoad = undefined;
    this.hls?.destroy();
    this.hls = undefined;
  }

  getQualityLevels(): QualityLevel[] {
    return (this.hls?.levels ?? []).map((level, index) => {
      const width = Number.isFinite(level.width) ? level.width : null;
      const height = Number.isFinite(level.height) ? level.height : null;
      const bitrate = Number.isFinite(level.bitrate) ? level.bitrate : null;
      return {
        id: index,
        width,
        height,
        bitrate,
        label: formatQualityLabel(height, width, bitrate, index),
      };
    });
  }

  getQuality(): QualitySelection {
    return (this.hls?.currentLevel ?? -1) < 0
      ? 'auto'
      : (this.hls?.currentLevel ?? 'auto');
  }

  setQuality(quality: QualitySelection): void {
    if (!this.hls) {
      throw new MediaPlayerError('FEATURE_UNAVAILABLE', 'HLS quality is not available.');
    }
    this.hls.currentLevel = quality === 'auto' ? -1 : quality;
  }

  setErrorHandler(handler: EngineErrorHandler | undefined): void {
    this.errorHandler = handler;
  }
}
