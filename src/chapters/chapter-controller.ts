import type { Chapter, MediaSource } from '../types/public';
import { normalizeChapters, parseChapterVtt } from './webvtt-parser';

export class ChapterController {
  private chapters: Chapter[] = [];
  private generation = 0;
  private abortController?: AbortController;

  constructor(
    private readonly onChange: (chapters: Chapter[]) => void,
    private readonly onWarning: (error: unknown, src: string) => void,
  ) {}

  reset(source?: MediaSource): void {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = undefined;
    this.chapters = source?.chapters ? normalizeChapters(source.chapters) : [];
    this.onChange(this.get());
    if (!source?.chapterTrack) {
      return;
    }

    const { src } = source.chapterTrack;
    if (typeof fetch === 'undefined') {
      this.onWarning(new Error('The browser does not provide fetch.'), src);
      return;
    }
    const generation = this.generation;
    const controller = new AbortController();
    this.abortController = controller;
    void fetch(src, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Chapter track request failed with status ${response.status}.`);
        }
        return response.text();
      })
      .then((text) => {
        if (generation !== this.generation) {
          return;
        }
        this.chapters = parseChapterVtt(text);
        this.onChange(this.get());
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          this.onWarning(error, src);
        }
      });
  }

  get(): Chapter[] {
    return this.chapters.map((chapter) => ({ ...chapter }));
  }

  destroy(): void {
    this.reset();
  }
}
