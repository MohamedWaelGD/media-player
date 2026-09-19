import { describe, expect, it } from 'vitest';
import { TrackingEngine } from '../../src/tracking/tracking-engine';

function createTracking() {
  return new TrackingEngine({
    enabled: true,
    reportInterval: 10,
    milestones: [25, 50, 90, 100],
    completionThreshold: 90,
  });
}

describe('TrackingEngine', () => {
  it('counts unique playback ranges and emits milestones once', () => {
    const tracking = createTracking();
    tracking.reset(10, 'lesson-1');

    tracking.observePlayback(0, true);
    tracking.observePlayback(1, true);
    tracking.observePlayback(2, true);
    tracking.observePlayback(3, true);
    tracking.observePlayback(4, true);

    expect(tracking.getData(4)).toMatchObject({
      watchedSeconds: 4,
      watchedPercentage: 40,
      maxReachedTime: 4,
      reachedMilestones: [25],
    });
    expect(tracking.observePlayback(4.5, true).milestones).toEqual([]);
  });

  it('does not mark a seek as watched content', () => {
    const tracking = createTracking();
    tracking.reset(100);

    tracking.observePlayback(0, true);
    tracking.observePlayback(1, true);
    tracking.markSeek(80);
    tracking.observePlayback(80, true);
    tracking.observePlayback(81, true);

    expect(tracking.getData(81)?.ranges).toEqual([
      { start: 0, end: 1 },
      { start: 80, end: 81 },
    ]);
  });

  it('restores ranges and high-water position', () => {
    const tracking = createTracking();
    tracking.reset(100, 'lesson-1');
    tracking.restore({
      version: 1,
      sourceId: 'lesson-1',
      duration: 100,
      currentTime: 30,
      maxReachedTime: 40,
      watchedSeconds: 20,
      watchedPercentage: 20,
      completed: false,
      ranges: [{ start: 0, end: 20 }],
      reachedMilestones: [],
    });

    expect(tracking.getData(30)).toMatchObject({
      maxReachedTime: 40,
      watchedSeconds: 20,
      watchedPercentage: 20,
    });
  });
});
