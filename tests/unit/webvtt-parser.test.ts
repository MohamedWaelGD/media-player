import { describe, expect, it } from 'vitest';
import { findThumbnailCue, parseThumbnailVtt } from '../../src/thumbnails/webvtt-parser';

describe('parseThumbnailVtt', () => {
  it('parses image and sprite cues with relative URLs', () => {
    const cues = parseThumbnailVtt(
      '\uFEFFWEBVTT\r\n\r\n' +
        'intro\r\n' +
        '00:00.000 --> 00:05.000\r\n' +
        'frames/lesson.jpg#xywh=10,20,160,90\r\n\r\n' +
        '00:05.000 --> 00:10.000 align:center\r\n' +
        'https://cdn.example.test/full.jpg\r\n',
      'https://media.example.test/tracks/lesson.vtt',
    );

    expect(cues).toEqual([
      {
        startTime: 0,
        endTime: 5,
        src: 'https://media.example.test/tracks/frames/lesson.jpg',
        crop: { x: 10, y: 20, width: 160, height: 90 },
      },
      {
        startTime: 5,
        endTime: 10,
        src: 'https://cdn.example.test/full.jpg',
        crop: null,
      },
    ]);
  });

  it('skips metadata and malformed cues while preserving valid cues', () => {
    const cues = parseThumbnailVtt(
      `WEBVTT

NOTE
not a cue

00:10.000 --> 00:05.000
bad.jpg

00:20.000 --> 01:00.000
good.jpg#xywh=pixel:0,0,0,40

00:30.000 --> 01:00.000
good.jpg#xywh=0,0,80,40
`,
      'https://example.test/track.vtt',
    );

    expect(cues).toHaveLength(1);
    expect(findThumbnailCue(cues, 30)?.crop).toEqual({
      x: 0,
      y: 0,
      width: 80,
      height: 40,
    });
  });

  it('selects the latest-starting overlapping cue', () => {
    const cues = parseThumbnailVtt(
      `WEBVTT

00:00.000 --> 00:10.000
first.jpg

00:05.000 --> 00:15.000
second.jpg
`,
      'https://example.test/track.vtt',
    );

    expect(findThumbnailCue(cues, 6)?.src).toBe('https://example.test/second.jpg');
    expect(findThumbnailCue(cues, 15)).toBeNull();
  });
});
