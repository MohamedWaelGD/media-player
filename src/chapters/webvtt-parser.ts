import type { Chapter } from '../types/public';

function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }
  const secondsPart = parts.at(-1);
  const minutesPart = parts.at(-2);
  const hoursPart = parts.length === 3 ? parts[0] : '0';
  if (!secondsPart || !minutesPart || !hoursPart) {
    return null;
  }
  const seconds = Number(secondsPart);
  const minutes = Number(minutesPart);
  const hours = Number(hoursPart);
  if (
    !Number.isFinite(seconds) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(hours) ||
    seconds < 0 ||
    seconds >= 60 ||
    minutes < 0 ||
    minutes >= 60 ||
    hours < 0
  ) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function stripCueMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCue(block: string): Chapter | null {
  const lines = block.split(/\r?\n/).map((line) => line.trim());
  const timingIndex = lines.findIndex((line) => line.includes('-->'));
  if (timingIndex < 0) {
    return null;
  }
  const timing = lines[timingIndex];
  const timingMatch = timing?.match(/^([^\s]+)\s+-->\s+([^\s]+)(?:\s+.*)?$/);
  if (!timingMatch?.[1] || !timingMatch[2]) {
    return null;
  }
  const startTime = parseTimestamp(timingMatch[1]);
  const endTime = parseTimestamp(timingMatch[2]);
  const title = stripCueMarkup(
    lines
      .slice(timingIndex + 1)
      .filter(Boolean)
      .join(' '),
  );
  if (startTime === null || endTime === null || endTime <= startTime || !title) {
    return null;
  }
  const id = lines.slice(0, timingIndex).find(Boolean);
  return {
    ...(id ? { id } : {}),
    title,
    startTime,
    endTime,
  };
}

export function parseChapterVtt(text: string): Chapter[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return normalized
    .split(/\n{2,}/)
    .filter((block) => {
      const firstLine = block.trimStart().split('\n')[0]?.trim().toUpperCase();
      if (!firstLine) {
        return false;
      }
      return firstLine !== 'WEBVTT' && !/^(NOTE|STYLE|REGION)(?:\s|$)/.test(firstLine);
    })
    .map(parseCue)
    .filter((chapter): chapter is Chapter => chapter !== null)
    .sort((left, right) => left.startTime - right.startTime);
}

export function normalizeChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters]
    .sort((left, right) => left.startTime - right.startTime)
    .map((chapter) => ({ ...chapter }));
}

export function findChapter(chapters: Chapter[], time: number): Chapter | null {
  return (
    chapters.find((chapter) => chapter.startTime <= time && time < chapter.endTime) ??
    null
  );
}
