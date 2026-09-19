import { DEFAULT_SEEK_POLICY, DEFAULT_TRACKING_OPTIONS } from '../constants';
import { MediaPlayerError } from '../errors/media-player-error';
import type {
  MediaPlayerOptions,
  MediaSource,
  PlaybackEngine,
  PlayerPlugin,
  SeekPolicyMode,
  TimelineThumbnailOptions,
  TrackingData,
} from '../types/public';

export interface ValidatedOptions {
  source?: MediaSource;
  autoplay: boolean;
  engines: PlaybackEngine[];
  tracking: {
    enabled: boolean;
    reportInterval: number;
    milestones: number[];
    completionThreshold: number;
    initialData?: TrackingData;
  };
  seekPolicy: {
    mode: SeekPolicyMode;
    tolerance: number;
  };
  plugins: PlayerPlugin[];
}

function assertFinitePositive(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new MediaPlayerError(
      'INVALID_OPTIONS',
      `${name} must be a finite number greater than zero.`,
    );
  }
}

function validateMilestones(milestones: unknown): number[] {
  if (!Array.isArray(milestones)) {
    throw new MediaPlayerError('INVALID_OPTIONS', 'milestones must be an array.');
  }

  const values = milestones.map((value) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 100
    ) {
      throw new MediaPlayerError(
        'INVALID_OPTIONS',
        'Every milestone must be a finite percentage from 0 to 100.',
      );
    }
    return value;
  });

  return [...new Set(values)].sort((left, right) => left - right);
}

export function validateOptions(options: MediaPlayerOptions = {}): ValidatedOptions {
  const tracking = {
    ...DEFAULT_TRACKING_OPTIONS,
    ...options.tracking,
  };
  const seekPolicy = {
    ...DEFAULT_SEEK_POLICY,
    ...options.seekPolicy,
  };

  if (typeof options.autoplay !== 'undefined' && typeof options.autoplay !== 'boolean') {
    throw new MediaPlayerError('INVALID_OPTIONS', 'autoplay must be a boolean.');
  }
  if (typeof tracking.enabled !== 'boolean') {
    throw new MediaPlayerError('INVALID_OPTIONS', 'tracking.enabled must be a boolean.');
  }
  assertFinitePositive('tracking.reportInterval', tracking.reportInterval);
  if (!Number.isInteger(tracking.reportInterval)) {
    throw new MediaPlayerError(
      'INVALID_OPTIONS',
      'tracking.reportInterval must be an integer.',
    );
  }
  if (
    typeof tracking.completionThreshold !== 'number' ||
    !Number.isFinite(tracking.completionThreshold) ||
    tracking.completionThreshold <= 0 ||
    tracking.completionThreshold > 100
  ) {
    throw new MediaPlayerError(
      'INVALID_OPTIONS',
      'tracking.completionThreshold must be a percentage from 0 to 100.',
    );
  }
  if (
    typeof seekPolicy.tolerance !== 'number' ||
    !Number.isFinite(seekPolicy.tolerance) ||
    seekPolicy.tolerance < 0
  ) {
    throw new MediaPlayerError(
      'INVALID_OPTIONS',
      'seekPolicy.tolerance must be a finite number greater than or equal to zero.',
    );
  }
  if (seekPolicy.mode !== 'unrestricted' && seekPolicy.mode !== 'watched') {
    throw new MediaPlayerError(
      'INVALID_OPTIONS',
      'seekPolicy.mode must be unrestricted or watched.',
    );
  }

  return {
    source: options.source,
    autoplay: options.autoplay ?? false,
    engines: [...(options.engines ?? [])],
    tracking: {
      enabled: tracking.enabled,
      reportInterval: tracking.reportInterval,
      milestones: validateMilestones(tracking.milestones),
      completionThreshold: tracking.completionThreshold,
      initialData: tracking.initialData,
    },
    seekPolicy: {
      mode: seekPolicy.mode,
      tolerance: seekPolicy.tolerance,
    },
    plugins: [...(options.plugins ?? [])],
  };
}

export function validateSource(
  source: unknown,
): asserts source is NonNullable<MediaPlayerOptions['source']> {
  if (!source || typeof source !== 'object') {
    throw new MediaPlayerError('INVALID_SOURCE', 'A media source is required.');
  }

  const candidate = source as {
    src?: unknown;
    type?: unknown;
    thumbnails?: unknown;
    captions?: unknown;
    chapters?: unknown;
    chapterTrack?: unknown;
  };
  if (typeof candidate.src !== 'string' || candidate.src.trim() === '') {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.src must be a non-empty string.',
    );
  }
  if (typeof candidate.type !== 'undefined' && typeof candidate.type !== 'string') {
    throw new MediaPlayerError('INVALID_SOURCE', 'source.type must be a string.');
  }
  if (typeof candidate.thumbnails !== 'undefined') {
    validateThumbnails(candidate.thumbnails);
  }
  if (typeof candidate.captions !== 'undefined') {
    validateCaptions(candidate.captions);
  }
  if (
    typeof candidate.chapters !== 'undefined' &&
    typeof candidate.chapterTrack !== 'undefined'
  ) {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.chapters and source.chapterTrack cannot be used together.',
    );
  }
  if (typeof candidate.chapters !== 'undefined') {
    validateChapters(candidate.chapters);
  }
  if (typeof candidate.chapterTrack !== 'undefined') {
    validateChapterTrack(candidate.chapterTrack);
  }
}

function validateChapters(
  value: unknown,
): asserts value is NonNullable<MediaSource['chapters']> {
  if (!Array.isArray(value)) {
    throw new MediaPlayerError('INVALID_SOURCE', 'source.chapters must be an array.');
  }
  value.forEach((chapter, index) => {
    if (!chapter || typeof chapter !== 'object') {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.chapters[${index}] must be an object.`,
      );
    }
    const candidateChapter = chapter as Record<string, unknown>;
    if (
      typeof candidateChapter.title !== 'string' ||
      candidateChapter.title.trim() === ''
    ) {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.chapters[${index}].title must be a non-empty string.`,
      );
    }
    for (const key of ['startTime', 'endTime']) {
      if (
        typeof candidateChapter[key] !== 'number' ||
        !Number.isFinite(candidateChapter[key]) ||
        candidateChapter[key] < 0
      ) {
        throw new MediaPlayerError(
          'INVALID_SOURCE',
          `source.chapters[${index}].${key} must be a finite non-negative number.`,
        );
      }
    }
    if ((candidateChapter.endTime as number) <= (candidateChapter.startTime as number)) {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.chapters[${index}].endTime must be greater than startTime.`,
      );
    }
    if (
      typeof candidateChapter.id !== 'undefined' &&
      typeof candidateChapter.id !== 'string'
    ) {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.chapters[${index}].id must be a string.`,
      );
    }
  });
}

function validateChapterTrack(
  value: unknown,
): asserts value is NonNullable<MediaSource['chapterTrack']> {
  if (!value || typeof value !== 'object') {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.chapterTrack must be an object.',
    );
  }
  const track = value as Record<string, unknown>;
  if (typeof track.src !== 'string' || track.src.trim() === '') {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.chapterTrack.src must be a non-empty string.',
    );
  }
  for (const key of ['srclang', 'label']) {
    if (typeof track[key] !== 'undefined' && typeof track[key] !== 'string') {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.chapterTrack.${key} must be a string.`,
      );
    }
  }
}

function validateCaptions(
  value: unknown,
): asserts value is NonNullable<MediaSource['captions']> {
  if (!Array.isArray(value)) {
    throw new MediaPlayerError('INVALID_SOURCE', 'source.captions must be an array.');
  }
  value.forEach((track, index) => {
    if (!track || typeof track !== 'object') {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.captions[${index}] must be an object.`,
      );
    }
    const candidateTrack = track as Record<string, unknown>;
    if (typeof candidateTrack.src !== 'string' || candidateTrack.src.trim() === '') {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.captions[${index}].src must be a non-empty string.`,
      );
    }
    if (
      typeof candidateTrack.kind !== 'undefined' &&
      !['subtitles', 'captions', 'descriptions', 'metadata'].includes(
        String(candidateTrack.kind),
      )
    ) {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.captions[${index}].kind is invalid.`,
      );
    }
    for (const key of ['srclang', 'label']) {
      if (
        typeof candidateTrack[key] !== 'undefined' &&
        typeof candidateTrack[key] !== 'string'
      ) {
        throw new MediaPlayerError(
          'INVALID_SOURCE',
          `source.captions[${index}].${key} must be a string.`,
        );
      }
    }
    if (
      typeof candidateTrack.default !== 'undefined' &&
      typeof candidateTrack.default !== 'boolean'
    ) {
      throw new MediaPlayerError(
        'INVALID_SOURCE',
        `source.captions[${index}].default must be a boolean.`,
      );
    }
  });
}

function validateThumbnails(value: unknown): asserts value is TimelineThumbnailOptions {
  if (!value || typeof value !== 'object') {
    throw new MediaPlayerError('INVALID_SOURCE', 'source.thumbnails must be an object.');
  }
  const options = value as Record<string, unknown>;
  if (typeof options.src !== 'undefined' && typeof options.src !== 'string') {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.thumbnails.src must be a string.',
    );
  }
  if (typeof options.src === 'string' && options.src.trim() === '') {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.thumbnails.src must be a non-empty string.',
    );
  }
  if (
    typeof options.fallback !== 'undefined' &&
    options.fallback !== 'none' &&
    options.fallback !== 'generated'
  ) {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.thumbnails.fallback must be none or generated.',
    );
  }
  if (
    typeof options.crossOrigin !== 'undefined' &&
    options.crossOrigin !== 'anonymous' &&
    options.crossOrigin !== 'use-credentials'
  ) {
    throw new MediaPlayerError(
      'INVALID_SOURCE',
      'source.thumbnails.crossOrigin must be anonymous or use-credentials.',
    );
  }
}
