import { HLS_MIME_TYPES } from '../constants';
import { MediaPlayerError } from '../errors/media-player-error';
import type { EngineMetadata, MediaSource, PlaybackEngine } from '../types/public';

function hasHlsMimeType(source: MediaSource): boolean {
  const type = source.type?.toLowerCase();
  return Boolean(
    (type && HLS_MIME_TYPES.has(type)) || /\.m3u8(?:$|[?#])/i.test(source.src),
  );
}

function getDuration(video: HTMLVideoElement): number | null {
  return Number.isFinite(video.duration) ? video.duration : null;
}

export class NativeEngine implements PlaybackEngine {
  readonly name = 'native';
  private video?: HTMLVideoElement;
  private cancelLoad?: () => void;

  canPlay(video: HTMLVideoElement, source: MediaSource): boolean {
    if (!source.type) {
      return !hasHlsMimeType(source);
    }

    const result = video.canPlayType(source.type);
    return result === 'probably' || result === 'maybe';
  }

  async load(
    video: HTMLVideoElement,
    source: MediaSource,
    signal?: AbortSignal,
  ): Promise<EngineMetadata> {
    this.destroy();
    this.video = video;
    video.pause();
    video.removeAttribute('src');
    video.load();

    const metadata = await new Promise<EngineMetadata>((resolve, reject) => {
      let settled = false;
      const abort = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(
          Object.assign(new Error('Native media load was cancelled.'), {
            name: 'AbortError',
          }),
        );
      };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
        signal?.removeEventListener('abort', abort);
        if (this.cancelLoad === abort) {
          this.cancelLoad = undefined;
        }
      };
      const onLoadedMetadata = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve({
          streamType: source.streamType ?? (video.duration === Infinity ? 'live' : 'vod'),
          duration: getDuration(video),
        });
      };
      const onError = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(
          new MediaPlayerError(
            'LOAD_FAILED',
            `The browser could not load media source: ${source.src}.`,
          ),
        );
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('error', onError);
      signal?.addEventListener('abort', abort, { once: true });
      this.cancelLoad = abort;
      video.src = source.src;
      video.load();

      if (video.readyState >= 1) {
        onLoadedMetadata();
      }
    });

    return metadata;
  }

  destroy(): void {
    this.cancelLoad?.();
    this.cancelLoad = undefined;
    if (!this.video) {
      return;
    }
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video = undefined;
  }
}

export function isHlsSource(source: MediaSource): boolean {
  return hasHlsMimeType(source);
}
