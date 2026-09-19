import type { TrackingData, TrackingOptions } from '../types/public';
import { WatchedRanges } from './watched-ranges';

export interface TrackingUpdate {
  milestones: number[];
  completed: boolean;
}

function clampTime(value: number, duration: number): number {
  return Math.min(Math.max(value, 0), duration);
}

export class TrackingEngine {
  private readonly ranges = new WatchedRanges();
  private readonly milestones: number[];
  private readonly completionThreshold: number;
  private lastPlaybackTime: number | null = null;
  private maxReachedTime = 0;
  private reachedMilestones = new Set<number>();
  private completed = false;
  private duration = 0;
  private sourceId?: string;

  constructor(
    options: Required<Omit<TrackingOptions, 'initialData'>> & {
      initialData?: TrackingData;
    },
  ) {
    this.milestones = options.milestones;
    this.completionThreshold = options.completionThreshold;
    if (options.initialData) {
      this.restore(options.initialData);
    }
  }

  reset(duration: number, sourceId?: string, initialData?: TrackingData): void {
    this.duration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    this.sourceId = sourceId;
    this.ranges.clear();
    this.lastPlaybackTime = null;
    this.maxReachedTime = 0;
    this.reachedMilestones = new Set();
    this.completed = false;

    if (
      initialData &&
      (!sourceId || !initialData.sourceId || sourceId === initialData.sourceId)
    ) {
      this.restore(initialData);
    }
  }

  restore(data: TrackingData): void {
    if (data.version !== 1) {
      return;
    }
    this.duration =
      Number.isFinite(this.duration) && this.duration > 0 ? this.duration : data.duration;
    this.sourceId = data.sourceId ?? this.sourceId;
    this.ranges.clear();
    for (const range of data.ranges) {
      this.ranges.add(range.start, range.end);
    }
    if (this.duration > 0) {
      this.ranges.clamp(this.duration);
    }
    this.maxReachedTime = Math.max(0, data.maxReachedTime);
    if (this.duration > 0) {
      this.maxReachedTime = clampTime(this.maxReachedTime, this.duration);
    }
    this.reachedMilestones = new Set(
      data.reachedMilestones.filter((milestone) => this.milestones.includes(milestone)),
    );
    this.completed = Boolean(data.completed);
    this.lastPlaybackTime = Number.isFinite(data.currentTime) ? data.currentTime : null;
  }

  markSeek(time: number): void {
    this.lastPlaybackTime = Number.isFinite(time) ? time : null;
  }

  observePlayback(time: number, playing: boolean): TrackingUpdate {
    if (!Number.isFinite(time)) {
      return { milestones: [], completed: false };
    }
    if (!playing || this.duration <= 0) {
      this.lastPlaybackTime = time;
      return { milestones: [], completed: false };
    }

    const previous = this.lastPlaybackTime;
    this.lastPlaybackTime = time;
    if (previous === null || time <= previous || time - previous > 2.5) {
      return this.evaluate();
    }

    const end = clampTime(time, this.duration);
    this.ranges.add(clampTime(previous, this.duration), end);
    this.maxReachedTime = Math.max(this.maxReachedTime, end);
    return this.evaluate();
  }

  getWatchedPercentage(): number | null {
    if (this.duration <= 0) {
      return null;
    }
    return Math.min(100, (this.ranges.total() / this.duration) * 100);
  }

  getData(currentTime: number): TrackingData | null {
    if (this.duration <= 0) {
      return null;
    }
    const watchedSeconds = this.ranges.total();
    return {
      version: 1,
      ...(this.sourceId ? { sourceId: this.sourceId } : {}),
      duration: this.duration,
      currentTime: Number.isFinite(currentTime) ? currentTime : 0,
      maxReachedTime: this.maxReachedTime,
      watchedSeconds,
      watchedPercentage: Math.min(100, (watchedSeconds / this.duration) * 100),
      completed: this.completed,
      ranges: this.ranges.get(),
      reachedMilestones: [...this.reachedMilestones].sort((left, right) => left - right),
    };
  }

  private evaluate(): TrackingUpdate {
    const percentage = this.getWatchedPercentage();
    if (percentage === null) {
      return { milestones: [], completed: false };
    }

    const reached: number[] = [];
    for (const milestone of this.milestones) {
      if (percentage >= milestone && !this.reachedMilestones.has(milestone)) {
        this.reachedMilestones.add(milestone);
        reached.push(milestone);
      }
    }

    const completed = !this.completed && percentage >= this.completionThreshold;
    if (completed) {
      this.completed = true;
    }
    return { milestones: reached, completed };
  }
}
