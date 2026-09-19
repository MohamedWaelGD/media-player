import type { TimeRange } from '../types/public';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export class WatchedRanges {
  private ranges: TimeRange[] = [];

  constructor(ranges: TimeRange[] = []) {
    for (const range of ranges) {
      this.add(range.start, range.end);
    }
  }

  add(start: number, end: number): void {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return;
    }

    const next: TimeRange[] = [];
    let merged = { start, end };
    let inserted = false;

    for (const range of this.ranges) {
      if (range.end < merged.start) {
        next.push(range);
        continue;
      }
      if (merged.end < range.start) {
        if (!inserted) {
          next.push(merged);
          inserted = true;
        }
        next.push(range);
        continue;
      }
      merged = {
        start: Math.min(merged.start, range.start),
        end: Math.max(merged.end, range.end),
      };
    }

    if (!inserted) {
      next.push(merged);
    }
    this.ranges = next;
  }

  clamp(duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }
    this.ranges = this.ranges
      .map((range) => ({
        start: clamp(range.start, 0, duration),
        end: clamp(range.end, 0, duration),
      }))
      .filter((range) => range.end > range.start);
  }

  get(): TimeRange[] {
    return this.ranges.map((range) => ({ ...range }));
  }

  total(): number {
    return this.ranges.reduce((total, range) => total + range.end - range.start, 0);
  }

  clear(): void {
    this.ranges = [];
  }
}
