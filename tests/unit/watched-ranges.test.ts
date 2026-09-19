import { describe, expect, it } from 'vitest';
import { WatchedRanges } from '../../src/tracking/watched-ranges';

describe('WatchedRanges', () => {
  it('merges overlapping and adjacent ranges', () => {
    const ranges = new WatchedRanges();

    ranges.add(10, 20);
    ranges.add(0, 5);
    ranges.add(5, 10);
    ranges.add(18, 30);

    expect(ranges.get()).toEqual([{ start: 0, end: 30 }]);
    expect(ranges.total()).toBe(30);
  });

  it('ignores invalid ranges and clamps persisted ranges', () => {
    const ranges = new WatchedRanges([
      { start: -5, end: 20 },
      { start: 50, end: 80 },
    ]);

    ranges.add(10, 10);
    ranges.add(Number.NaN, 20);
    ranges.clamp(60);

    expect(ranges.get()).toEqual([
      { start: 0, end: 20 },
      { start: 50, end: 60 },
    ]);
  });
});
