import { MediaPlayerError } from '../errors/media-player-error';
import { MediaPlayerElement } from './media-player-element';

export { MediaPlayerElement } from './media-player-element';
export type { MediaPlayerChangeDetail } from '../types/public';
export type {
  CaptionColor,
  CaptionEdgeStyle,
  CaptionFontFamily,
  CaptionPreferencePatch,
  CaptionPosition,
  CaptionPreferences,
  CaptionPreferencesChangeDetail,
  Chapter,
  ChapterTrack,
} from '../types/public';

export function defineMediaPlayerElement(tagName = 'media-player'): void {
  if (typeof customElements === 'undefined') {
    throw new MediaPlayerError(
      'FEATURE_UNAVAILABLE',
      'Custom elements are not supported in this environment.',
    );
  }
  if (!customElements.get(tagName)) {
    customElements.define(tagName, MediaPlayerElement);
  }
}
