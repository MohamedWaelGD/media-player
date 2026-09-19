import '@phosphor-icons/webcomponents/PhCornersIn';
import '@phosphor-icons/webcomponents/PhCornersOut';
import '@phosphor-icons/webcomponents/PhCaretLeft';
import '@phosphor-icons/webcomponents/PhCaretRight';
import '@phosphor-icons/webcomponents/PhCheck';
import '@phosphor-icons/webcomponents/PhCopy';
import '@phosphor-icons/webcomponents/PhDownloadSimple';
import '@phosphor-icons/webcomponents/PhGear';
import '@phosphor-icons/webcomponents/PhListBullets';
import '@phosphor-icons/webcomponents/PhArrowLeft';
import '@phosphor-icons/webcomponents/PhArrowRight';
import '@phosphor-icons/webcomponents/PhPause';
import '@phosphor-icons/webcomponents/PhPictureInPicture';
import '@phosphor-icons/webcomponents/PhPlay';
import '@phosphor-icons/webcomponents/PhRepeat';
import '@phosphor-icons/webcomponents/PhSpeakerHigh';
import '@phosphor-icons/webcomponents/PhSpeakerLow';
import '@phosphor-icons/webcomponents/PhSpeakerNone';
import '@phosphor-icons/webcomponents/PhSpeakerSlash';
import '@phosphor-icons/webcomponents/PhSubtitles';
import { HLS_MIME_TYPES } from '../constants';
import { findChapter } from '../chapters/webvtt-parser';
import { HlsEngine, type HlsConstructor } from '../hls/hls-engine';
import { clampSeekTarget } from '../tracking/seek-policy';
import { MediaPlayer } from '../player/media-player';
import type {
  CaptionPreferences,
  CaptionPreferencePatch,
  CaptionPreferencesChangeDetail,
  Chapter,
  ChapterTrack,
  MediaPlayerChangeDetail,
  MediaSource,
  PlayerState,
  QualityLevel,
  QualitySelection,
  TimelineThumbnail,
  TrackingData,
} from '../types/public';
import { CaptionRenderer, DEFAULT_CAPTION_PREFERENCES } from './caption-renderer';
import { MEDIA_PLAYER_STYLES } from './styles';

type CaptionSettingKey =
  | 'textColor'
  | 'textOpacity'
  | 'backgroundColor'
  | 'backgroundOpacity'
  | 'fontSize'
  | 'edgeStyle'
  | 'fontFamily';
type SettingsView =
  'menu' | 'speed' | 'quality' | 'captions' | `caption-${CaptionSettingKey}`;

const CAPTION_SETTING_LABELS: Record<CaptionSettingKey, string> = {
  textColor: 'Text color',
  textOpacity: 'Text opacity',
  backgroundColor: 'Background',
  backgroundOpacity: 'Background opacity',
  fontSize: 'Font size',
  edgeStyle: 'Character edge',
  fontFamily: 'Font family',
};

const CAPTION_SETTING_OPTIONS: Record<
  CaptionSettingKey,
  ReadonlyArray<{ value: string; label: string }>
> = {
  textColor: [
    { value: '#ffffff', label: 'White' },
    { value: '#000000', label: 'Black' },
    { value: '#ff0000', label: 'Red' },
    { value: '#00ff00', label: 'Green' },
    { value: '#0000ff', label: 'Blue' },
    { value: '#ffff00', label: 'Yellow' },
    { value: '#ff00ff', label: 'Magenta' },
    { value: '#00ffff', label: 'Cyan' },
  ],
  textOpacity: [
    { value: '0.25', label: '25%' },
    { value: '0.5', label: '50%' },
    { value: '0.75', label: '75%' },
    { value: '1', label: '100%' },
  ],
  backgroundColor: [
    { value: '#000000', label: 'Black' },
    { value: '#ffffff', label: 'White' },
    { value: '#ff0000', label: 'Red' },
    { value: '#00ff00', label: 'Green' },
    { value: '#0000ff', label: 'Blue' },
    { value: '#ffff00', label: 'Yellow' },
    { value: '#ff00ff', label: 'Magenta' },
    { value: '#00ffff', label: 'Cyan' },
  ],
  backgroundOpacity: [
    { value: '0', label: '0%' },
    { value: '0.25', label: '25%' },
    { value: '0.5', label: '50%' },
    { value: '0.75', label: '75%' },
    { value: '1', label: '100%' },
  ],
  fontSize: [
    { value: '0.5', label: '50%' },
    { value: '0.75', label: '75%' },
    { value: '1', label: '100%' },
    { value: '1.5', label: '150%' },
    { value: '2', label: '200%' },
  ],
  edgeStyle: [
    { value: 'none', label: 'None' },
    { value: 'drop-shadow', label: 'Drop shadow' },
    { value: 'raised', label: 'Raised' },
    { value: 'depressed', label: 'Depressed' },
    { value: 'outline', label: 'Outline' },
  ],
  fontFamily: [
    { value: 'monospaced-serif', label: 'Monospaced Serif' },
    { value: 'proportional-serif', label: 'Proportional Serif' },
    { value: 'monospaced-sans-serif', label: 'Monospaced Sans-Serif' },
    { value: 'proportional-sans-serif', label: 'Proportional Sans-Serif' },
    { value: 'casual', label: 'Casual' },
    { value: 'cursive', label: 'Cursive' },
    { value: 'small-capitals', label: 'Small Capitals' },
  ],
};
const CONTROLS_IDLE_DELAY = 3000;

const HTMLElementBase = (
  typeof HTMLElement === 'undefined' ? class {} : HTMLElement
) as typeof HTMLElement;

interface DocumentPictureInPictureWindow extends Window {
  document: Document;
}

interface DocumentPictureInPictureApi {
  window?: DocumentPictureInPictureWindow;
  requestWindow(options?: {
    width?: number;
    height?: number;
  }): Promise<DocumentPictureInPictureWindow>;
}

interface DocumentPictureInPictureGlobal {
  documentPictureInPicture?: DocumentPictureInPictureApi;
}

interface ClipboardWindow extends Window {
  ClipboardItem?: typeof ClipboardItem;
}

function isHlsSource(source: MediaSource): boolean {
  return Boolean(
    (source.type && HLS_MIME_TYPES.has(source.type.toLowerCase())) ||
    /\.m3u8(?:$|[?#])/i.test(source.src),
  );
}

function formatTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) {
    return '0:00';
  }
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor(time / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${seconds}`;
  }
  return `${minutes}:${seconds}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPlaybackRate(rate: number): string {
  return `${rate.toFixed(1)}x`;
}

function formatQualitySelection(
  quality: QualitySelection,
  levels: QualityLevel[],
): string {
  if (quality === 'auto') {
    return 'Auto';
  }
  return levels.find((level) => level.id === quality)?.label ?? 'Auto';
}

export class MediaPlayerElement extends HTMLElementBase {
  static readonly observedAttributes = [
    'src',
    'type',
    'poster',
    'source-id',
    'seek-policy',
    'thumbnail-vtt',
    'thumbnail-fallback',
    'thumbnail-crossorigin',
    'caption-src',
    'caption-kind',
    'caption-lang',
    'caption-label',
    'caption-default',
    'chapter-src',
    'chapter-lang',
    'chapter-label',
  ];

  private player?: MediaPlayer;
  private unsubscribeState?: () => void;
  private unsubscribeChapters?: () => void;
  private connected = false;
  private initialized = false;
  private initializationId = 0;
  private initializeScheduled = false;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private videoClickTimer?: ReturnType<typeof setTimeout>;
  private feedbackTimer?: ReturnType<typeof setTimeout>;
  private latestState?: PlayerState;
  private latestChapters: Chapter[] = [];
  private lastControlStatus?: PlayerState['status'];
  private trackingData?: TrackingData;
  private scrubbing = false;
  private scrubTime?: number;
  private ignoreNextTimelineChange = false;
  private timelineHovered = false;
  private previewRequestId = 0;
  private settingsOpen = false;
  private settingsView: SettingsView = 'menu';
  private chaptersOpen = false;
  private captionRenderer?: CaptionRenderer;
  private captionDragging = false;
  private movingToPictureInPicture = false;
  private pictureInPicturePlaceholder?: Comment;
  private pictureInPictureWindow?: DocumentPictureInPictureWindow;
  private pictureInPicturePageHide?: () => void;
  private restoringPictureInPicture = false;
  private contextMenuOutsidePointerDown?: (event: PointerEvent) => void;
  private contextMenuDocument?: Document;

  constructor() {
    super();
    if (typeof this.attachShadow === 'function') {
      this.attachShadow({ mode: 'open' });
    }
  }

  connectedCallback(): void {
    this.connected = true;
    if (this.movingToPictureInPicture && this.player) {
      this.updateControls(this.player.getState());
      return;
    }
    this.render();
    void this.initialize();
  }

  disconnectedCallback(): void {
    this.connected = false;
    if (this.movingToPictureInPicture) {
      return;
    }
    this.initializationId += 1;
    this.clearHideTimer();
    this.clearVideoClickTimer();
    this.clearFeedbackTimer();
    this.closeContextMenu();
    this.hidePreview();
    this.captionRenderer?.destroy();
    this.captionRenderer = undefined;
    this.trackingData = this.player?.getTrackingData() ?? this.trackingData;
    this.notifyPlayerChange(null);
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.unsubscribeChapters?.();
    this.unsubscribeChapters = undefined;
    this.latestChapters = [];
    this.chaptersOpen = false;
    this.player?.destroy();
    this.player = undefined;
    this.initialized = false;
  }

  attributeChangedCallback(): void {
    if (this.connected && this.initialized) {
      this.scheduleInitialize();
    }
  }

  get mediaPlayer(): MediaPlayer | undefined {
    return this.player;
  }

  get captionPreferences(): CaptionPreferences {
    return (
      this.captionRenderer?.getPreferences() ?? {
        ...DEFAULT_CAPTION_PREFERENCES,
        position: { ...DEFAULT_CAPTION_PREFERENCES.position },
      }
    );
  }

  setCaptionPreferences(patch: CaptionPreferencePatch): CaptionPreferences {
    const preferences =
      this.captionRenderer?.setPreferences(patch) ?? this.captionPreferences;
    this.updateCaptionSettings();
    return preferences;
  }

  resetCaptionPreferences(): CaptionPreferences {
    const preferences =
      this.captionRenderer?.resetPreferences() ?? this.captionPreferences;
    this.updateCaptionSettings();
    return preferences;
  }

  private render(): void {
    if (!this.shadowRoot || this.initialized) {
      return;
    }
    this.shadowRoot.innerHTML = `
      <style>${MEDIA_PLAYER_STYLES}</style>
         <div class="player" part="container" tabindex="0" role="region" aria-label="Media player">
         <video part="video" playsinline tabindex="0" aria-label="Video playback"></video>
         <div class="caption-layer" part="caption-layer">
           <div class="caption-group" part="captions" tabindex="0" role="group" aria-label="Caption position. Use arrow keys to move." hidden></div>
         </div>
         <div class="shortcut-feedback" part="shortcut-feedback" hidden aria-live="polite">
           <span class="feedback-icon">
            <ph-play class="feedback-play" aria-hidden="true" size="1.45em"></ph-play>
            <ph-pause class="feedback-pause" aria-hidden="true" size="1.45em"></ph-pause>
            <ph-speaker-high class="feedback-volume" aria-hidden="true" size="1.45em"></ph-speaker-high>
            <ph-speaker-slash class="feedback-mute" aria-hidden="true" size="1.45em"></ph-speaker-slash>
            <ph-corners-out class="feedback-fullscreen-enter" aria-hidden="true" size="1.45em"></ph-corners-out>
            <ph-corners-in class="feedback-fullscreen-exit" aria-hidden="true" size="1.45em"></ph-corners-in>
             <ph-arrow-left class="feedback-seek-left" aria-hidden="true" size="1.45em"></ph-arrow-left>
             <ph-arrow-right class="feedback-seek-right" aria-hidden="true" size="1.45em"></ph-arrow-right>
             <ph-subtitles class="feedback-captions" aria-hidden="true" size="1.45em"></ph-subtitles>
           </span>
           <span class="feedback-detail"></span>
         </div>
        <div class="message" part="message" hidden></div>
        <div class="controls" part="controls">
          <div class="timeline-area" part="timeline-container">
            <div class="timeline-preview" part="thumbnail-preview" hidden>
              <div class="thumbnail-viewport" part="thumbnail-viewport">
                <div class="thumbnail-placeholder" aria-hidden="true"></div>
               <img alt="" />
               </div>
               <span class="thumbnail-chapter"></span>
               <span class="thumbnail-time"></span>
            </div>
            <div class="timeline-track" aria-hidden="true">
              <div class="timeline-buffered"></div>
              <div class="timeline-progress"></div>
              <div class="timeline-chapters"></div>
              <div class="timeline-thumb"></div>
            </div>
            <input class="timeline" part="timeline" type="range" min="0" max="0" value="0" step="0.1" aria-label="Seek video" />
          </div>
          <div class="row" part="control-row">
             <button class="play" part="play-button" type="button" aria-label="Play (K / Space)" title="Play (K / Space)" data-tooltip="Play (K / Space)" aria-keyshortcuts="K Space">
              <ph-play class="play-icon" aria-hidden="true" size="1.2em" weight="bold"></ph-play>
              <ph-pause class="pause-icon" aria-hidden="true" size="1.2em" weight="bold"></ph-pause>
            </button>
            <div class="volume-control" part="volume-control">
               <button class="volume-button" part="volume-button" type="button" aria-label="Mute (M)" title="Mute (M)" data-tooltip="Mute (M)" aria-keyshortcuts="M">
                <ph-speaker-high class="speaker-high" aria-hidden="true" size="1.15em"></ph-speaker-high>
                <ph-speaker-low class="speaker-low" aria-hidden="true" size="1.15em"></ph-speaker-low>
                <ph-speaker-none class="speaker-none" aria-hidden="true" size="1.15em"></ph-speaker-none>
                <ph-speaker-slash class="speaker-slash" aria-hidden="true" size="1.15em"></ph-speaker-slash>
              </button>
              <div class="volume-slider-shell">
                <input class="volume" part="volume-slider" type="range" min="0" max="1" value="1" step="0.05" aria-label="Volume" />
              </div>
            </div>
            <span class="time" part="time">0:00 / 0:00</span>
            <span class="live" part="live-indicator" hidden>Live</span>
            <span class="spacer"></span>
               <button class="captions-toggle" part="captions-toggle" type="button" aria-label="Captions unavailable" title="Captions unavailable" data-tooltip="Captions unavailable" aria-keyshortcuts="C" aria-pressed="false" hidden>
                 <ph-subtitles aria-hidden="true" size="1.1em"></ph-subtitles>
               </button>
               <button class="chapters-toggle" part="chapters-toggle" type="button" aria-label="Chapters unavailable" title="Chapters unavailable" data-tooltip="Chapters unavailable" aria-expanded="false" hidden>
                 <ph-list-bullets aria-hidden="true" size="1.1em"></ph-list-bullets>
               </button>
              <button class="loop-toggle" part="loop-toggle" type="button" aria-label="Loop off" title="Loop off" data-tooltip="Loop off" aria-pressed="false">
                <ph-repeat aria-hidden="true" size="1.1em"></ph-repeat>
              </button>
              <button class="settings" part="settings-button" type="button" aria-label="Settings (S)" title="Settings (S)" data-tooltip="Settings (S)" aria-keyshortcuts="S" aria-expanded="false">
               <ph-gear aria-hidden="true" size="1.1em"></ph-gear>
             </button>
             <button class="fullscreen" part="fullscreen-button" type="button" aria-label="Fullscreen (F)" title="Fullscreen (F)" data-tooltip="Fullscreen (F)" aria-keyshortcuts="F">
              <ph-corners-out class="fullscreen-enter" aria-hidden="true" size="1.15em"></ph-corners-out>
              <ph-corners-in class="fullscreen-exit" aria-hidden="true" size="1.15em"></ph-corners-in>
            </button>
          </div>
          <div class="settings-panel" part="settings-panel" hidden>
             <div class="settings-menu-view" data-settings-view="menu">
               <button class="settings-row settings-captions" part="captions-button" type="button" data-settings-target="captions" aria-label="Captions (C)" title="Captions unavailable" data-tooltip="Captions (C)" aria-keyshortcuts="C" aria-pressed="false" disabled>
                 <span>Captions</span>
                 <span class="settings-row-value captions-value">Unavailable</span>
                 <ph-subtitles aria-hidden="true" size="1.1em"></ph-subtitles>
               </button>
               <button class="settings-row" type="button" data-settings-target="speed">
                <span>Playback speed</span>
                <span class="settings-row-value speed-value">1.0x</span>
                <ph-caret-right aria-hidden="true" size="0.9em"></ph-caret-right>
              </button>
              <button class="settings-row settings-quality" type="button" data-settings-target="quality" hidden>
                <span>Quality</span>
                <span class="settings-row-value quality-value">Auto</span>
                <ph-caret-right aria-hidden="true" size="0.9em"></ph-caret-right>
              </button>
               <button class="settings-row settings-pip" part="pip-button" type="button" aria-label="Picture in picture (Shift+P)" title="Picture in picture (Shift+P)" data-tooltip="Picture in picture (Shift+P)" aria-keyshortcuts="Shift+P">
                <span>Picture in picture</span>
                <ph-picture-in-picture aria-hidden="true" size="1.1em"></ph-picture-in-picture>
               </button>
              </div>
              <div class="settings-subview caption-settings" data-settings-subview="captions" hidden>
                <div class="settings-heading">
                  <button class="settings-back" type="button" data-settings-back="menu" aria-label="Back to settings">
                    <ph-caret-left aria-hidden="true" size="0.9em"></ph-caret-left>
                  </button>
                  <strong>Captions</strong>
                </div>
                <button class="caption-toggle" type="button" data-caption-toggle role="switch" aria-checked="false">
                  <span>Display</span>
                  <span class="caption-toggle-track" aria-hidden="true"><span></span></span>
                </button>
                <div class="caption-setting-list">
                  <button class="caption-setting-row" type="button" data-caption-target="textColor">
                    <span>Text color</span><span class="caption-setting-value" data-caption-value="textColor"></span><ph-caret-right aria-hidden="true" size="0.85em"></ph-caret-right>
                  </button>
                  <button class="caption-setting-row" type="button" data-caption-target="textOpacity">
                    <span>Text opacity</span><span class="caption-setting-value" data-caption-value="textOpacity"></span><ph-caret-right aria-hidden="true" size="0.85em"></ph-caret-right>
                  </button>
                  <button class="caption-setting-row" type="button" data-caption-target="backgroundColor">
                    <span>Background</span><span class="caption-setting-value" data-caption-value="backgroundColor"></span><ph-caret-right aria-hidden="true" size="0.85em"></ph-caret-right>
                  </button>
                  <button class="caption-setting-row" type="button" data-caption-target="backgroundOpacity">
                    <span>Background opacity</span><span class="caption-setting-value" data-caption-value="backgroundOpacity"></span><ph-caret-right aria-hidden="true" size="0.85em"></ph-caret-right>
                  </button>
                  <button class="caption-setting-row" type="button" data-caption-target="fontSize">
                    <span>Font size</span><span class="caption-setting-value" data-caption-value="fontSize"></span><ph-caret-right aria-hidden="true" size="0.85em"></ph-caret-right>
                  </button>
                  <button class="caption-setting-row" type="button" data-caption-target="edgeStyle">
                    <span>Character edge</span><span class="caption-setting-value" data-caption-value="edgeStyle"></span><ph-caret-right aria-hidden="true" size="0.85em"></ph-caret-right>
                  </button>
                  <button class="caption-setting-row" type="button" data-caption-target="fontFamily">
                    <span>Font family</span><span class="caption-setting-value" data-caption-value="fontFamily"></span><ph-caret-right aria-hidden="true" size="0.85em"></ph-caret-right>
                  </button>
                </div>
                <div class="caption-setting-actions">
                  <button type="button" data-caption-action="reset-style">Reset style</button>
                  <button type="button" data-caption-action="reset-position">Reset position</button>
           </div>
         </div>
               <div class="settings-subview caption-option-view" data-settings-subview="caption-option" hidden>
                <div class="settings-heading">
                  <button class="settings-back" type="button" data-settings-back="captions" aria-label="Back to captions">
                    <ph-caret-left aria-hidden="true" size="0.9em"></ph-caret-left>
                  </button>
                  <strong class="caption-option-title"></strong>
                </div>
                <div class="caption-options" role="listbox"></div>
              </div>
             <div class="settings-subview" data-settings-subview="speed" hidden>
              <div class="settings-heading">
                <button class="settings-back" type="button" aria-label="Back to settings">
                  <ph-caret-left aria-hidden="true" size="0.9em"></ph-caret-left>
                </button>
                <strong>Playback speed</strong>
              </div>
              <div class="speed-value-large">1.0x</div>
              <div class="speed-stepper">
                <button type="button" data-speed-step="-1" aria-label="Decrease playback speed">-</button>
                <div class="speed-track" aria-hidden="true"><span class="speed-track-thumb"></span></div>
                <button type="button" data-speed-step="1" aria-label="Increase playback speed">+</button>
              </div>
              <div class="speed-presets" aria-label="Playback speed presets">
                <button type="button" data-speed="0.5">0.5</button>
                <button type="button" data-speed="1">1.0</button>
                <button type="button" data-speed="1.5">1.5</button>
                <button type="button" data-speed="2">2.0</button>
                <button type="button" data-speed="3">3.0</button>
              </div>
            </div>
             <div class="settings-subview" data-settings-subview="quality" hidden>
              <div class="settings-heading">
                <button class="settings-back" type="button" aria-label="Back to settings">
                  <ph-caret-left aria-hidden="true" size="0.9em"></ph-caret-left>
                </button>
                <strong>Quality</strong>
              </div>
               <div class="quality-options"></div>
             </div>
           </div>
             </div>
             <div class="chapters-panel" part="chapters-panel" hidden>
               <div class="chapters-heading">Chapters</div>
               <div class="chapters-list" role="listbox" aria-label="Video chapters"></div>
             </div>
             <div class="context-menu" part="context-menu" role="menu" hidden>
            <button type="button" role="menuitem" data-context-action="pip">
              <ph-picture-in-picture aria-hidden="true" size="1em"></ph-picture-in-picture><span>Picture-in-Picture</span>
            </button>
            <button type="button" role="menuitem" data-context-action="copy-frame">
              <ph-copy aria-hidden="true" size="1em"></ph-copy><span>Copy video frame</span>
            </button>
            <button type="button" role="menuitem" data-context-action="save-frame">
              <ph-download-simple aria-hidden="true" size="1em"></ph-download-simple><span>Save video frame</span>
            </button>
            <button type="button" role="menuitemcheckbox" data-context-action="loop" aria-checked="false">
              <ph-repeat aria-hidden="true" size="1em"></ph-repeat><span>Loop</span><ph-check class="context-check" aria-hidden="true" size="1em"></ph-check>
            </button>
          </div>
        </div>
    `;

    const video = this.shadowRoot.querySelector('video');
    const player = this.shadowRoot.querySelector<HTMLElement>('.player');
    const controls = this.shadowRoot.querySelector<HTMLElement>('.controls');
    const timelineArea = this.shadowRoot.querySelector<HTMLElement>('.timeline-area');
    const timeline = this.shadowRoot.querySelector<HTMLInputElement>('.timeline');
    const volume = this.shadowRoot.querySelector<HTMLInputElement>('.volume');
    const volumeButton =
      this.shadowRoot.querySelector<HTMLButtonElement>('.volume-button');
    const play = this.shadowRoot.querySelector<HTMLButtonElement>('.play');
    const settings = this.shadowRoot.querySelector<HTMLButtonElement>('.settings');
    const settingsPanel = this.shadowRoot.querySelector<HTMLElement>('.settings-panel');
    const settingsBack =
      this.shadowRoot.querySelectorAll<HTMLButtonElement>('.settings-back');
    const settingsRows = this.shadowRoot.querySelectorAll<HTMLButtonElement>(
      '[data-settings-target]',
    );
    const settingsPip = this.shadowRoot.querySelector<HTMLButtonElement>('.settings-pip');
    const settingsCaptions =
      this.shadowRoot.querySelector<HTMLButtonElement>('.settings-captions');
    const captionsToggle =
      this.shadowRoot.querySelector<HTMLButtonElement>('.captions-toggle');
    const chaptersToggle =
      this.shadowRoot.querySelector<HTMLButtonElement>('.chapters-toggle');
    const chaptersPanel = this.shadowRoot.querySelector<HTMLElement>('.chapters-panel');
    const loopToggle = this.shadowRoot.querySelector<HTMLButtonElement>('.loop-toggle');
    const contextMenu = this.shadowRoot.querySelector<HTMLElement>('.context-menu');
    const captionSettings =
      this.shadowRoot.querySelector<HTMLElement>('.caption-settings');
    const fullscreen = this.shadowRoot.querySelector<HTMLButtonElement>('.fullscreen');
    const previewImage = this.shadowRoot.querySelector<HTMLImageElement>(
      '.timeline-preview img',
    );
    const previewPlaceholder = this.shadowRoot.querySelector<HTMLElement>(
      '.thumbnail-placeholder',
    );
    if (
      !video ||
      !player ||
      !controls ||
      !timelineArea ||
      !timeline ||
      !volume ||
      !volumeButton ||
      !play ||
      !settings ||
      !settingsPanel ||
      !settingsPip ||
      !settingsCaptions ||
      !captionsToggle ||
      !chaptersToggle ||
      !chaptersPanel ||
      !loopToggle ||
      !contextMenu ||
      !captionSettings ||
      !fullscreen ||
      !previewImage ||
      !previewPlaceholder
    ) {
      return;
    }

    player.addEventListener('pointermove', () => {
      this.showControls();
    });
    player.addEventListener('pointerenter', () => {
      this.showControls();
    });
    player.addEventListener('pointerleave', () => {
      this.clearHideTimer();
      this.hideControls();
    });
    player.addEventListener('focusin', () => this.showControls());
    player.addEventListener('focusout', () => this.scheduleHide());
    player.addEventListener('pointerdown', (event) => {
      if (!contextMenu.contains(event.target as Node)) {
        this.closeContextMenu();
      }
      if (event.target === player || event.target === video) {
        player.focus({ preventScroll: true });
      }
      if (
        this.settingsOpen &&
        !settingsPanel.contains(event.target as Node) &&
        !settings.contains(event.target as Node)
      ) {
        this.settingsOpen = false;
        this.settingsView = 'menu';
        this.updateSettingsPanel();
      }
      if (
        this.chaptersOpen &&
        !chaptersPanel.contains(event.target as Node) &&
        !chaptersToggle.contains(event.target as Node)
      ) {
        this.closeChapters(chaptersToggle, chaptersPanel);
      }
    });
    play.addEventListener('click', () => {
      void this.togglePlayback();
    });
    video.addEventListener('click', () => {
      this.clearVideoClickTimer();
      this.videoClickTimer = setTimeout(() => {
        this.videoClickTimer = undefined;
        void this.togglePlayback(false);
      }, 200);
    });
    video.addEventListener('dblclick', () => {
      this.clearVideoClickTimer();
      void this.toggleFullscreen(true);
    });
    player.addEventListener('contextmenu', (event) => {
      if (contextMenu.contains(event.target as Node)) {
        return;
      }
      event.preventDefault();
      this.openContextMenu(contextMenu, event.clientX, event.clientY);
    });
    const handleKeydown = (event: KeyboardEvent) => {
      if (this.handleContextMenuKeydown(event, contextMenu)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (this.handleVideoKeydown(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    player.addEventListener('keydown', handleKeydown);
    video.addEventListener('keydown', (event) => {
      if (!event.bubbles) {
        handleKeydown(event);
      }
    });
    video.textTracks.addEventListener('addtrack', () => this.updateCaptionControl());
    video.textTracks.addEventListener('removetrack', () => this.updateCaptionControl());
    video.textTracks.addEventListener('change', () => this.updateCaptionControl());
    volumeButton.addEventListener('click', () => {
      if (this.player) {
        this.player.setMuted(!this.player.getState().muted);
        this.showControls();
      }
    });
    timeline.addEventListener('pointerdown', (event) => {
      if (timeline.disabled) {
        return;
      }
      this.scrubbing = true;
      this.showControls();
      timeline.setPointerCapture(event.pointerId);
      this.scrubTime = Number(timeline.value);
      this.setTimelineVisual(this.scrubTime);
    });
    timeline.addEventListener('input', () => {
      const time = Number(timeline.value);
      if (!Number.isFinite(time)) {
        return;
      }
      if (this.scrubbing) {
        this.scrubTime = time;
        this.setTimelineVisual(time);
      } else {
        this.player?.seek(time);
      }
      this.schedulePreview(time, this.timelineHovered ? undefined : undefined);
    });
    timeline.addEventListener('pointerup', () => this.finishScrubbing());
    timeline.addEventListener('pointercancel', () => this.finishScrubbing());
    timeline.addEventListener('change', () => {
      if (this.ignoreNextTimelineChange) {
        this.ignoreNextTimelineChange = false;
        return;
      }
      if (!this.scrubbing) {
        const time = Number(timeline.value);
        if (Number.isFinite(time)) {
          this.player?.seek(time);
        }
      }
    });
    timeline.addEventListener('keydown', () => this.showControls());
    timelineArea.addEventListener('pointerenter', () => {
      this.timelineHovered = true;
      this.showControls();
    });
    timelineArea.addEventListener('pointermove', (event) => {
      this.timelineHovered = true;
      this.showControls();
      this.schedulePreview(undefined, event.clientX);
    });
    timelineArea.addEventListener('pointerleave', () => {
      this.timelineHovered = false;
      this.hidePreview();
      this.scheduleHide();
    });
    volume.addEventListener('input', () => {
      const next = Number(volume.value);
      if (this.player && Number.isFinite(next)) {
        this.player.setVolume(next);
        if (next > 0 && this.player.getState().muted) {
          this.player.setMuted(false);
        }
      }
      this.showControls();
    });
    settings.addEventListener('click', () => {
      if (this.chaptersOpen) {
        this.closeChapters(chaptersToggle, chaptersPanel);
      }
      this.settingsOpen = !this.settingsOpen;
      if (!this.settingsOpen) {
        this.settingsView = 'menu';
      }
      this.updateSettingsPanel();
      if (this.settingsOpen) {
        this.focusSettingsView();
      }
      this.showControls();
    });
    settingsRows.forEach((row) => {
      row.addEventListener('click', () => {
        const target = row.dataset.settingsTarget;
        if (target === 'speed' || target === 'quality' || target === 'captions') {
          this.settingsView = target;
          this.settingsOpen = true;
          this.updateSettingsPanel();
          this.focusSettingsView();
          this.showControls();
        }
      });
    });
    captionsToggle.addEventListener('click', () => {
      this.toggleCaptions();
      this.showControls();
    });
    chaptersToggle.addEventListener('click', () => {
      this.toggleChapters(chaptersToggle, chaptersPanel);
      this.showControls();
    });
    chaptersPanel.addEventListener('keydown', (event) => {
      if (this.handleChaptersKeydown(event, chaptersToggle, chaptersPanel)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    loopToggle.addEventListener('click', () => {
      this.toggleLoop();
    });
    captionSettings
      .querySelector<HTMLButtonElement>('[data-caption-toggle]')
      ?.addEventListener('click', () => {
        this.captionRenderer?.setEnabled(!(this.captionRenderer?.isEnabled ?? false));
        this.updateCaptionControl();
        this.showControls();
      });
    captionSettings
      .querySelectorAll<HTMLButtonElement>('[data-caption-target]')
      .forEach((row) => {
        row.addEventListener('click', () => {
          const target = row.dataset.captionTarget as CaptionSettingKey | undefined;
          if (!target) {
            return;
          }
          this.settingsView = `caption-${target}`;
          this.updateSettingsPanel();
          this.focusSettingsView();
          this.showControls();
        });
      });
    captionSettings
      .querySelectorAll<HTMLButtonElement>('[data-caption-action]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          if (button.dataset.captionAction === 'reset-style') {
            this.setCaptionPreferences({
              textColor: DEFAULT_CAPTION_PREFERENCES.textColor,
              textOpacity: DEFAULT_CAPTION_PREFERENCES.textOpacity,
              backgroundColor: DEFAULT_CAPTION_PREFERENCES.backgroundColor,
              backgroundOpacity: DEFAULT_CAPTION_PREFERENCES.backgroundOpacity,
              fontSize: DEFAULT_CAPTION_PREFERENCES.fontSize,
              edgeStyle: DEFAULT_CAPTION_PREFERENCES.edgeStyle,
              fontFamily: DEFAULT_CAPTION_PREFERENCES.fontFamily,
            });
          } else {
            this.captionRenderer?.resetPosition();
          }
          this.updateCaptionSettings();
        });
      });
    settingsBack.forEach((button) => {
      button.addEventListener('click', () => {
        const backTarget = button.dataset.settingsBack;
        this.settingsView = backTarget === 'captions' ? 'captions' : 'menu';
        this.updateSettingsPanel();
        this.focusSettingsView();
        this.showControls();
      });
    });
    this.shadowRoot
      .querySelectorAll<HTMLButtonElement>('[data-speed-step]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const direction = Number(button.dataset.speedStep);
          const current = this.player?.getState().playbackRate ?? 1;
          this.setPlaybackRate(current + direction * 0.5);
        });
      });
    this.shadowRoot
      .querySelectorAll<HTMLButtonElement>('[data-speed]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          this.setPlaybackRate(Number(button.dataset.speed));
        });
      });
    settingsPip.addEventListener('click', () => {
      void this.toggleDocumentPictureInPicture();
    });
    contextMenu
      .querySelectorAll<HTMLButtonElement>('[data-context-action]')
      .forEach((item) => {
        item.addEventListener('click', () => {
          void this.handleContextMenuAction(item.dataset.contextAction ?? '');
        });
      });
    fullscreen.addEventListener('click', () => {
      void this.toggleFullscreen();
    });
    previewImage.addEventListener('error', () => {
      if (previewImage.dataset.requestId === String(this.previewRequestId)) {
        this.showThumbnailPlaceholder(previewImage, previewPlaceholder);
      }
    });
    this.initialized = true;
  }

  private async initialize(): Promise<void> {
    if (!this.shadowRoot || !this.connected) {
      return;
    }
    const id = ++this.initializationId;
    this.clearHideTimer();
    this.hidePreview();
    this.unsubscribeState?.();
    this.unsubscribeState = undefined;
    this.unsubscribeChapters?.();
    this.unsubscribeChapters = undefined;
    this.latestChapters = [];
    this.chaptersOpen = false;
    this.captionRenderer?.destroy();
    this.captionRenderer = undefined;
    this.trackingData = this.player?.getTrackingData() ?? this.trackingData;
    this.notifyPlayerChange(null);
    this.player?.destroy();
    this.player = undefined;

    const video = this.shadowRoot.querySelector('video');
    const container = this.shadowRoot.querySelector<HTMLElement>('.player');
    if (!video) {
      return;
    }
    const src = this.getAttribute('src');
    if (!src) {
      this.showMessage('Set a src attribute to load a video.');
      return;
    }
    const source: MediaSource = {
      id: this.getAttribute('source-id') ?? src,
      src,
      ...(this.getAttribute('type')
        ? { type: this.getAttribute('type') ?? undefined }
        : {}),
      ...(this.getAttribute('poster')
        ? { poster: this.getAttribute('poster') ?? undefined }
        : {}),
      thumbnails: {
        ...(this.getAttribute('thumbnail-vtt')
          ? { src: this.getAttribute('thumbnail-vtt') ?? undefined }
          : {}),
        fallback:
          this.getAttribute('thumbnail-fallback') === 'generated' ? 'generated' : 'none',
        crossOrigin:
          this.getAttribute('thumbnail-crossorigin') === 'use-credentials'
            ? 'use-credentials'
            : 'anonymous',
      },
      ...(this.getAttribute('caption-src')
        ? {
            captions: [
              {
                src: this.getAttribute('caption-src') ?? '',
                kind:
                  (this.getAttribute('caption-kind') as
                    'subtitles' | 'captions' | 'descriptions' | 'metadata' | null) ??
                  'subtitles',
                srclang: this.getAttribute('caption-lang') ?? undefined,
                label: this.getAttribute('caption-label') ?? undefined,
                default: this.getAttribute('caption-default') !== 'false',
              },
            ],
          }
        : {}),
      ...(this.getAttribute('chapter-src')
        ? {
            chapterTrack: {
              src: this.getAttribute('chapter-src') ?? '',
              srclang: this.getAttribute('chapter-lang') ?? undefined,
              label: this.getAttribute('chapter-label') ?? undefined,
            } satisfies ChapterTrack,
          }
        : {}),
    };
    const engines =
      isHlsSource(source) && !video.canPlayType(source.type ?? '')
        ? await this.loadHlsEngine()
        : [];
    if (!this.connected || id !== this.initializationId) {
      return;
    }

    this.player = new MediaPlayer(video, {
      fullscreenElement: container ?? undefined,
      engines,
      tracking: {
        initialData: this.trackingData,
      },
      seekPolicy: {
        mode: this.getAttribute('seek-policy') === 'watched' ? 'watched' : 'unrestricted',
      },
    });
    const controls = this.shadowRoot.querySelector<HTMLElement>('.controls');
    if (container && controls) {
      this.captionRenderer = new CaptionRenderer(
        video,
        container,
        controls,
        (preferences) => {
          const detail: CaptionPreferencesChangeDetail = { preferences };
          this.dispatchEvent(
            new CustomEvent<CaptionPreferencesChangeDetail>(
              'caption-preferences-change',
              {
                detail,
                bubbles: true,
                composed: true,
              },
            ),
          );
          this.updateCaptionControl();
          this.updateCaptionSettings();
        },
        (dragging) => {
          this.captionDragging = dragging;
          if (!dragging) {
            this.scheduleHide();
          }
        },
      );
    }
    this.notifyPlayerChange(this.player);
    this.latestChapters = this.player.getChapters();
    this.unsubscribeChapters = this.player.on('chapters-change', ({ chapters }) => {
      this.latestChapters = chapters;
      this.updateChapterControl();
      this.updateChapterMarkers(this.latestState);
    });
    this.unsubscribeState = this.player.subscribe((state) => {
      this.latestState = state;
      const nextTracking = this.player?.getTrackingData();
      if (nextTracking) {
        this.trackingData = nextTracking;
      }
      this.updateControls(state);
    });
    try {
      await this.player.load(source);
      if (id === this.initializationId) {
        this.showMessage('');
      }
    } catch (error) {
      if (id === this.initializationId) {
        this.showMessage(
          error instanceof Error ? error.message : 'Unable to load video.',
        );
      }
    }
    if (id === this.initializationId) {
      this.updateCaptionControl();
    }
  }

  private scheduleInitialize(): void {
    if (this.initializeScheduled) {
      return;
    }
    this.initializeScheduled = true;
    Promise.resolve().then(() => {
      this.initializeScheduled = false;
      if (this.connected) {
        void this.initialize();
      }
    });
  }

  private async loadHlsEngine() {
    try {
      const module = await import('hls.js');
      const Hls = (module.default ?? module) as HlsConstructor;
      return [new HlsEngine(Hls)];
    } catch {
      return [];
    }
  }

  private updateControls(state: PlayerState): void {
    if (!this.shadowRoot) {
      return;
    }
    const statusChanged = this.lastControlStatus !== state.status;
    this.lastControlStatus = state.status;
    const timeline = this.shadowRoot.querySelector<HTMLInputElement>('.timeline');
    const volume = this.shadowRoot.querySelector<HTMLInputElement>('.volume');
    const play = this.shadowRoot.querySelector<HTMLButtonElement>('.play');
    const volumeButton =
      this.shadowRoot.querySelector<HTMLButtonElement>('.volume-button');
    const volumeControl = this.shadowRoot.querySelector<HTMLElement>('.volume-control');
    const settings = this.shadowRoot.querySelector<HTMLButtonElement>('.settings');
    const loopToggle = this.shadowRoot.querySelector<HTMLButtonElement>('.loop-toggle');
    const contextMenu = this.shadowRoot.querySelector<HTMLElement>('.context-menu');
    const captionsToggle =
      this.shadowRoot.querySelector<HTMLButtonElement>('.captions-toggle');
    const chaptersToggle =
      this.shadowRoot.querySelector<HTMLButtonElement>('.chapters-toggle');
    const pictureInPicture =
      this.shadowRoot.querySelector<HTMLButtonElement>('.settings-pip');
    const fullscreen = this.shadowRoot.querySelector<HTMLButtonElement>('.fullscreen');
    const time = this.shadowRoot.querySelector<HTMLElement>('.time');
    const live = this.shadowRoot.querySelector<HTMLElement>('.live');
    if (
      !timeline ||
      !volume ||
      !play ||
      !volumeButton ||
      !volumeControl ||
      !settings ||
      !loopToggle ||
      !contextMenu ||
      !captionsToggle ||
      !chaptersToggle ||
      !pictureInPicture ||
      !fullscreen ||
      !time ||
      !live
    ) {
      return;
    }

    const liveStart = state.seekable[0]?.start ?? 0;
    const liveEnd = state.seekable[state.seekable.length - 1]?.end ?? 0;
    timeline.min = state.streamType === 'live' ? String(liveStart) : '0';
    timeline.max =
      state.streamType === 'live' ? String(liveEnd) : String(state.duration ?? 0);
    timeline.disabled = state.streamType === 'vod' && !state.duration;
    const displayTime = this.scrubbing
      ? (this.scrubTime ?? state.currentTime)
      : state.currentTime;
    if (!this.scrubbing) {
      timeline.value = String(
        clamp(
          displayTime,
          Number(timeline.min),
          Math.max(Number(timeline.min), Number(timeline.max)),
        ),
      );
    }
    this.setTimelineVisual(displayTime, state);
    volume.value = String(state.volume);
    volume.style.setProperty('--volume-position', `${state.volume * 100}%`);
    const playing =
      state.status === 'playing' ||
      (state.status === 'buffering' &&
        this.player !== undefined &&
        !this.player.video.paused &&
        !this.player.video.ended);
    play.classList.toggle('is-playing', playing);
    volumeControl.classList.toggle('is-muted', state.muted || state.volume <= 0);
    volumeControl.classList.toggle(
      'is-low',
      !state.muted && state.volume > 0 && state.volume <= 0.5,
    );
    fullscreen.classList.toggle('is-fullscreen', state.fullscreen);
    const playLabel = playing ? 'Pause (K / Space)' : 'Play (K / Space)';
    play.setAttribute('aria-label', playLabel);
    play.title = playLabel;
    play.dataset.tooltip = playLabel;
    const volumeLabel = state.muted ? 'Unmute (M)' : 'Mute (M)';
    volumeButton.setAttribute('aria-label', volumeLabel);
    volumeButton.title = volumeLabel;
    volumeButton.dataset.tooltip = volumeLabel;
    fullscreen.setAttribute(
      'aria-label',
      state.fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)',
    );
    fullscreen.title = state.fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
    fullscreen.dataset.tooltip = fullscreen.title;
    time.textContent =
      state.streamType === 'live'
        ? formatTime(displayTime)
        : `${formatTime(displayTime)} / ${formatTime(state.duration ?? 0)}`;
    live.hidden = state.streamType !== 'live';
    pictureInPicture.setAttribute(
      'aria-label',
      state.pictureInPicture ? 'Exit picture in picture' : 'Picture in picture',
    );
    pictureInPicture.title = state.pictureInPicture
      ? 'Exit picture in picture (Shift+P)'
      : 'Picture in picture (Shift+P)';
    pictureInPicture.dataset.tooltip = pictureInPicture.title;
    loopToggle.disabled = state.streamType === 'live';
    loopToggle.setAttribute('aria-pressed', String(state.loop));
    loopToggle.setAttribute('aria-label', state.loop ? 'Loop on' : 'Loop off');
    loopToggle.title = state.loop ? 'Loop on' : 'Loop off';
    loopToggle.dataset.tooltip = loopToggle.title;
    loopToggle.classList.toggle('is-active', state.loop);
    const contextLoop = contextMenu.querySelector<HTMLButtonElement>(
      '[data-context-action="loop"]',
    );
    if (contextLoop) {
      contextLoop.disabled = state.streamType === 'live';
      contextLoop.setAttribute('aria-checked', String(state.loop));
      contextLoop.classList.toggle('is-selected', state.loop);
    }
    this.updateSettingsPanel(state);
    this.updateQualityControls(state);
    this.updateCaptionControl();
    this.updateChapterControl();
    this.updateChapterMarkers(state);
    if (state.status !== 'playing') {
      this.showControls(false);
    } else if (statusChanged) {
      this.scheduleHide();
    }
  }

  private async togglePlayback(showFeedback = false): Promise<void> {
    if (!this.player) {
      return;
    }
    try {
      if (!this.player.video.paused && !this.player.video.ended) {
        this.player.pause();
      } else {
        await this.player.play();
      }
      if (showFeedback) {
        this.showShortcutFeedback(
          !this.player.video.paused && !this.player.video.ended ? 'play' : 'pause',
        );
      }
      this.showControls();
    } catch (error) {
      this.showMessage(this.errorMessage(error));
    }
  }

  private async toggleFullscreen(showFeedback = false): Promise<void> {
    if (!this.player) {
      return;
    }
    try {
      const shell = this.shadowRoot?.querySelector<HTMLElement>('.player');
      const root = shell?.getRootNode() as Document | ShadowRoot | undefined;
      const isFullscreen =
        this.player.getState().fullscreen ||
        (root !== undefined &&
          'fullscreenElement' in root &&
          root.fullscreenElement === shell) ||
        shell?.ownerDocument.fullscreenElement === shell ||
        (typeof ShadowRoot !== 'undefined' &&
          root instanceof ShadowRoot &&
          shell?.ownerDocument.fullscreenElement === root.host);
      if (isFullscreen) {
        await this.player.exitFullscreen();
      } else {
        await this.player.enterFullscreen();
      }
      if (showFeedback) {
        this.showShortcutFeedback(isFullscreen ? 'fullscreen-exit' : 'fullscreen-enter');
      }
      this.showControls();
    } catch (error) {
      this.showMessage(this.errorMessage(error));
    }
  }

  private handleVideoKeydown(event: KeyboardEvent): boolean {
    if (!this.player) {
      return false;
    }
    const player = this.shadowRoot?.querySelector<HTMLElement>('.player');
    const video = this.shadowRoot?.querySelector<HTMLVideoElement>('video');
    const target = event.target as HTMLElement | null;
    const isPlayerSurface = target === player || target === video;
    const isGlobalShortcut = ['k', 'K', 'm', 'M', 'c', 'C', 'f', 'F', 's', 'S'].includes(
      event.key,
    );
    if (
      !isPlayerSurface &&
      !isGlobalShortcut &&
      !(event.shiftKey && ['p', 'P'].includes(event.key))
    ) {
      return false;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return false;
    }
    if (
      event.repeat &&
      [' ', 'Enter', 'k', 'K', 'm', 'M', 'c', 'C', 'f', 'F', 's', 'S', 'p', 'P'].includes(
        event.key,
      )
    ) {
      return false;
    }
    switch (event.key) {
      case ' ':
      case 'Enter':
      case 'k':
      case 'K':
        void this.togglePlayback(true);
        return true;
      case 'ArrowLeft':
        this.seekBy(-5, true);
        return true;
      case 'ArrowRight':
        this.seekBy(5, true);
        return true;
      case 'ArrowUp':
        this.adjustVolume(0.05, true);
        return true;
      case 'ArrowDown':
        this.adjustVolume(-0.05, true);
        return true;
      case 'm':
      case 'M':
        this.player.setMuted(!this.player.getState().muted);
        this.showShortcutFeedback('mute');
        this.showControls();
        return true;
      case 'c':
      case 'C':
        if (this.toggleCaptions()) {
          this.showShortcutFeedback('captions');
          this.showControls();
        }
        return true;
      case 'f':
      case 'F':
        void this.toggleFullscreen(true);
        return true;
      case 's':
      case 'S':
        this.settingsOpen = !this.settingsOpen;
        if (!this.settingsOpen) {
          this.settingsView = 'menu';
        }
        this.updateSettingsPanel();
        if (this.settingsOpen) {
          this.focusSettingsView();
        }
        this.showControls();
        return true;
      case 'p':
      case 'P':
        if (!event.shiftKey) {
          return false;
        }
        void this.toggleDocumentPictureInPicture();
        return true;
      case 'Home':
        this.player.seek(
          this.latestState?.streamType === 'live'
            ? (this.latestState.seekable[0]?.start ?? 0)
            : 0,
        );
        this.showControls();
        return true;
      case 'End': {
        const state = this.latestState;
        const end =
          state?.streamType === 'live'
            ? (state.seekable.at(-1)?.end ?? state.currentTime)
            : (state?.duration ?? state?.currentTime ?? 0);
        this.player.seek(end);
        this.showControls();
        return true;
      }
      default:
        return false;
    }
  }

  private seekBy(delta: number, showFeedback = false): void {
    if (!this.player) {
      return;
    }
    const state = this.player.getState();
    this.player.seek(state.currentTime + delta);
    if (showFeedback) {
      this.showShortcutFeedback(
        delta < 0 ? 'seek-left' : 'seek-right',
        `${Math.abs(delta)}`,
      );
    }
    this.showControls();
  }

  private adjustVolume(delta: number, showFeedback = false): void {
    if (!this.player) {
      return;
    }
    const state = this.player.getState();
    const volume = clamp(state.volume + delta, 0, 1);
    this.player.setVolume(volume);
    if (volume > 0 && state.muted) {
      this.player.setMuted(false);
    }
    if (showFeedback) {
      this.showShortcutFeedback('volume', `${Math.round(volume * 100)}%`);
    }
    this.showControls();
  }

  private focusSettingsView(): void {
    queueMicrotask(() => {
      if (!this.settingsOpen) {
        return;
      }
      const panel = this.shadowRoot?.querySelector<HTMLElement>('.settings-panel');
      if (!panel) {
        return;
      }
      const selector =
        this.settingsView === 'menu'
          ? '[data-settings-target]:not([hidden]):not(:disabled)'
          : this.settingsView === 'captions'
            ? '[data-caption-toggle]:not(:disabled)'
            : this.settingsView === 'speed'
              ? '[data-speed-step]:not(:disabled)'
              : this.settingsView === 'quality'
                ? '[data-quality]:not(:disabled)'
                : '.caption-options [data-caption-option]:not(:disabled)';
      panel.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
    });
  }

  private openContextMenu(menu: HTMLElement, clientX?: number, clientY?: number): void {
    this.closeContextMenu();
    menu.hidden = false;
    const player = this.shadowRoot?.querySelector<HTMLElement>('.player');
    if (!player) {
      return;
    }
    const playerRect = player.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const x = clientX === undefined ? playerRect.width / 2 : clientX - playerRect.left;
    const y = clientY === undefined ? playerRect.height / 2 : clientY - playerRect.top;
    menu.style.left = `${clamp(x, 0, Math.max(0, playerRect.width - menuRect.width))}px`;
    menu.style.top = `${clamp(y, 0, Math.max(0, playerRect.height - menuRect.height))}px`;
    this.contextMenuOutsidePointerDown = (event) => {
      if (!this.contains(event.target as Node)) {
        this.closeContextMenu();
      }
    };
    this.contextMenuDocument = this.ownerDocument;
    this.contextMenuDocument.addEventListener(
      'pointerdown',
      this.contextMenuOutsidePointerDown,
    );
    menu.querySelector<HTMLButtonElement>('[data-context-action]:not(:disabled)')?.focus({
      preventScroll: true,
    });
    this.showControls();
  }

  private closeContextMenu(): void {
    const menu = this.shadowRoot?.querySelector<HTMLElement>('.context-menu');
    if (menu) {
      menu.hidden = true;
      menu.style.left = '';
      menu.style.top = '';
    }
    if (this.contextMenuOutsidePointerDown) {
      (this.contextMenuDocument ?? this.ownerDocument).removeEventListener(
        'pointerdown',
        this.contextMenuOutsidePointerDown,
      );
      this.contextMenuOutsidePointerDown = undefined;
      this.contextMenuDocument = undefined;
    }
  }

  private handleContextMenuKeydown(event: KeyboardEvent, menu: HTMLElement): boolean {
    const items = [
      ...menu.querySelectorAll<HTMLButtonElement>('[data-context-action]'),
    ].filter((item) => !item.disabled);
    if (
      menu.hidden &&
      (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) &&
      (event.target === this.shadowRoot?.querySelector('.player') ||
        event.target === this.shadowRoot?.querySelector('video'))
    ) {
      this.openContextMenu(menu);
      return true;
    }
    if (menu.hidden || !menu.contains(event.target as Node)) {
      return false;
    }
    const current = this.shadowRoot?.activeElement;
    const currentIndex = items.indexOf(current as HTMLButtonElement);
    if (event.key === 'Escape') {
      this.closeContextMenu();
      this.shadowRoot
        ?.querySelector<HTMLElement>('.player')
        ?.focus({ preventScroll: true });
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = items[(currentIndex + direction + items.length) % items.length];
      next?.focus({ preventScroll: true });
      return true;
    }
    if (event.key === 'Home' || event.key === 'End') {
      (event.key === 'Home' ? items[0] : items.at(-1))?.focus({ preventScroll: true });
      return true;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const item = items[currentIndex >= 0 ? currentIndex : 0];
      if (item) {
        void this.handleContextMenuAction(item.dataset.contextAction ?? '');
      }
      return true;
    }
    return false;
  }

  private async handleContextMenuAction(action: string): Promise<void> {
    const keepsMenuFocused = action === 'copy-frame' || action === 'save-frame';
    if (!keepsMenuFocused) {
      this.closeContextMenu();
    }
    switch (action) {
      case 'pip':
        await this.toggleDocumentPictureInPicture();
        break;
      case 'loop':
        this.toggleLoop();
        break;
      case 'copy-frame':
        await this.copyCurrentFrame();
        break;
      case 'save-frame':
        await this.saveCurrentFrame();
        break;
      default:
        break;
    }
    if (keepsMenuFocused) {
      this.closeContextMenu();
      this.focusPlayer();
    }
  }

  private focusPlayer(): void {
    this.shadowRoot?.querySelector<HTMLElement>('.player')?.focus({
      preventScroll: true,
    });
  }

  private async captureCurrentFrame(): Promise<Blob> {
    const video = this.shadowRoot?.querySelector<HTMLVideoElement>('video');
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      throw new Error('A video frame is not ready yet.');
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      throw new Error('A video frame is not ready yet.');
    }
    const canvas = this.ownerDocument.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas is unavailable.');
      }
      context.drawImage(video, 0, 0, width, height);
    } catch {
      throw new Error('This video does not allow frame capture.');
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) {
      throw new Error('This video does not allow frame capture.');
    }
    return blob;
  }

  private async copyCurrentFrame(): Promise<void> {
    try {
      const menuItem = this.shadowRoot?.querySelector<HTMLButtonElement>(
        '[data-context-action="copy-frame"]',
      );
      menuItem?.focus({ preventScroll: true });
      const view = this.ownerDocument.defaultView as ClipboardWindow | null;
      const clipboardItem =
        view?.ClipboardItem ??
        (typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem);
      if (!view?.navigator.clipboard?.write || !clipboardItem) {
        throw new Error('Copying video frames is not supported by this browser.');
      }
      view.focus();
      menuItem?.focus({ preventScroll: true });
      const frame = this.captureCurrentFrame();
      await view.navigator.clipboard.write([new clipboardItem({ 'image/png': frame })]);
    } catch (error) {
      this.showMessage(this.errorMessage(error));
    }
  }

  private async saveCurrentFrame(): Promise<void> {
    try {
      const blob = await this.captureCurrentFrame();
      const view = this.ownerDocument.defaultView;
      const urlApi = view?.URL ?? URL;
      const url = urlApi.createObjectURL(blob);
      const link = this.ownerDocument.createElement('a');
      link.href = url;
      link.download = `video-frame-${formatTime(this.player?.getState().currentTime ?? 0).replace(/:/g, '-')}.png`;
      link.click();
      urlApi.revokeObjectURL(url);
    } catch (error) {
      this.showMessage(this.errorMessage(error));
    }
  }

  private updateSettingsPanel(state = this.latestState): void {
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.settings-panel');
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>('.settings');
    if (!panel || !button) {
      return;
    }
    panel.hidden = !this.settingsOpen;
    button.setAttribute('aria-expanded', String(this.settingsOpen));
    const menu = panel.querySelector<HTMLElement>('[data-settings-view="menu"]');
    if (menu) {
      menu.hidden = this.settingsView !== 'menu';
    }
    panel.querySelectorAll<HTMLElement>('[data-settings-subview]').forEach((view) => {
      const isCaptionOptionView =
        view.dataset.settingsSubview === 'caption-option' &&
        this.settingsView.startsWith('caption-');
      view.hidden =
        !this.settingsOpen ||
        (view.dataset.settingsSubview !== this.settingsView && !isCaptionOptionView);
    });
    if (this.settingsView.startsWith('caption-')) {
      this.updateCaptionOptionView(panel);
    }
    const speed = state?.playbackRate ?? 1;
    const speedText = formatPlaybackRate(speed);
    panel.querySelectorAll<HTMLElement>('.speed-value').forEach((element) => {
      element.textContent = speedText;
    });
    panel.querySelectorAll<HTMLElement>('.speed-value-large').forEach((element) => {
      element.textContent = speedText;
    });
    const thumb = panel.querySelector<HTMLElement>('.speed-track-thumb');
    if (thumb) {
      const position = ((clamp(speed, 0.5, 3) - 0.5) / 2.5) * 100;
      thumb.style.left = `${position}%`;
    }
    const qualityValue = panel.querySelector<HTMLElement>('.quality-value');
    if (qualityValue && state) {
      qualityValue.textContent = formatQualitySelection(
        state.quality,
        state.qualityLevels,
      );
    }
    panel.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((preset) => {
      preset.classList.toggle(
        'is-selected',
        Number(preset.dataset.speed) === Number(speed.toFixed(1)),
      );
    });
  }

  private updateCaptionOptionView(panel: HTMLElement): void {
    const setting = this.settingsView.slice('caption-'.length) as CaptionSettingKey;
    const options = CAPTION_SETTING_OPTIONS[setting];
    const title = panel.querySelector<HTMLElement>('.caption-option-title');
    const list = panel.querySelector<HTMLElement>('.caption-options');
    if (!options || !title || !list) {
      return;
    }
    const current = String(this.captionPreferences[setting]);
    title.textContent = CAPTION_SETTING_LABELS[setting];
    list.innerHTML = options
      .map(
        (option) => `
          <button class="caption-option${option.value === current ? ' is-selected' : ''}" type="button" role="option" aria-selected="${option.value === current}" data-caption-option="${option.value}">
            <span>${option.label}</span>
            <ph-check aria-hidden="true" size="1em"></ph-check>
          </button>`,
      )
      .join('');
    list
      .querySelectorAll<HTMLButtonElement>('[data-caption-option]')
      .forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.dataset.captionOption;
          if (!value) {
            return;
          }
          const numeric =
            setting === 'textOpacity' ||
            setting === 'backgroundOpacity' ||
            setting === 'fontSize';
          this.setCaptionPreferences({
            [setting]: numeric ? Number(value) : value,
          } as CaptionPreferencePatch);
          this.settingsView = 'captions';
          this.updateSettingsPanel();
          this.showControls();
        });
      });
  }

  private updateQualityControls(state: PlayerState): void {
    const row = this.shadowRoot?.querySelector<HTMLElement>('.settings-quality');
    const options = this.shadowRoot?.querySelector<HTMLElement>('.quality-options');
    if (!row || !options) {
      return;
    }
    row.hidden = state.qualityLevels.length === 0;
    const signature = state.qualityLevels
      .map((level) => `${level.id}:${level.label}`)
      .join('|');
    if (options.dataset.signature !== signature) {
      options.dataset.signature = signature;
      options.innerHTML = [
        '<button class="quality-option" type="button" data-quality="auto"><span>Auto</span><ph-check aria-hidden="true" size="1em"></ph-check></button>',
        ...[...state.qualityLevels]
          .sort((left, right) => (right.height ?? 0) - (left.height ?? 0))
          .map(
            (level) =>
              `<button class="quality-option" type="button" data-quality="${level.id}"><span>${level.label}</span><ph-check aria-hidden="true" size="1em"></ph-check></button>`,
          ),
      ].join('');
      options.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.dataset.quality;
          const quality: QualitySelection = value === 'auto' ? 'auto' : Number(value);
          try {
            this.player?.setQuality(quality);
            this.settingsView = 'menu';
            this.updateSettingsPanel();
          } catch (error) {
            this.showMessage(this.errorMessage(error));
          }
        });
      });
    }
    options.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((option) => {
      const value = option.dataset.quality;
      option.classList.toggle(
        'is-selected',
        (value === 'auto' && state.quality === 'auto') ||
          (value !== 'auto' && Number(value) === state.quality),
      );
    });
  }

  private updateCaptionControl(): void {
    const button =
      this.shadowRoot?.querySelector<HTMLButtonElement>('.settings-captions');
    const directButton =
      this.shadowRoot?.querySelector<HTMLButtonElement>('.captions-toggle');
    if (!button) {
      return;
    }
    const available = this.captionRenderer?.hasTracks ?? false;
    const showing = this.captionRenderer?.isEnabled ?? false;
    const value = button.querySelector<HTMLElement>('.captions-value');
    button.disabled = !available;
    if (value) {
      value.textContent = !available ? 'Unavailable' : showing ? 'On' : 'Off';
    }
    button.setAttribute('aria-pressed', String(showing));
    button.title = !available ? 'Captions unavailable' : 'Captions (C)';
    button.dataset.tooltip = button.title;
    button.setAttribute(
      'aria-label',
      !available
        ? 'Captions unavailable'
        : showing
          ? 'Hide captions (C)'
          : 'Show captions (C)',
    );
    if (directButton) {
      directButton.hidden = !available;
      directButton.disabled = !available;
      directButton.setAttribute('aria-pressed', String(showing));
      directButton.setAttribute(
        'aria-label',
        !available
          ? 'Captions unavailable'
          : showing
            ? 'Hide captions (C)'
            : 'Show captions (C)',
      );
      directButton.title = !available
        ? 'Captions unavailable'
        : showing
          ? 'Hide captions (C)'
          : 'Show captions (C)';
      directButton.dataset.tooltip = directButton.title;
      directButton.classList.toggle('is-active', showing);
    }
    this.updateCaptionSettings();
  }

  private updateChapterControl(): void {
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>('.chapters-toggle');
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.chapters-panel');
    const list = this.shadowRoot?.querySelector<HTMLElement>('.chapters-list');
    if (!button || !panel || !list) {
      return;
    }
    const available = this.latestChapters.length > 0;
    if (!available) {
      this.chaptersOpen = false;
    }
    button.hidden = !available;
    button.disabled = !available;
    button.setAttribute('aria-expanded', String(available && this.chaptersOpen));
    button.setAttribute('aria-label', available ? 'Chapters' : 'Chapters unavailable');
    button.title = available ? 'Chapters' : 'Chapters unavailable';
    button.dataset.tooltip = button.title;
    panel.hidden = !available || !this.chaptersOpen;

    const signature = this.latestChapters
      .map(
        (chapter) =>
          `${chapter.id ?? ''}:${chapter.startTime}:${chapter.endTime}:${chapter.title}`,
      )
      .join('|');
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;
      list.replaceChildren(
        ...this.latestChapters.map((chapter, index) => {
          const item = this.ownerDocument.createElement('button');
          item.type = 'button';
          item.className = 'chapter-row';
          item.dataset.chapterIndex = String(index);
          item.setAttribute('role', 'option');
          const title = this.ownerDocument.createElement('span');
          title.className = 'chapter-title';
          title.textContent = chapter.title;
          const time = this.ownerDocument.createElement('span');
          time.className = 'chapter-time';
          time.textContent = formatTime(chapter.startTime);
          item.append(title, time);
          item.addEventListener('click', () => this.selectChapter(index));
          return item;
        }),
      );
    }

    const currentTime = this.latestState?.currentTime ?? 0;
    const active = findChapter(this.latestChapters, currentTime);
    list.querySelectorAll<HTMLButtonElement>('.chapter-row').forEach((item, index) => {
      const chapter = this.latestChapters[index];
      const isActive = chapter === active;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-selected', String(isActive));
    });
  }

  private toggleChapters(button: HTMLButtonElement, panel: HTMLElement): void {
    if (this.latestChapters.length === 0) {
      return;
    }
    if (this.chaptersOpen) {
      this.closeChapters(button, panel);
      return;
    }
    this.closeContextMenu();
    this.settingsOpen = false;
    this.settingsView = 'menu';
    this.updateSettingsPanel();
    this.chaptersOpen = true;
    this.updateChapterControl();
    const activeIndex = this.latestChapters.findIndex((chapter) =>
      this.isChapterActive(chapter),
    );
    queueMicrotask(() => {
      panel
        .querySelectorAll<HTMLButtonElement>('.chapter-row')
        .item(activeIndex >= 0 ? activeIndex : 0)
        ?.focus({ preventScroll: true });
    });
  }

  private closeChapters(button: HTMLButtonElement, panel: HTMLElement): void {
    this.chaptersOpen = false;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  private handleChaptersKeydown(
    event: KeyboardEvent,
    button: HTMLButtonElement,
    panel: HTMLElement,
  ): boolean {
    if (event.key === 'Escape') {
      this.closeChapters(button, panel);
      button.focus({ preventScroll: true });
      return true;
    }
    const items = [...panel.querySelectorAll<HTMLButtonElement>('.chapter-row')];
    const current = items.indexOf(this.shadowRoot?.activeElement as HTMLButtonElement);
    if (items.length === 0) {
      return false;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + direction + items.length) % items.length]?.focus({
        preventScroll: true,
      });
      return true;
    }
    if (event.key === 'Home' || event.key === 'End') {
      (event.key === 'Home' ? items[0] : items.at(-1))?.focus({ preventScroll: true });
      return true;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const index = current >= 0 ? current : 0;
      this.selectChapter(index);
      return true;
    }
    return false;
  }

  private selectChapter(index: number): void {
    const chapter = this.latestChapters[index];
    if (!chapter || !this.player) {
      return;
    }
    this.player.seek(chapter.startTime);
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>('.chapters-toggle');
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.chapters-panel');
    if (button && panel) {
      this.closeChapters(button, panel);
      button.focus({ preventScroll: true });
    }
    this.showControls();
  }

  private isChapterActive(chapter: Chapter): boolean {
    const time = this.latestState?.currentTime ?? 0;
    return findChapter(this.latestChapters, time) === chapter;
  }

  private updateChapterMarkers(state = this.latestState): void {
    const markers = this.shadowRoot?.querySelector<HTMLElement>('.timeline-chapters');
    if (!markers) {
      return;
    }
    markers.replaceChildren();
    if (!state || state.streamType === 'live' || !state.duration || state.duration <= 0) {
      return;
    }
    for (const chapter of this.latestChapters) {
      if (chapter.startTime <= 0 || chapter.startTime >= state.duration) {
        continue;
      }
      const marker = this.ownerDocument.createElement('span');
      marker.className = 'timeline-chapter-marker';
      marker.style.left = `${(chapter.startTime / state.duration) * 100}%`;
      marker.title = chapter.title;
      markers.append(marker);
    }
  }

  private toggleCaptions(): boolean {
    if (!this.captionRenderer) {
      return false;
    }
    if (!this.captionRenderer.toggle()) {
      return false;
    }
    this.updateCaptionControl();
    return true;
  }

  private toggleLoop(): void {
    const state = this.player?.getState();
    if (!this.player || !state || state.streamType === 'live') {
      return;
    }
    this.player.setLoop(!state.loop);
    this.showControls();
  }

  private updateCaptionSettings(): void {
    const settings = this.shadowRoot?.querySelector<HTMLElement>('.caption-settings');
    if (!settings) {
      return;
    }
    const preferences = this.captionPreferences;
    const toggle = settings.querySelector<HTMLButtonElement>('[data-caption-toggle]');
    const enabled = this.captionRenderer?.isEnabled ?? false;
    if (toggle) {
      toggle.classList.toggle('is-active', enabled);
      toggle.setAttribute('aria-checked', String(enabled));
    }
    settings.querySelectorAll<HTMLElement>('[data-caption-value]').forEach((value) => {
      const setting = value.dataset.captionValue as CaptionSettingKey | undefined;
      if (!setting) {
        return;
      }
      const current = String(preferences[setting]);
      value.textContent =
        CAPTION_SETTING_OPTIONS[setting].find((option) => option.value === current)
          ?.label ?? current;
    });
  }

  private showShortcutFeedback(
    kind:
      | 'play'
      | 'pause'
      | 'volume'
      | 'mute'
      | 'fullscreen-enter'
      | 'fullscreen-exit'
      | 'seek-left'
      | 'seek-right'
      | 'captions',
    detail = '',
  ): void {
    const feedback = this.shadowRoot?.querySelector<HTMLElement>('.shortcut-feedback');
    const detailElement = feedback?.querySelector<HTMLElement>('.feedback-detail');
    const icon = feedback?.querySelector<HTMLElement>('.feedback-icon');
    if (!feedback || !detailElement || !icon) {
      return;
    }
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    feedback.className = `shortcut-feedback ${kind}`;
    detailElement.textContent = detail;
    feedback.hidden = false;
    icon.querySelectorAll<HTMLElement>(':scope > *').forEach((candidate) => {
      candidate.hidden = true;
    });
    const activeIcon = icon.querySelector<HTMLElement>(`.feedback-${kind}`);
    if (activeIcon) {
      activeIcon.hidden = false;
    }
    feedback.getAnimations().forEach((animation) => animation.cancel());
    void feedback.offsetWidth;
    feedback.classList.add('is-visible');
    this.feedbackTimer = setTimeout(() => {
      feedback.classList.remove('is-visible');
      feedback.hidden = true;
      this.feedbackTimer = undefined;
    }, 1000);
  }

  private setPlaybackRate(rate: number): void {
    if (!this.player || !Number.isFinite(rate)) {
      return;
    }
    const next = Math.round(clamp(rate, 0.5, 3) * 2) / 2;
    try {
      this.player.setPlaybackRate(next);
      this.showControls();
    } catch (error) {
      this.showMessage(this.errorMessage(error));
    }
  }

  private async toggleDocumentPictureInPicture(): Promise<void> {
    if (this.pictureInPictureWindow) {
      this.restoreFromDocumentPictureInPicture(true);
      return;
    }
    const api = (globalThis as DocumentPictureInPictureGlobal).documentPictureInPicture;
    const parent = this.parentNode;
    if (!api || !parent) {
      this.showMessage('Document Picture-in-Picture is not supported by this browser.');
      return;
    }
    const rect = this.getBoundingClientRect();
    try {
      const pipWindow = await api.requestWindow({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(180, Math.round((rect.width * 9) / 16)),
      });
      const placeholder = this.ownerDocument.createComment(
        'media-player-pip-placeholder',
      );
      parent.insertBefore(placeholder, this);
      this.pictureInPicturePlaceholder = placeholder;
      this.pictureInPictureWindow = pipWindow;
      this.pictureInPicturePageHide = () => {
        this.restoreFromDocumentPictureInPicture(false);
      };
      pipWindow.addEventListener('pagehide', this.pictureInPicturePageHide);
      const style = pipWindow.document.createElement('style');
      style.textContent = `
        :root, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #080a0e; }
        media-player { display: block; width: 100%; height: 100%; }
      `;
      pipWindow.document.head.append(style);
      this.setAttribute('picture-in-picture', '');
      this.movingToPictureInPicture = true;
      pipWindow.document.body.append(this);
      this.movingToPictureInPicture = false;
      this.player?.setPictureInPictureState(true);
      this.settingsOpen = false;
      this.settingsView = 'menu';
      this.updateSettingsPanel();
    } catch (error) {
      this.movingToPictureInPicture = false;
      this.pictureInPicturePlaceholder?.remove();
      this.pictureInPicturePlaceholder = undefined;
      this.pictureInPictureWindow = undefined;
      this.showMessage(this.errorMessage(error));
    }
  }

  private restoreFromDocumentPictureInPicture(closeWindow: boolean): void {
    if (this.restoringPictureInPicture) {
      return;
    }
    this.restoringPictureInPicture = true;
    const pipWindow = this.pictureInPictureWindow;
    if (pipWindow && this.pictureInPicturePageHide) {
      pipWindow.removeEventListener('pagehide', this.pictureInPicturePageHide);
    }
    this.pictureInPicturePageHide = undefined;
    this.pictureInPictureWindow = undefined;
    this.removeAttribute('picture-in-picture');
    this.player?.setPictureInPictureState(false);
    const placeholder = this.pictureInPicturePlaceholder;
    if (placeholder?.parentNode) {
      this.movingToPictureInPicture = true;
      placeholder.parentNode.replaceChild(this, placeholder);
      this.movingToPictureInPicture = false;
    }
    this.pictureInPicturePlaceholder = undefined;
    if (closeWindow && pipWindow && !pipWindow.closed) {
      pipWindow.close();
    }
    this.restoringPictureInPicture = false;
  }

  private setTimelineVisual(time: number, state = this.latestState): void {
    const area = this.shadowRoot?.querySelector<HTMLElement>('.timeline-area');
    if (!area || !state) {
      return;
    }
    const min = state.streamType === 'live' ? (state.seekable[0]?.start ?? 0) : 0;
    const max =
      state.streamType === 'live'
        ? (state.seekable[state.seekable.length - 1]?.end ?? 0)
        : (state.duration ?? 0);
    const span = Math.max(0.001, max - min);
    const position = clamp((time - min) / span, 0, 1) * 100;
    const bufferedEnd = state.buffered.reduce(
      (end, range) => Math.max(end, range.end),
      min,
    );
    const buffered = clamp((bufferedEnd - min) / span, 0, 1) * 100;
    area.style.setProperty('--timeline-position', `${position}%`);
    area.style.setProperty('--timeline-buffered', `${buffered}%`);
  }

  private finishScrubbing(): void {
    if (!this.scrubbing) {
      return;
    }
    const time = this.scrubTime;
    this.scrubbing = false;
    this.scrubTime = undefined;
    if (time !== undefined && this.player) {
      this.player.seek(time);
      this.ignoreNextTimelineChange = true;
      setTimeout(() => {
        this.ignoreNextTimelineChange = false;
      }, 0);
    }
    this.scheduleHide();
  }

  private schedulePreview(time?: number, clientX?: number): void {
    const state = this.latestState;
    const timelineArea = this.shadowRoot?.querySelector<HTMLElement>('.timeline-area');
    const preview = this.shadowRoot?.querySelector<HTMLElement>('.timeline-preview');
    const previewTime = this.shadowRoot?.querySelector<HTMLElement>('.thumbnail-time');
    const previewChapter =
      this.shadowRoot?.querySelector<HTMLElement>('.thumbnail-chapter');
    const image = this.shadowRoot?.querySelector<HTMLImageElement>(
      '.timeline-preview img',
    );
    const viewport = this.shadowRoot?.querySelector<HTMLElement>('.thumbnail-viewport');
    const placeholder = this.shadowRoot?.querySelector<HTMLElement>(
      '.thumbnail-placeholder',
    );
    if (
      !state ||
      !timelineArea ||
      !preview ||
      !previewTime ||
      !previewChapter ||
      !image ||
      !viewport ||
      !placeholder ||
      !this.player
    ) {
      return;
    }
    const min = state.streamType === 'live' ? (state.seekable[0]?.start ?? 0) : 0;
    const max =
      state.streamType === 'live'
        ? (state.seekable[state.seekable.length - 1]?.end ?? 0)
        : (state.duration ?? 0);
    if (state.streamType === 'live' || max <= min) {
      this.hidePreview();
      return;
    }
    let requested = time;
    if (requested === undefined && clientX !== undefined) {
      const rect = timelineArea.getBoundingClientRect();
      requested =
        min + clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1) * (max - min);
    }
    if (requested === undefined) {
      return;
    }
    const effective = clampSeekTarget(
      requested,
      state,
      this.getAttribute('seek-policy') === 'watched' ? 'watched' : 'unrestricted',
      1,
    );
    const rect = timelineArea.getBoundingClientRect();
    const pointerX =
      clientX ?? rect.left + ((effective - min) / (max - min)) * rect.width;
    const requestId = ++this.previewRequestId;
    preview.hidden = false;
    previewTime.textContent = formatTime(effective);
    previewChapter.textContent = findChapter(this.latestChapters, effective)?.title ?? '';
    previewChapter.hidden = previewChapter.textContent.length === 0;
    image.hidden = true;
    image.removeAttribute('src');
    image.dataset.requestId = String(requestId);
    placeholder.hidden = false;
    viewport.removeAttribute('style');
    const playerRect = this.shadowRoot
      ?.querySelector<HTMLElement>('.player')
      ?.getBoundingClientRect();
    if (playerRect) {
      preview.style.left = `${clamp(pointerX - playerRect.left - 80, 0, Math.max(0, playerRect.width - 160))}px`;
    }
    void this.player
      .getTimelineThumbnail(effective)
      .then((thumbnail) => {
        if (requestId !== this.previewRequestId || !this.timelineHovered) {
          return;
        }
        if (!thumbnail) {
          this.showThumbnailPlaceholder(image, placeholder);
          return;
        }
        this.applyThumbnail(thumbnail, viewport, image);
        previewTime.textContent = formatTime(thumbnail.time);
      })
      .catch(() => {
        if (requestId === this.previewRequestId && this.timelineHovered) {
          this.showThumbnailPlaceholder(image, placeholder);
        }
      });
  }

  private applyThumbnail(
    thumbnail: TimelineThumbnail,
    viewport: HTMLElement,
    image: HTMLImageElement,
  ): void {
    const placeholder = this.shadowRoot?.querySelector<HTMLElement>(
      '.thumbnail-placeholder',
    );
    if (thumbnail.crop) {
      viewport.style.width = `${thumbnail.crop.width}px`;
      viewport.style.height = `${thumbnail.crop.height}px`;
      image.style.width = 'auto';
      image.style.height = 'auto';
      image.style.maxWidth = 'none';
      image.style.left = `${-thumbnail.crop.x}px`;
      image.style.top = `${-thumbnail.crop.y}px`;
    } else {
      viewport.removeAttribute('style');
      image.style.width = '160px';
      image.style.height = '90px';
      image.style.maxWidth = '100%';
      image.style.left = '0';
      image.style.top = '0';
    }
    image.hidden = false;
    if (placeholder) {
      placeholder.hidden = true;
    }
    image.src = thumbnail.src;
  }

  private showThumbnailPlaceholder(
    image: HTMLImageElement,
    placeholder: HTMLElement,
  ): void {
    image.hidden = true;
    image.removeAttribute('src');
    placeholder.hidden = false;
  }

  private hidePreview(): void {
    this.previewRequestId += 1;
    const preview = this.shadowRoot?.querySelector<HTMLElement>('.timeline-preview');
    if (preview) {
      preview.hidden = true;
    }
  }

  private showControls(schedule = true): void {
    const player = this.shadowRoot?.querySelector<HTMLElement>('.player');
    if (!player) {
      return;
    }
    player.classList.remove('controls-hidden');
    this.clearHideTimer();
    this.captionRenderer?.setControlsHidden(false);
    this.captionRenderer?.layout();
    if (schedule) {
      this.scheduleHide();
    }
  }

  private hideControls(): void {
    const player = this.shadowRoot?.querySelector<HTMLElement>('.player');
    if (
      !player ||
      this.latestState?.status !== 'playing' ||
      this.scrubbing ||
      this.captionDragging ||
      this.settingsOpen ||
      this.hasInteractiveFocus()
    ) {
      return;
    }
    player.classList.add('controls-hidden');
    this.hidePreview();
    this.captionRenderer?.setControlsHidden(true);
    this.captionRenderer?.layout();
  }

  private hasInteractiveFocus(): boolean {
    const active = this.shadowRoot?.activeElement;
    if (!active) {
      return false;
    }
    const player = this.shadowRoot?.querySelector('.player');
    const video = this.shadowRoot?.querySelector('video');
    if (!player?.contains(active)) {
      return false;
    }
    return active !== player && active !== video;
  }

  private scheduleHide(): void {
    this.clearHideTimer();
    if (
      this.latestState?.status !== 'playing' ||
      this.scrubbing ||
      this.captionDragging ||
      this.settingsOpen ||
      this.hasInteractiveFocus()
    ) {
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.hideControls();
    }, CONTROLS_IDLE_DELAY);
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }

  private clearVideoClickTimer(): void {
    if (this.videoClickTimer) {
      clearTimeout(this.videoClickTimer);
      this.videoClickTimer = undefined;
    }
  }

  private clearFeedbackTimer(): void {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = undefined;
    }
  }

  private notifyPlayerChange(player: MediaPlayer | null): void {
    this.dispatchEvent(
      new CustomEvent<MediaPlayerChangeDetail>('media-player-change', {
        detail: { player },
      }),
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'The requested media action failed.';
  }

  private showMessage(message: string): void {
    const element = this.shadowRoot?.querySelector<HTMLElement>('.message');
    if (!element) {
      return;
    }
    element.textContent = message;
    element.hidden = message.length === 0;
  }
}
