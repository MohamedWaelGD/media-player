import type { TimelineThumbnail, TimelineThumbnailOptions } from '../types/public';
import { findThumbnailCue, parseThumbnailVtt, type ThumbnailCue } from './webvtt-parser';

export class VttThumbnailProvider {
  private readonly options: TimelineThumbnailOptions;
  private controller?: AbortController;
  private cues?: ThumbnailCue[];
  private baseUrl?: string;

  constructor(options: TimelineThumbnailOptions) {
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
  }

  private async load(): Promise<ThumbnailCue[]> {
    if (this.cues) {
      return this.cues;
    }
    if (typeof fetch === 'undefined' || !this.options.src) {
      return [];
    }
    this.controller = new AbortController();
    try {
      const response = await fetch(this.options.src, { signal: this.controller.signal });
      if (!response.ok) {
        return [];
      }
      const text = await response.text();
      this.baseUrl = response.url || this.options.src;
      this.cues = parseThumbnailVtt(text, this.baseUrl);
      return this.cues;
    } catch {
      return [];
    }
  }
}
