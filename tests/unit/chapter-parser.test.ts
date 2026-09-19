import { describe, expect, it } from 'vitest';
import { findChapter, parseChapterVtt } from '../../src/chapters/webvtt-parser';

describe('parseChapterVtt', () => {
  it('parses and sorts chapter cues', () => {
    const chapters = parseChapterVtt(`WEBVTT

00:15.000 --> 00:35.000
<b>Main</b> topic

intro
00:00.000 --> 00:15.000
Introduction
`);

    expect(chapters).toEqual([
      { id: 'intro', title: 'Introduction', startTime: 0, endTime: 15 },
      { title: 'Main topic', startTime: 15, endTime: 35 },
    ]);
  });

  it('skips malformed and metadata blocks', () => {
    expect(
      parseChapterVtt(`WEBVTT

NOTE
ignored

00:20.000 --> 00:10.000
Backwards

00:30.000 --> 00:40.000
Valid
`),
    ).toEqual([{ title: 'Valid', startTime: 30, endTime: 40 }]);
  });
});

describe('findChapter', () => {
  it('finds the chapter containing a time', () => {
    const chapters = parseChapterVtt(`WEBVTT

00:00.000 --> 00:10.000
First

00:10.000 --> 00:20.000
Second
`);

    expect(findChapter(chapters, 10)?.title).toBe('Second');
    expect(findChapter(chapters, 20)).toBeNull();
  });
});
