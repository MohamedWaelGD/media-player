import type {
  CaptionColor,
  CaptionEdgeStyle,
  CaptionFontFamily,
  CaptionPreferencePatch,
  CaptionPreferences,
} from '../types/public';

const STORAGE_KEY = 'media-player:caption-preferences:v2';
const GAP = 8;

export const DEFAULT_CAPTION_PREFERENCES: CaptionPreferences = {
  textColor: '#ffffff',
  textOpacity: 1,
  backgroundColor: '#000000',
  backgroundOpacity: 0.75,
  fontSize: 0.75,
  edgeStyle: 'none',
  fontFamily: 'proportional-sans-serif',
  position: { x: 0.5, y: 0.95 },
};

const COLORS = new Set<CaptionColor>([
  '#ffffff',
  '#000000',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
]);

const EDGE_STYLES = new Set<CaptionEdgeStyle>([
  'none',
  'drop-shadow',
  'raised',
  'depressed',
  'outline',
]);

const FONTS = new Set<CaptionFontFamily>([
  'monospaced-serif',
  'proportional-serif',
  'monospaced-sans-serif',
  'proportional-sans-serif',
  'casual',
  'cursive',
  'small-capitals',
]);

const FONT_STACKS: Record<CaptionFontFamily, string> = {
  'monospaced-serif': '"Courier New", Courier, monospace',
  'proportional-serif': 'Georgia, "Times New Roman", serif',
  'monospaced-sans-serif': 'ui-monospace, "DejaVu Sans Mono", monospace',
  'proportional-sans-serif': 'Arial, Helvetica, sans-serif',
  casual: '"Comic Sans MS", "Comic Sans", cursive',
  cursive: '"Brush Script MT", "Segoe Script", cursive',
  'small-capitals': 'Arial, Helvetica, sans-serif',
};

type CaptionChangeHandler = (preferences: CaptionPreferences) => void;
type CaptionDragHandler = (dragging: boolean) => void;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clonePreferences(preferences: CaptionPreferences): CaptionPreferences {
  return {
    ...preferences,
    position: { ...preferences.position },
  };
}

function hexToRgba(color: CaptionColor, opacity: number): string {
  const value = color.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacity, 0, 1)})`;
}

function readStoredPreferences(): CaptionPreferencePatch | undefined {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CaptionPreferencePatch) : undefined;
  } catch {
    return undefined;
  }
}

function saveStoredPreferences(preferences: CaptionPreferences): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage is optional and may be blocked by the embedding page.
  }
}

export function normalizeCaptionPreferences(
  patch: CaptionPreferencePatch = {},
  base: CaptionPreferences = DEFAULT_CAPTION_PREFERENCES,
): CaptionPreferences {
  const textColor = COLORS.has(patch.textColor as CaptionColor)
    ? (patch.textColor as CaptionColor)
    : base.textColor;
  const backgroundColor = COLORS.has(patch.backgroundColor as CaptionColor)
    ? (patch.backgroundColor as CaptionColor)
    : base.backgroundColor;
  const edgeStyle = EDGE_STYLES.has(patch.edgeStyle as CaptionEdgeStyle)
    ? (patch.edgeStyle as CaptionEdgeStyle)
    : base.edgeStyle;
  const fontFamily = FONTS.has(patch.fontFamily as CaptionFontFamily)
    ? (patch.fontFamily as CaptionFontFamily)
    : base.fontFamily;
  const position = patch.position ?? {};
  return {
    textColor,
    textOpacity:
      typeof patch.textOpacity === 'number' && Number.isFinite(patch.textOpacity)
        ? clamp(patch.textOpacity, 0, 1)
        : base.textOpacity,
    backgroundColor,
    backgroundOpacity:
      typeof patch.backgroundOpacity === 'number' &&
      Number.isFinite(patch.backgroundOpacity)
        ? clamp(patch.backgroundOpacity, 0, 1)
        : base.backgroundOpacity,
    fontSize:
      typeof patch.fontSize === 'number' && Number.isFinite(patch.fontSize)
        ? clamp(patch.fontSize, 0.5, 2)
        : base.fontSize,
    edgeStyle,
    fontFamily,
    position: {
      x:
        typeof position.x === 'number' && Number.isFinite(position.x)
          ? clamp(position.x, 0, 1)
          : base.position.x,
      y:
        typeof position.y === 'number' && Number.isFinite(position.y)
          ? clamp(position.y, 0, 1)
          : base.position.y,
    },
  };
}

export class CaptionRenderer {
  private readonly video: HTMLVideoElement;
  private readonly shell: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly group: HTMLElement;
  private readonly onChange?: CaptionChangeHandler;
  private readonly onDrag?: CaptionDragHandler;
  private selectedTrack?: TextTrack;
  private trackChangeHandler?: () => void;
  private preferences: CaptionPreferences;
  private enabled = false;
  private dragging = false;
  private controlsHidden = false;
  private dragOffset = { x: 0, y: 0 };
  private resizeObserver?: ResizeObserver;
  private syncing = false;

  constructor(
    video: HTMLVideoElement,
    shell: HTMLElement,
    controls: HTMLElement,
    onChange?: CaptionChangeHandler,
    onDrag?: CaptionDragHandler,
  ) {
    this.video = video;
    this.shell = shell;
    this.controls = controls;
    this.layer = shell.querySelector<HTMLElement>('.caption-layer')!;
    this.group = shell.querySelector<HTMLElement>('.caption-group')!;
    this.onChange = onChange;
    this.onDrag = onDrag;
    this.preferences = normalizeCaptionPreferences(readStoredPreferences());

    this.video.textTracks.addEventListener('addtrack', this.handleTrackListChange);
    this.video.textTracks.addEventListener('removetrack', this.handleTrackListChange);
    this.video.textTracks.addEventListener('change', this.handleTrackListChange);
    this.group.addEventListener('pointerdown', this.handlePointerDown);
    this.group.addEventListener('pointermove', this.handlePointerMove);
    this.group.addEventListener('pointerup', this.handlePointerUp);
    this.group.addEventListener('pointercancel', this.handlePointerUp);
    this.group.addEventListener('keydown', this.handleKeyDown);
    this.resizeObserver = new ResizeObserver(() => {
      this.updateFontSize();
      this.layout();
    });
    this.resizeObserver.observe(this.shell);
    this.resizeObserver.observe(this.video);
    this.resizeObserver.observe(this.controls);
    this.video.addEventListener('loadedmetadata', this.handleVideoMetadata);
    this.applyPreferences();
    this.syncTracks();
  }

  getPreferences(): CaptionPreferences {
    return clonePreferences(this.preferences);
  }

  get hasTracks(): boolean {
    return this.getCaptionTracks().length > 0;
  }

  get isEnabled(): boolean {
    return this.enabled && this.hasTracks;
  }

  setPreferences(patch: CaptionPreferencePatch, persist = true): CaptionPreferences {
    this.preferences = normalizeCaptionPreferences(patch, this.preferences);
    this.applyPreferences();
    if (persist) {
      saveStoredPreferences(this.preferences);
    }
    this.onChange?.(this.getPreferences());
    return this.getPreferences();
  }

  resetPreferences(): CaptionPreferences {
    this.preferences = clonePreferences(DEFAULT_CAPTION_PREFERENCES);
    this.applyPreferences();
    saveStoredPreferences(this.preferences);
    this.onChange?.(this.getPreferences());
    return this.getPreferences();
  }

  toggle(): boolean {
    if (!this.hasTracks) {
      return false;
    }
    this.setEnabled(!this.enabled);
    return true;
  }

  setEnabled(enabled: boolean): void {
    if (!this.selectedTrack && this.hasTracks) {
      this.syncTracks();
    }
    this.enabled = enabled && this.hasTracks;
    if (this.selectedTrack) {
      this.selectedTrack.mode = this.enabled ? 'hidden' : 'disabled';
    }
    this.renderCues();
  }

  resetPosition(): CaptionPreferences {
    return this.setPreferences({ position: DEFAULT_CAPTION_PREFERENCES.position });
  }

  setControlsHidden(hidden: boolean): void {
    this.controlsHidden = hidden;
    this.layout();
  }

  layout(): void {
    if (this.group.hidden || this.dragging) {
      return;
    }
    const media = this.getMediaRect();
    this.updateFontSize(media);
    const shellRect = this.shell.getBoundingClientRect();
    const groupRect = this.group.getBoundingClientRect();
    if (!media || !groupRect.width || !groupRect.height) {
      return;
    }
    const preferredCenter = this.getCenterForPosition(media, groupRect);
    const center = this.clampCenter(
      media,
      groupRect,
      preferredCenter.x,
      preferredCenter.y,
    );
    this.group.style.left = `${center.x - shellRect.left}px`;
    this.group.style.top = `${center.y - shellRect.top}px`;
  }

  destroy(): void {
    this.detachSelectedTrack();
    this.video.textTracks.removeEventListener('addtrack', this.handleTrackListChange);
    this.video.textTracks.removeEventListener('removetrack', this.handleTrackListChange);
    this.video.textTracks.removeEventListener('change', this.handleTrackListChange);
    this.group.removeEventListener('pointerdown', this.handlePointerDown);
    this.group.removeEventListener('pointermove', this.handlePointerMove);
    this.group.removeEventListener('pointerup', this.handlePointerUp);
    this.group.removeEventListener('pointercancel', this.handlePointerUp);
    this.group.removeEventListener('keydown', this.handleKeyDown);
    this.video.removeEventListener('loadedmetadata', this.handleVideoMetadata);
    this.resizeObserver?.disconnect();
    this.group.replaceChildren();
    this.group.hidden = true;
  }

  private getCaptionTracks(): TextTrack[] {
    return Array.from(this.video.textTracks).filter(
      (track) => track.kind === 'subtitles' || track.kind === 'captions',
    );
  }

  private readonly handleTrackListChange = (): void => {
    if (!this.syncing) {
      this.syncTracks();
    }
  };

  private readonly handleVideoMetadata = (): void => {
    this.updateFontSize();
    this.layout();
  };

  private syncTracks(): void {
    this.syncing = true;
    try {
      const tracks = this.getCaptionTracks();
      const nextTrack = tracks.includes(this.selectedTrack as TextTrack)
        ? this.selectedTrack
        : (tracks.find((track) => track.mode === 'showing') ?? tracks[0]);
      if (this.selectedTrack !== nextTrack) {
        this.detachSelectedTrack();
        this.selectedTrack = nextTrack;
        if (this.selectedTrack) {
          this.enabled = this.selectedTrack.mode === 'showing';
          this.trackChangeHandler = () => this.renderCues();
          this.selectedTrack.addEventListener('cuechange', this.trackChangeHandler);
        } else {
          this.enabled = false;
        }
      }
      tracks.forEach((track) => {
        if (track !== this.selectedTrack) {
          track.mode = 'disabled';
        }
      });
      if (this.selectedTrack) {
        this.selectedTrack.mode = this.enabled ? 'hidden' : 'disabled';
      }
      this.renderCues();
    } finally {
      this.syncing = false;
    }
  }

  private detachSelectedTrack(): void {
    if (this.selectedTrack && this.trackChangeHandler) {
      this.selectedTrack.removeEventListener('cuechange', this.trackChangeHandler);
    }
    this.trackChangeHandler = undefined;
  }

  private renderCues(): void {
    this.group.replaceChildren();
    const activeCues = this.enabled
      ? Array.from(this.selectedTrack?.activeCues ?? [])
      : [];
    activeCues.forEach((cue) => {
      const cueElement = this.group.ownerDocument.createElement('span');
      cueElement.className = 'caption-cue';
      const cueWithMarkup = cue as VTTCue & { getCueAsHTML?: () => DocumentFragment };
      if (typeof cueWithMarkup.getCueAsHTML === 'function') {
        cueElement.append(cueWithMarkup.getCueAsHTML());
      } else {
        cueElement.textContent =
          typeof cueWithMarkup.text === 'string' ? cueWithMarkup.text : '';
      }
      this.group.append(cueElement);
    });
    this.group.hidden = !this.enabled || activeCues.length === 0;
    this.updateFontSize();
    this.layout();
  }

  private applyPreferences(): void {
    const preferences = this.preferences;
    this.group.style.color = hexToRgba(preferences.textColor, preferences.textOpacity);
    this.group.style.backgroundColor = hexToRgba(
      preferences.backgroundColor,
      preferences.backgroundOpacity,
    );
    this.group.style.fontFamily = FONT_STACKS[preferences.fontFamily];
    this.group.style.fontVariant =
      preferences.fontFamily === 'small-capitals' ? 'small-caps' : 'normal';
    this.group.style.textShadow = this.getTextShadow(preferences.edgeStyle);
    this.layout();
  }

  private updateFontSize(media = this.getMediaRect()): void {
    if (!media) {
      this.group.style.fontSize = `${this.preferences.fontSize}em`;
      return;
    }
    const baseSize = clamp(media.height * 0.055, 10, 72);
    this.group.style.fontSize = `${baseSize * this.preferences.fontSize}px`;
  }

  private getTextShadow(edgeStyle: CaptionEdgeStyle): string {
    switch (edgeStyle) {
      case 'drop-shadow':
        return '0 2px 3px rgba(0, 0, 0, 0.95)';
      case 'raised':
        return '-1px -1px 0 rgba(255, 255, 255, 0.8), 1px 1px 0 rgba(0, 0, 0, 0.95)';
      case 'depressed':
        return '1px 1px 0 rgba(255, 255, 255, 0.8), -1px -1px 0 rgba(0, 0, 0, 0.95)';
      case 'outline':
        return '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
      default:
        return 'none';
    }
  }

  private getMediaRect(): DOMRect | null {
    const videoRect = this.video.getBoundingClientRect();
    if (!videoRect.width || !videoRect.height) {
      return null;
    }
    if (!this.video.videoWidth || !this.video.videoHeight) {
      return videoRect;
    }
    const videoRatio = this.video.videoWidth / this.video.videoHeight;
    const boxRatio = videoRect.width / videoRect.height;
    const width = videoRatio > boxRatio ? videoRect.width : videoRect.height * videoRatio;
    const height =
      videoRatio > boxRatio ? videoRect.width / videoRatio : videoRect.height;
    const left = videoRect.left + (videoRect.width - width) / 2;
    const top = videoRect.top + (videoRect.height - height) / 2;
    return new DOMRect(left, top, width, height);
  }

  private clampCenter(
    media: DOMRect,
    groupRect: DOMRect,
    centerX: number,
    centerY: number,
  ): { x: number; y: number } {
    const halfWidth = groupRect.width / 2;
    const halfHeight = groupRect.height / 2;
    const minX = media.left + halfWidth + GAP;
    const maxX = media.right - halfWidth - GAP;
    const minY = media.top + halfHeight + GAP;
    const maxY = media.bottom - halfHeight - GAP;
    return {
      x: clamp(centerX, minX, Math.max(minX, maxX)),
      y: clamp(centerY, minY, Math.max(minY, maxY)),
    };
  }

  private getCenterForPosition(
    media: DOMRect,
    groupRect: DOMRect,
  ): { x: number; y: number } {
    const halfHeight = groupRect.height / 2;
    const controlsInset = this.getControlsInset(media);
    const y =
      this.preferences.position.y < 0.5
        ? media.top + media.height * this.preferences.position.y + halfHeight
        : media.bottom -
          media.height * (1 - this.preferences.position.y) -
          controlsInset -
          halfHeight;
    return {
      x: media.left + media.width * this.preferences.position.x,
      y,
    };
  }

  private getPositionForCenter(
    media: DOMRect,
    groupRect: DOMRect,
    center: { x: number; y: number },
  ): { x: number; y: number } {
    const halfHeight = groupRect.height / 2;
    const midpoint = media.top + media.height / 2;
    const currentlyUpper = this.preferences.position.y < 0.5;
    const upper = currentlyUpper
      ? center.y - halfHeight < midpoint
      : center.y + halfHeight <= midpoint;
    const controlsInset = this.getControlsInset(media);
    return {
      x: clamp((center.x - media.left) / media.width, 0, 1),
      y: clamp(
        upper
          ? (center.y - halfHeight - media.top) / media.height
          : 1 - (media.bottom - (center.y + halfHeight) - controlsInset) / media.height,
        0,
        1,
      ),
    };
  }

  private getControlsInset(media: DOMRect): number {
    if (this.controlsHidden) {
      return 0;
    }
    const controlsRect = this.controls.getBoundingClientRect();
    const overlap = Math.max(
      0,
      Math.min(media.bottom, controlsRect.bottom) - Math.max(media.top, controlsRect.top),
    );
    return overlap;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const rect = this.group.getBoundingClientRect();
    this.dragging = true;
    this.dragOffset = {
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    };
    this.group.dataset.dragging = 'true';
    this.group.setPointerCapture(event.pointerId);
    this.onDrag?.(true);
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    const media = this.getMediaRect();
    if (!media) {
      return;
    }
    const rect = this.group.getBoundingClientRect();
    const center = this.clampCenter(
      media,
      rect,
      event.clientX - this.dragOffset.x,
      event.clientY - this.dragOffset.y,
    );
    const next = this.getPositionForCenter(media, rect, center);
    this.preferences = normalizeCaptionPreferences({ position: next }, this.preferences);
    const shellRect = this.shell.getBoundingClientRect();
    this.group.style.left = `${center.x - shellRect.left}px`;
    this.group.style.top = `${center.y - shellRect.top}px`;
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.group.dataset.dragging = 'false';
    if (this.group.hasPointerCapture(event.pointerId)) {
      this.group.releasePointerCapture(event.pointerId);
    }
    saveStoredPreferences(this.preferences);
    this.onChange?.(this.getPreferences());
    this.onDrag?.(false);
    this.layout();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const media = this.getMediaRect();
    const groupRect = this.group.getBoundingClientRect();
    if (!media || !groupRect.width || !groupRect.height) {
      return;
    }
    const current = this.clampCenter(
      media,
      groupRect,
      this.getCenterForPosition(media, groupRect).x,
      this.getCenterForPosition(media, groupRect).y,
    );
    const nextCenter = { ...current };
    if (event.key === 'ArrowLeft') nextCenter.x -= media.width * step;
    else if (event.key === 'ArrowRight') nextCenter.x += media.width * step;
    else if (event.key === 'ArrowUp') nextCenter.y -= media.height * step;
    else if (event.key === 'ArrowDown') nextCenter.y += media.height * step;
    else if (event.key === 'Home') {
      this.resetPosition();
      event.preventDefault();
      return;
    } else {
      return;
    }
    this.setPreferences({
      position: this.getPositionForCenter(media, groupRect, nextCenter),
    });
    event.preventDefault();
  };
}
