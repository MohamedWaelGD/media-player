export type MediaPlayerErrorCode =
  | 'INVALID_TARGET'
  | 'INVALID_SOURCE'
  | 'INVALID_OPTIONS'
  | 'UNSUPPORTED_SOURCE'
  | 'LOAD_FAILED'
  | 'PLAYBACK_FAILED'
  | 'FEATURE_UNAVAILABLE'
  | 'DESTROYED';

export class MediaPlayerError extends Error {
  override readonly name = 'MediaPlayerError';
  readonly cause?: unknown;

  constructor(
    readonly code: MediaPlayerErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.cause = options?.cause;
  }
}
