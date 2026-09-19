import { clampSeekTarget } from '../tracking/seek-policy';
import type {
  MediaSource,
  PlayerState,
  SeekPolicyOptions,
  TimelineThumbnail,
} from '../types/public';
import { GeneratedThumbnailProvider } from './generated-thumbnail-provider';
import { VttThumbnailProvider } from './vtt-thumbnail-provider';

export class ThumbnailController {
  private vtt?: VttThumbnailProvider;
  private generated?: GeneratedThumbnailProvider;
  private generation = 0;

  constructor(
    private readonly getState: () => PlayerState,
    private readonly seekPolicy: Required<SeekPolicyOptions>,
  ) {}

  reset(source?: MediaSource): void {
    this.generation += 1;
    this.vtt?.destroy();
    this.generated?.destroy();
    this.vtt = undefined;
    this.generated = undefined;
    if (!source?.thumbnails) {
      return;
    }
    const options = source.thumbnails;
    if (options.src) {
      this.vtt = new VttThumbnailProvider(options);
    }
    if (options.fallback === 'generated') {
      this.generated = new GeneratedThumbnailProvider(source, options);
    }
  }

  async get(time: number): Promise<TimelineThumbnail | null> {
    if (!Number.isFinite(time)) {
      return null;
    }
    const state = this.getState();
    if (state.streamType === 'live' || !state.duration || state.duration <= 0) {
      return null;
    }
    const effectiveTime = clampSeekTarget(
      time,
      state,
      this.seekPolicy.mode,
      this.seekPolicy.tolerance,
    );
    const generation = this.generation;
    try {
      const vttResult = await this.vtt?.get(effectiveTime);
      if (generation !== this.generation) {
        return null;
      }
      if (vttResult) {
        return { ...vttResult, time: effectiveTime };
      }
    } catch {
      // Optional preview failures must never affect playback.
    }
    try {
      const generatedResult = await this.generated?.get(effectiveTime);
      if (!generatedResult || generation !== this.generation) {
        return null;
      }
      return { ...generatedResult, time: effectiveTime };
    } catch {
      return null;
    }
  }

  destroy(): void {
    this.reset();
  }
}
