import type {
  MediaSource,
  TimelineThumbnail,
  TimelineThumbnailOptions,
} from '../types/public';

interface CachedFrame {
  src: string;
  lastUsed: number;
}

function waitForEvent(
  video: HTMLVideoElement,
  eventName: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeoutMs);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Thumbnail video failed.'));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener('error', onError);
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export class GeneratedThumbnailProvider {
  private readonly options: TimelineThumbnailOptions;
  private readonly source: MediaSource;
  private readonly cache = new Map<number, CachedFrame>();
  private video?: HTMLVideoElement;
  private inFlight?: Promise<TimelineThumbnail | null>;
  private generation = 0;
  private disposed = false;

  constructor(source: MediaSource, options: TimelineThumbnailOptions) {
    this.source = source;
    this.options = options;
  }

  async get(time: number): Promise<TimelineThumbnail | null> {
    const bucket = Math.max(0, Math.round(time / 5) * 5);
    const cached = this.cache.get(bucket);
    if (cached) {
      cached.lastUsed = Date.now();
      return { kind: 'generated', time, src: cached.src, crop: null };
    }
    if (this.disposed) {
      return null;
    }
    if (this.inFlight) {
      await this.inFlight;
      return this.get(time);
    }
    const generation = this.generation;
    this.inFlight = this.capture(bucket, generation).finally(() => {
      this.inFlight = undefined;
    });
    const result = await this.inFlight;
    if (!result || generation !== this.generation) {
      return null;
    }
    return { ...result, time };
  }

  destroy(): void {
    this.disposed = true;
    this.generation += 1;
    for (const frame of this.cache.values()) {
      URL.revokeObjectURL(frame.src);
    }
    this.cache.clear();
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
      this.video = undefined;
    }
  }

  private async capture(
    bucket: number,
    generation: number,
  ): Promise<TimelineThumbnail | null> {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      return null;
    }
    try {
      const video = this.getVideo();
      if (!Number.isFinite(video.duration) || video.readyState < 1) {
        await waitForEvent(video, 'loadedmetadata', 8000);
      }
      if (
        generation !== this.generation ||
        !Number.isFinite(video.duration) ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        return null;
      }
      video.currentTime = Math.min(Math.max(bucket, 0), video.duration);
      await waitForEvent(video, 'seeked', 8000);
      if (generation !== this.generation) {
        return null;
      }

      const width = Math.min(160, video.videoWidth);
      const height = Math.max(
        1,
        Math.round((width / video.videoWidth) * video.videoHeight),
      );
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.82),
      );
      if (!blob || generation !== this.generation) {
        return null;
      }
      const src = URL.createObjectURL(blob);
      this.cache.set(bucket, { src, lastUsed: Date.now() });
      this.trimCache();
      return { kind: 'generated', time: bucket, src, crop: null };
    } catch {
      return null;
    }
  }

  private getVideo(): HTMLVideoElement {
    if (this.video) {
      return this.video;
    }
    const video = document.createElement('video');
    video.crossOrigin = this.options.crossOrigin ?? 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = this.source.src;
    video.load();
    video.style.display = 'none';
    document.body.append(video);
    this.video = video;
    return video;
  }

  private trimCache(): void {
    while (this.cache.size > 32) {
      const oldest = [...this.cache.entries()].sort(
        (left, right) => left[1].lastUsed - right[1].lastUsed,
      )[0];
      if (!oldest) {
        return;
      }
      URL.revokeObjectURL(oldest[1].src);
      this.cache.delete(oldest[0]);
    }
  }
}
