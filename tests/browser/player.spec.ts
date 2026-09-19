import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Player } from '../../src/types/public';

const bundledLibrary = readFileSync(resolve('dist/index.js'));
const bundledElement = readFileSync(resolve('dist/element/index.js'));
const libraryUrl = `data:text/javascript;base64,${bundledLibrary.toString('base64')}`;
const elementUrl = `data:text/javascript;base64,${bundledElement.toString('base64')}`;

test('creates a headless player and exposes stable state', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { MediaPlayer } = await import(moduleUrl);
    const video = document.createElement('video');
    document.body.append(video);
    const player = new MediaPlayer(video);
    player.setVolume(0.25);
    player.setMuted(true);
    player.setPlaybackRate(1.5);
    const state = player.getState();
    player.destroy();
    return {
      status: state.status,
      volume: state.volume,
      muted: state.muted,
      playbackRate: state.playbackRate,
    };
  }, libraryUrl);

  expect(result).toEqual({
    status: 'idle',
    volume: 0.25,
    muted: true,
    playbackRate: 1.5,
  });
});

test('registers the Web Component with Shadow DOM controls', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const previewImage = element.shadowRoot?.querySelector<HTMLImageElement>(
      '.timeline-preview img',
    );
    if (previewImage) {
      previewImage.hidden = true;
    }
    return {
      hasShadowRoot: Boolean(element.shadowRoot),
      hasVideo: Boolean(element.shadowRoot?.querySelector('video[part="video"]')),
      hasTimeline: Boolean(element.shadowRoot?.querySelector('[part="timeline"]')),
      videoTabIndex: element.shadowRoot?.querySelector('video')?.tabIndex,
      previewImageDisplay: previewImage
        ? getComputedStyle(previewImage).display
        : undefined,
      hasPreview: Boolean(
        element.shadowRoot?.querySelector('[part="thumbnail-preview"]'),
      ),
      hasIcons: Boolean(element.shadowRoot?.querySelector('ph-play')),
      hasVolumeButton: Boolean(
        element.shadowRoot?.querySelector('[part="volume-button"]'),
      ),
      playTooltip: element.shadowRoot
        ?.querySelector<HTMLButtonElement>('.play')
        ?.getAttribute('data-tooltip'),
      playShortcut: element.shadowRoot
        ?.querySelector<HTMLButtonElement>('.play')
        ?.getAttribute('aria-keyshortcuts'),
      fullscreenTooltip: element.shadowRoot
        ?.querySelector<HTMLButtonElement>('.fullscreen')
        ?.getAttribute('data-tooltip'),
    };
  }, elementUrl);

  expect(result).toEqual({
    hasShadowRoot: true,
    hasVideo: true,
    hasTimeline: true,
    videoTabIndex: 0,
    previewImageDisplay: 'none',
    hasPreview: true,
    hasIcons: true,
    hasVolumeButton: true,
    playTooltip: 'Play (K / Space)',
    playShortcut: 'K Space',
    fullscreenTooltip: 'Fullscreen (F)',
  });
});

test('attaches configured WebVTT captions and exposes the captions control', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player');
    element.setAttribute('src', '/lesson.mp4');
    element.setAttribute(
      'caption-src',
      'data:text/vtt,WEBVTT%0A%0A00:00.000%20--%3E%2000:01.000%0AHello',
    );
    element.setAttribute('caption-lang', 'en');
    element.setAttribute('caption-label', 'English');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const video = element.shadowRoot?.querySelector<HTMLVideoElement>('video');
    const track = video?.querySelector<HTMLTrackElement>('track');
    const button =
      element.shadowRoot?.querySelector<HTMLButtonElement>('.settings-captions');
    return {
      trackSrc: track?.src,
      trackLanguage: track?.srclang,
      trackLabel: track?.label,
      hasCaptionTrack: video?.textTracks.length === 1,
      captionButtonVisible: button?.hidden === false,
    };
  }, elementUrl);

  expect(result.trackSrc).toContain('data:text/vtt');
  expect(result.trackLanguage).toBe('en');
  expect(result.trackLabel).toBe('English');
  expect(result.hasCaptionTrack).toBe(true);
  expect(result.captionButtonVisible).toBe(true);
});

test('loads chapters, exposes the chapter control, and seeks from the popup', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const vtt = `WEBVTT\n\n00:00.000 --> 00:10.000\nIntroduction\n\n00:10.000 --> 00:20.000\nMain topic`;
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    element.setAttribute('chapter-src', `data:text/vtt,${encodeURIComponent(vtt)}`);
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const root = element.shadowRoot;
    const button = root?.querySelector<HTMLButtonElement>('.chapters-toggle');
    const panel = root?.querySelector<HTMLElement>('.chapters-panel');
    button?.click();
    const rows = [...(root?.querySelectorAll<HTMLButtonElement>('.chapter-row') ?? [])];
    const panelVisible = panel?.hidden === false;
    let seekStart: number | undefined;
    const mediaPlayer = element.mediaPlayer;
    if (mediaPlayer) {
      const seek = mediaPlayer.seek.bind(mediaPlayer);
      mediaPlayer.seek = (time) => {
        seekStart = time;
        seek(time);
      };
    }
    rows[1]?.click();
    return {
      buttonVisible: button?.hidden === false,
      panelVisible,
      titles: rows.map((row) => row.querySelector('.chapter-title')?.textContent),
      seekStart,
      chapters: element.mediaPlayer?.getChapters().map((chapter) => chapter.title),
    };
  }, elementUrl);

  expect(result.buttonVisible).toBe(true);
  expect(result.panelVisible).toBe(true);
  expect(result.titles).toEqual(['Introduction', 'Main topic']);
  expect(result.chapters).toEqual(['Introduction', 'Main topic']);
  expect(result.seekStart).toBe(10);
});

test('uses a 75 percent caption font size by default', async ({ page }) => {
  const fontSize = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      captionPreferences: { fontSize: number };
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return element.captionPreferences.fontSize;
  }, elementUrl);

  expect(fontSize).toBe(0.75);
});

test('renders captions in a customizable draggable layer', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      captionPreferences: { fontSize: number; position: { x: number; y: number } };
      setCaptionPreferences: (patch: {
        fontSize: number;
        textColor: '#ffff00';
        position: { x: number; y: number };
      }) => void;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const video = element.shadowRoot?.querySelector<HTMLVideoElement>('video');
    const track = video?.addTextTrack('subtitles', 'English', 'en');
    const cue = new VTTCue(0, 60, 'Custom caption');
    track?.addCue(cue);
    if (track) {
      Object.defineProperty(track, 'activeCues', {
        configurable: true,
        get: () => [cue],
      });
    }
    if (track) {
      track.mode = 'showing';
    }
    if (video) {
      video.currentTime = 1;
      video.dispatchEvent(new Event('timeupdate'));
    }
    if (track) {
      track.dispatchEvent(new Event('cuechange'));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    let preferenceEvents = 0;
    element.addEventListener('caption-preferences-change', () => {
      preferenceEvents += 1;
    });
    element.setCaptionPreferences({
      fontSize: 1.5,
      textColor: '#ffff00',
      position: { x: 0.4, y: 0.7 },
    });
    const root = element.shadowRoot;
    const caption = root?.querySelector<HTMLElement>('.caption-group');
    root?.querySelector<HTMLButtonElement>('.settings')?.click();
    root?.querySelector<HTMLButtonElement>('.settings-captions')?.click();
    root?.querySelector<HTMLButtonElement>('[data-caption-target="fontFamily"]')?.click();
    const fontOptions = [...(root?.querySelectorAll('.caption-option') ?? [])].map(
      (option) => option.textContent?.trim(),
    );
    root?.querySelector<HTMLButtonElement>('[data-caption-option="casual"]')?.click();
    return {
      text: caption?.textContent,
      visible: caption?.hidden === false,
      fontSize: getComputedStyle(caption!).fontSize,
      color: getComputedStyle(caption!).color,
      preferences: element.captionPreferences,
      preferenceEvents,
      hasNativeSelect: Boolean(root?.querySelector('.caption-settings select')),
      toggleActive: root
        ?.querySelector<HTMLButtonElement>('[data-caption-toggle]')
        ?.getAttribute('aria-checked'),
      fontOptions,
      selectedFont: root?.querySelector('[data-caption-value="fontFamily"]')?.textContent,
    };
  }, elementUrl);

  expect(result.text).toBe('Custom caption');
  expect(result.visible).toBe(true);
  expect(Number.parseFloat(result.fontSize)).toBeGreaterThan(24);
  expect(result.color).toBe('rgb(255, 255, 0)');
  expect(result.preferences).toMatchObject({
    fontSize: 1.5,
    position: { x: 0.4, y: 0.7 },
  });
  expect(result.preferenceEvents).toBe(2);
  expect(result.hasNativeSelect).toBe(false);
  expect(result.toggleActive).toBe('true');
  expect(result.fontOptions).toEqual([
    'Monospaced Serif',
    'Proportional Serif',
    'Monospaced Sans-Serif',
    'Proportional Sans-Serif',
    'Casual',
    'Cursive',
    'Small Capitals',
  ]);
  expect(result.selectedFont).toBe('Casual');
});

test('keeps captions at a bottom inset and scales text with the video', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      setCaptionPreferences: (patch: { position: { x: number; y: number } }) => void;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    const video = root?.querySelector<HTMLVideoElement>('video');
    const setVideoSize = (width: number, height: number) => {
      Object.defineProperty(video!, 'videoWidth', { configurable: true, value: width });
      Object.defineProperty(video!, 'videoHeight', { configurable: true, value: height });
      Object.defineProperty(video!, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(0, 0, width, height),
      });
      video!.dispatchEvent(new Event('loadedmetadata'));
    };
    setVideoSize(640, 360);
    const track = video?.addTextTrack('subtitles', 'English', 'en');
    const cue = new VTTCue(0, 60, 'Bottom anchored caption');
    track?.addCue(cue);
    if (track) {
      Object.defineProperty(track, 'activeCues', {
        configurable: true,
        get: () => [cue],
      });
      track.mode = 'showing';
      track.dispatchEvent(new Event('cuechange'));
    }
    const caption = root?.querySelector<HTMLElement>('.caption-group');
    caption!.textContent = 'Bottom anchored caption';
    caption!.hidden = false;
    const smallSize = Number.parseFloat(getComputedStyle(caption!).fontSize);
    setVideoSize(1280, 720);
    element.setCaptionPreferences({ position: { x: 0.5, y: 0.95 } });
    const renderer = (
      element as HTMLElement & {
        captionRenderer?: { setControlsHidden: (hidden: boolean) => void };
      }
    ).captionRenderer;
    const controls = root?.querySelector<HTMLElement>('.controls');
    Object.defineProperty(controls!, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(0, 650, 1280, 70),
    });
    renderer?.setControlsHidden(false);
    const largeSize = Number.parseFloat(getComputedStyle(caption!).fontSize);
    const videoRect = video!.getBoundingClientRect();
    await new Promise((resolve) => setTimeout(resolve, 220));
    const visibleRect = caption!.getBoundingClientRect();
    renderer?.setControlsHidden(true);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const hiddenRect = caption!.getBoundingClientRect();
    element.setCaptionPreferences({ position: { x: 0.5, y: 0.25 } });
    renderer?.setControlsHidden(false);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const upperVisibleRect = caption!.getBoundingClientRect();
    renderer?.setControlsHidden(true);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const upperHiddenRect = caption!.getBoundingClientRect();
    return {
      visibleInset: videoRect.bottom - visibleRect.bottom,
      hiddenInset: videoRect.bottom - hiddenRect.bottom,
      expectedVisibleInset: 106,
      upperTopDelta: Math.abs(upperVisibleRect.top - upperHiddenRect.top),
      smallSize,
      largeSize,
    };
  }, elementUrl);

  expect(result.visibleInset).toBeGreaterThan(result.hiddenInset);
  expect(result.hiddenInset).toBeGreaterThan(0);
  expect(result.visibleInset).toBeCloseTo(result.expectedVisibleInset, 1);
  expect(result.upperTopDelta).toBeLessThan(1);
  expect(result.largeSize).toBeGreaterThan(result.smallSize);
});

test('hides controls on pointer leave and after three seconds of idle playback', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      latestState?: { status: string };
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const player = element.shadowRoot?.querySelector<HTMLElement>('.player');
    if (!player) {
      throw new Error('Player shell was not created');
    }
    element.latestState = { status: 'playing' };
    player.dispatchEvent(new PointerEvent('pointerenter'));
    const visibleAfterEnter = !player.classList.contains('controls-hidden');
    await new Promise((resolve) => setTimeout(resolve, 3050));
    const hiddenAfterIdle = player.classList.contains('controls-hidden');
    player.dispatchEvent(new PointerEvent('pointerenter'));
    player.dispatchEvent(new PointerEvent('pointerleave'));
    const hiddenAfterLeave = player.classList.contains('controls-hidden');
    element.latestState = { status: 'paused' };
    player.classList.remove('controls-hidden');
    player.dispatchEvent(new PointerEvent('pointerleave'));
    const visibleWhilePaused = !player.classList.contains('controls-hidden');
    return { visibleAfterEnter, hiddenAfterIdle, hiddenAfterLeave, visibleWhilePaused };
  }, elementUrl);

  expect(result).toEqual({
    visibleAfterEnter: true,
    hiddenAfterIdle: true,
    hiddenAfterLeave: true,
    visibleWhilePaused: true,
  });
});

test('keeps captions visible but disabled when no caption track is available', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player');
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    root?.querySelector<HTMLButtonElement>('.settings')?.click();
    const captions = root?.querySelector<HTMLButtonElement>('.settings-captions');
    return {
      visible: captions?.hidden === false,
      disabled: captions?.disabled,
      value: captions?.querySelector('.captions-value')?.textContent,
    };
  }, elementUrl);

  expect(result).toEqual({ visible: true, disabled: true, value: 'Unavailable' });
});

test('default controls drive the same player exposed by the Web Component', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    let replacementEvents = 0;
    element.addEventListener('media-player-change', () => {
      replacementEvents += 1;
    });
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const player = element.mediaPlayer;
    const volumeButton =
      element.shadowRoot?.querySelector<HTMLButtonElement>('.volume-button');
    volumeButton?.click();
    return {
      hasPlayer: Boolean(player),
      samePlayerForControls: Boolean(player && element.mediaPlayer === player),
      mutedAfterClick: player?.getState().muted,
      replacementEvents,
    };
  }, elementUrl);

  expect(result.hasPlayer).toBe(true);
  expect(result.samePlayerForControls).toBe(true);
  expect(result.mutedAfterClick).toBe(true);
  expect(result.replacementEvents).toBeGreaterThan(0);
});

test('fullscreens a custom player shell so controls remain available', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { MediaPlayer } = await import(moduleUrl);
    const shell = document.createElement('div');
    const video = document.createElement('video');
    shell.append(video);
    document.body.append(shell);

    const player = new MediaPlayer(video, { fullscreenElement: shell });
    await player.enterFullscreen();
    const fullscreen = {
      isShell: document.fullscreenElement === shell,
      state: player.getState().fullscreen,
      hasVideo: Boolean(document.fullscreenElement?.querySelector('video')),
    };
    await player.exitFullscreen();
    const exited = player.getState().fullscreen;
    player.destroy();
    shell.remove();
    return { ...fullscreen, exited };
  }, libraryUrl);

  expect(result).toEqual({
    isShell: true,
    state: true,
    hasVideo: true,
    exited: false,
  });
});

test('fullscreen button exits a shadow-root player shell', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    const shell = root?.querySelector<HTMLElement>('.player');
    const fullscreen = root?.querySelector<HTMLButtonElement>('.fullscreen');
    if (!shell || !fullscreen || !element.mediaPlayer) {
      return { entered: false, exited: false };
    }
    await element.mediaPlayer.enterFullscreen();
    const entered = element.mediaPlayer.getState().fullscreen;
    fullscreen.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { entered, exited: !element.mediaPlayer.getState().fullscreen };
  }, elementUrl);

  expect(result).toEqual({ entered: true, exited: true });
});

test('settings menu controls playback speed with bounded presets', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const root = element.shadowRoot;
    const settings = root?.querySelector<HTMLButtonElement>('.settings');
    settings?.click();
    root?.querySelector<HTMLButtonElement>('[data-settings-target="speed"]')?.click();
    root?.querySelector<HTMLButtonElement>('[data-speed="3"]')?.click();
    const maximum = element.mediaPlayer?.getState().playbackRate;
    root?.querySelector<HTMLButtonElement>('[data-speed-step="1"]')?.click();
    const clampedMaximum = element.mediaPlayer?.getState().playbackRate;
    root?.querySelector<HTMLButtonElement>('[data-speed-step="-1"]')?.click();
    const steppedDown = element.mediaPlayer?.getState().playbackRate;
    return {
      panelOpen: root?.querySelector<HTMLElement>('.settings-panel')?.hidden === false,
      maximum,
      clampedMaximum,
      steppedDown,
      qualityHidden: root?.querySelector<HTMLElement>('.settings-quality')?.hidden,
    };
  }, elementUrl);

  expect(result).toEqual({
    panelOpen: true,
    maximum: 3,
    clampedMaximum: 3,
    steppedDown: 2.5,
    qualityHidden: true,
  });
});

test('toggles settings from the gear icon without flickering open', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player');
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    const settings = root?.querySelector<HTMLButtonElement>('.settings');
    const gear = root?.querySelector<HTMLElement>('.settings ph-gear');
    gear?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    gear?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const opened = root?.querySelector<HTMLElement>('.settings-panel')?.hidden === false;
    gear?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    gear?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const closed = root?.querySelector<HTMLElement>('.settings-panel')?.hidden;
    return { settingsExists: Boolean(settings), opened, closed };
  }, elementUrl);

  expect(result).toEqual({ settingsExists: true, opened: true, closed: true });
});

test('keeps the pause action while media is buffering', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const player = element.mediaPlayer;
    const video = element.shadowRoot?.querySelector<HTMLVideoElement>('video');
    const play = element.shadowRoot?.querySelector<HTMLButtonElement>('.play');
    let pauseCalls = 0;
    if (player && video && play) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      Object.defineProperty(video, 'ended', { configurable: true, value: false });
      player.pause = () => {
        pauseCalls += 1;
      };
      video.dispatchEvent(new Event('waiting'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      play.click();
    }
    return {
      status: player?.getState().status,
      playLabel: play?.getAttribute('aria-label'),
      isPlayingIcon: play?.classList.contains('is-playing'),
      pauseCalls,
    };
  }, elementUrl);

  expect(result).toEqual({
    status: 'buffering',
    playLabel: 'Pause (K / Space)',
    isPlayingIcon: true,
    pauseCalls: 1,
  });
});

test('video surface supports click and keyboard playback controls', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const player = element.mediaPlayer;
    const video = element.shadowRoot?.querySelector<HTMLVideoElement>('video');
    let playCalls = 0;
    if (player && video) {
      player.play = async () => {
        playCalls += 1;
      };
      video.focus();
      video.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      video.click();
      await new Promise((resolve) => setTimeout(resolve, 230));
    }
    return {
      volume: player?.getState().volume,
      playCalls,
      focused: document.activeElement === element,
      videoFocused: video === element.shadowRoot?.activeElement,
    };
  }, elementUrl);

  expect(result.volume).toBeCloseTo(0.95);
  expect(result.playCalls).toBe(1);
  expect(result.videoFocused).toBe(true);
});

test('routes shortcuts through the player surface and restarts feedback', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    const playerSurface = root?.querySelector<HTMLElement>('.player');
    const feedback = root?.querySelector<HTMLElement>('.shortcut-feedback');
    playerSurface?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    playerSurface?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
    );
    const firstVisible = feedback?.hidden === false;
    await new Promise((resolve) => setTimeout(resolve, 50));
    playerSurface?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
    );
    const secondVisible = feedback?.hidden === false;
    playerSurface?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', bubbles: true }),
    );
    const settingsOpenAfterShortcut =
      root?.querySelector<HTMLElement>('.settings-panel')?.hidden === false;
    playerSurface?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', bubbles: true }),
    );
    const settingsClosedAfterToggle =
      root?.querySelector<HTMLElement>('.settings-panel')?.hidden;
    return {
      playerFocused: root?.activeElement === playerSurface,
      firstVisible,
      secondVisible,
      feedbackKind: feedback?.className,
      settingsOpenAfterShortcut,
      settingsClosedAfterToggle,
    };
  }, elementUrl);

  expect(result.playerFocused).toBe(true);
  expect(result.firstVisible).toBe(true);
  expect(result.secondVisible).toBe(true);
  expect(result.feedbackKind).toContain('volume');
  expect(result.settingsOpenAfterShortcut).toBe(true);
  expect(result.settingsClosedAfterToggle).toBe(true);
});

test('focuses the first actionable settings control and supports direct loop control', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player') as HTMLElement & {
      mediaPlayer?: Player;
    };
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    const settings = root?.querySelector<HTMLButtonElement>('.settings');
    const loop = root?.querySelector<HTMLButtonElement>('.loop-toggle');
    settings?.click();
    await Promise.resolve();
    const firstSettingsFocus = root?.activeElement?.getAttribute('data-settings-target');
    root?.querySelector<HTMLButtonElement>('[data-settings-target="speed"]')?.click();
    await Promise.resolve();
    const nestedFocus = root?.activeElement?.getAttribute('data-speed-step');
    loop?.click();
    return {
      firstSettingsFocus,
      nestedFocus,
      loopState: element.mediaPlayer?.getState().loop,
      loopPressed: loop?.getAttribute('aria-pressed'),
      videoOutline: getComputedStyle(root!.querySelector('video')!).outlineStyle,
    };
  }, elementUrl);

  expect(result.firstSettingsFocus).toBe('speed');
  expect(result.nestedFocus).toBe('-1');
  expect(result.loopState).toBe(true);
  expect(result.loopPressed).toBe('true');
  expect(result.videoOutline).toBe('none');
});

test('opens the custom context menu with mouse and keyboard navigation', async ({
  page,
}) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player');
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    const video = root?.querySelector<HTMLVideoElement>('video');
    const menu = root?.querySelector<HTMLElement>('.context-menu');
    const player = root?.querySelector<HTMLElement>('.player');
    if (player && menu) {
      Object.defineProperty(player, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(100, 50, 400, 225),
      });
      Object.defineProperty(menu, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(0, 0, 192, 144),
      });
    }
    video?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 170, clientY: 90 }),
    );
    const mouseOpened = menu?.hidden === false;
    const mouseFocus = (root?.activeElement as HTMLElement | null)?.dataset.contextAction;
    const mousePosition = { left: menu?.style.left, top: menu?.style.top };
    root?.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    const keyboardFocus = (root?.activeElement as HTMLElement | null)?.dataset
      .contextAction;
    menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const closedAfterEscape = menu?.hidden;
    video?.focus();
    video?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu' }));
    const keyboardOpened = menu?.hidden === false;
    player?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    return {
      mouseOpened,
      mouseFocus,
      mousePosition,
      keyboardFocus,
      closedAfterEscape,
      keyboardOpened,
    };
  }, elementUrl);

  expect(result).toEqual({
    mouseOpened: true,
    mouseFocus: 'pip',
    mousePosition: { left: '70px', top: '40px' },
    keyboardFocus: 'copy-frame',
    closedAfterEscape: true,
    keyboardOpened: true,
  });
});

test('copies a frame while the context-menu item remains focused', async ({ page }) => {
  const result = await page.evaluate(async (moduleUrl) => {
    const { defineMediaPlayerElement } = await import(moduleUrl);
    defineMediaPlayerElement();
    const element = document.createElement('media-player');
    element.setAttribute('src', '/lesson.mp4');
    document.body.append(element);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const root = element.shadowRoot;
    const video = root?.querySelector<HTMLVideoElement>('video');
    const menu = root?.querySelector<HTMLElement>('.context-menu');
    let focusedAction: string | undefined;
    let writeCalled = false;
    Object.defineProperty(video!, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video!, 'videoWidth', { configurable: true, value: 320 });
    Object.defineProperty(video!, 'videoHeight', { configurable: true, value: 180 });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) =>
        callback(new Blob(['frame'], { type: 'image/png' })),
    });
    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: class ClipboardItemStub {
        constructor(public readonly data: Record<string, unknown>) {}
      },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: async () => {
          writeCalled = true;
          focusedAction = (root?.activeElement as HTMLElement | null)?.dataset
            .contextAction;
        },
      },
    });
    video?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    menu?.querySelector<HTMLButtonElement>('[data-context-action="copy-frame"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      focusedAction,
      writeCalled,
      menuHidden: menu?.hidden,
    };
  }, elementUrl);

  expect(result).toEqual({
    focusedAction: 'copy-frame',
    writeCalled: true,
    menuHidden: true,
  });
});
