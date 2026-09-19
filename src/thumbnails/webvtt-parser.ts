import type { TimelineThumbnailCrop } from '../types/public';

export interface ThumbnailCue {
  startTime: number;
  endTime: number;
  src: string;
  crop: TimelineThumbnailCrop | null;
}

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

function parseCrop(hash: string): TimelineThumbnailCrop | null {
  const match = hash.match(/(?:^#|&)xywh=(?:pixel:)?([^&]+)/i);
  if (!match?.[1]) {
    return null;
  }
  const values = match[1].split(',').map(Number);
  const [x, y, width, height] = values;
  if (
    values.length !== 4 ||
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    x,
    y,
    width,
    height,
  };
}

function parseCue(block: string, baseUrl: string): ThumbnailCue | null {
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
  const payload = lines.slice(timingIndex + 1).find(Boolean);
  if (startTime === null || endTime === null || endTime <= startTime || !payload) {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(payload, baseUrl);
  } catch {
    return null;
  }
  const crop = parseCrop(resolved.hash);
  if (/(?:^#|&)xywh=/i.test(resolved.hash) && !crop) {
    return null;
  }
  resolved.hash = '';
  return {
    startTime,
    endTime,
    src: resolved.href,
    crop,
  };
}

export function parseThumbnailVtt(text: string, baseUrl: string): ThumbnailCue[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const cues: ThumbnailCue[] = [];
  for (const block of blocks) {
    const firstLine = block.trimStart().split('\n')[0]?.trim().toUpperCase();
    if (
      !firstLine ||
      firstLine === 'WEBVTT' ||
      /^(NOTE|STYLE|REGION)(?:\s|$)/.test(firstLine)
    ) {
      continue;
    }
    const cue = parseCue(block, baseUrl);
    if (cue) {
      cues.push(cue);
    }
  }
  return cues.sort((left, right) => left.startTime - right.startTime);
}

export function findThumbnailCue(
  cues: ThumbnailCue[],
  time: number,
): ThumbnailCue | null {
  let match: ThumbnailCue | null = null;
  for (const cue of cues) {
    if (cue.startTime > time) {
      break;
    }
    if (cue.startTime <= time && time < cue.endTime) {
      match = cue;
    }
  }
  return match;
}
