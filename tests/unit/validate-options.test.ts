import { describe, expect, it } from 'vitest';
import { MediaPlayerError } from '../../src/errors/media-player-error';
import { validateOptions, validateSource } from '../../src/player/validate-options';

describe('validateOptions', () => {
  it('applies documented defaults', () => {
    const options = validateOptions();

    expect(options.autoplay).toBe(false);
    expect(options.tracking.reportInterval).toBe(10);
    expect(options.seekPolicy.mode).toBe('unrestricted');
    expect(options.tracking.milestones).toEqual([25, 50, 75, 90, 100]);
  });

  it('rejects invalid tracking configuration', () => {
    expect(() =>
      validateOptions({
        tracking: { completionThreshold: 101 },
      }),
    ).toThrowError(MediaPlayerError);
  });

  it('accepts thumbnail configuration and rejects invalid fallback modes', () => {
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        thumbnails: {
          src: '/lesson.vtt',
          fallback: 'generated',
          crossOrigin: 'anonymous',
        },
      }),
    ).not.toThrow();
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        thumbnails: { fallback: 'invalid' as 'none' },
      }),
    ).toThrowError(MediaPlayerError);
  });

  it('accepts valid caption tracks and rejects malformed tracks', () => {
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        captions: [
          {
            src: '/lesson.en.vtt',
            kind: 'subtitles',
            srclang: 'en',
            label: 'English',
            default: true,
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        captions: [{ src: '/lesson.vtt', default: 'yes' as unknown as boolean }],
      }),
    ).toThrowError(MediaPlayerError);
  });

  it('accepts inline chapters and chapter tracks', () => {
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        chapters: [{ title: 'Intro', startTime: 0, endTime: 10 }],
      }),
    ).not.toThrow();
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        chapterTrack: { src: '/lesson-chapters.vtt', srclang: 'en' },
      }),
    ).not.toThrow();
  });

  it('rejects invalid or duplicate chapter sources', () => {
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        chapters: [{ title: 'Intro', startTime: 10, endTime: 10 }],
      }),
    ).toThrowError(MediaPlayerError);
    expect(() =>
      validateSource({
        src: '/lesson.mp4',
        chapters: [{ title: 'Intro', startTime: 0, endTime: 10 }],
        chapterTrack: { src: '/lesson-chapters.vtt' },
      }),
    ).toThrowError(MediaPlayerError);
  });
});

describe('validateSource', () => {
  it('requires a non-empty source URL', () => {
    expect(() => validateSource({ src: ' ' })).toThrowError(MediaPlayerError);
  });
});
