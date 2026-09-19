import type { TimelineThumbnail, TimelineThumbnailOptions } from '../types/public';
import { findThumbnailCue, parseThumbnailVtt, type ThumbnailCue } from './webvtt-parser';

export class VttThumbnailProvider {
  private readonly options: TimelineThumbnailOptions;
  private controller?: AbortController;
  private cues?: ThumbnailCue[];
  private baseUrl?: string;
  private loading?: Promise<ThumbnailCue[]>;

  constructor(
    options: TimelineThumbnailOptions,
    private readonly onWarning: (error: unknown, src: string) => void,
  ) {
    this.options = options;
  }

  async get(time: number): Promise<TimelineThumbnail | null> {
    if (!this.options.src) {
      return null;
    }
    const cues = await this.load();
    const cue = findThumbnailCue(cues, time);
    return cue
      ? {
          kind: 'vtt',
          time,
          src: cue.src,
          crop: cue.crop,
        }
      : null;
  }

  destroy(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.cues = undefined;
    this.baseUrl = undefined;
    this.loading = undefined;
  }

  private async load(): Promise<ThumbnailCue[]> {
    if (this.cues) {
      return this.cues;
    }
    if (typeof fetch === 'undefined' || !this.options.src) {
      return [];
    }
    if (this.loading) {
      return this.loading;
    }
    const controller = new AbortController();
    this.controller = controller;
    const request = fetch(this.options.src, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Thumbnail VTT request failed with status ${response.status}.`);
        }
        const text = await response.text();
        this.baseUrl = response.url || this.options.src!;
        this.cues = parseThumbnailVtt(text, this.baseUrl);
        return this.cues;
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          this.onWarning(error, this.options.src!);
        }
        return [];
      });
    const loading = request.finally(() => {
      if (this.loading === loading) {
        this.loading = undefined;
      }
    });
    this.loading = loading;
    return loading;
  }
}
