# Media Player

Framework-agnostic TypeScript video player for HTML5 media, HLS, watched-progress
tracking, optional forward-seek protection, and a customizable Web Component.

The headless core has no Angular, React, Vue, Svelte, RxJS, or UI framework dependency.
Use it directly from any framework or use the optional `<media-player>` custom element.

## Install

```bash
npm install @mohamedwaelgd/media-player
```

HLS.js is optional. Install it when HLS playback is needed in browsers without native
HLS support:

```bash
npm install hls.js
```

The package tooling and supported development environment require Node.js 20 or newer.

## Headless API

```ts
import { MediaPlayer } from '@mohamedwaelgd/media-player';
import { createHlsEngine } from '@mohamedwaelgd/media-player/hls';

const video = document.querySelector('video');
if (!video) throw new Error('Video element not found');

const player = new MediaPlayer(video, {
  fullscreenElement: document.querySelector<HTMLElement>('.player-shell') ?? undefined,
  engines: [createHlsEngine()],
  seekPolicy: {
    mode: 'watched',
  },
  tracking: {
    milestones: [25, 50, 75, 90, 100],
    completionThreshold: 90,
  },
});

await player.load({
  id: 'lesson-12',
  src: '/course/master.m3u8',
  type: 'application/vnd.apple.mpegurl',
});

player.on('progress', (event) => {
  console.log(event.currentTime, event.watchedPercentage);
});

player.on('completed', (data) => {
  saveProgress(data);
});
```

`fullscreenElement` is optional. Set it to the player shell when custom controls are
rendered around the video; fullscreen then includes the video and those controls instead
of showing only the raw browser video surface.

The same API works in Angular, React, Vue, Svelte, or vanilla JavaScript. Framework
wrappers are unnecessary because the player exposes ordinary methods, typed events, and
a state subscription.

Playback engines are selected in native-first order. Configured engines are checked after the
built-in native engine, which preserves native HLS playback on browsers such as Safari.

### Framework Integration

The headless entry is compatible with Vite, Webpack, Vue, Angular, React, and Next.js. Importing
`MediaPlayer` is SSR-safe; create the player only after the framework has mounted an actual
`HTMLVideoElement`, and call `destroy()` from the framework cleanup hook. The `/element` entry
can be used from any framework that supports custom elements, provided `defineMediaPlayerElement()`
is called in the browser.

```ts
const unsubscribe = player.subscribe((state) => {
  console.log(state.status, state.currentTime, state.duration);
});

await player.play();
player.pause();
player.seek(120);
player.setVolume(0.5);
player.setMuted(true);
player.setPlaybackRate(1.25);
const frame = await player.getTimelineThumbnail(120);
const qualityLevels = player.getQualityLevels();
player.setQuality('auto');
await player.load({
  id: 'lesson-12',
  src: '/course/lesson.mp4',
  captions: [
    {
      src: '/course/lesson.en.vtt',
      srclang: 'en',
      label: 'English',
      default: true,
    },
  ],
});
await player.enterFullscreen();
await player.enterPictureInPicture();

unsubscribe();
player.destroy();
```

## Watched Progress

Tracking uses unique watched ranges, so replaying the same section does not inflate
completion. Progress is serializable and persistence is intentionally caller-managed:

```ts
const saved = localStorage.getItem('lesson-12');
if (saved) {
  player.restoreTrackingData(JSON.parse(saved));
}

player.on('tracking-report', (data) => {
  localStorage.setItem('lesson-12', JSON.stringify(data));
});
```

The default completion threshold is 90% unique watched content. Both milestones and the
threshold can be changed through `tracking` options.

## Forward-Seek Protection

Set `seekPolicy.mode` to `watched` to make forward seeking stop at the furthest playback
position reached so far:

```ts
const player = new MediaPlayer(video, {
  seekPolicy: {
    mode: 'watched',
    tolerance: 1,
  },
});

player.on('seek-blocked', ({ requested, allowed }) => {
  console.log(`Requested ${requested}, allowed ${allowed}`);
});
```

Backward seeks remain available. Restored `ranges` and `maxReachedTime` unlock previously
reached content. The restriction is applied only to finite VOD media; live HLS streams
retain normal DVR and live-edge behavior.

This is a client-side playback policy, not a security boundary. Server-side progress
validation is required when completion must be tamper-resistant.

## Web Component

```ts
import { defineMediaPlayerElement } from '@mohamedwaelgd/media-player/element';

defineMediaPlayerElement();
```

```html
<media-player
  src="/course/lesson.mp4"
  type="video/mp4"
  seek-policy="watched"
  poster="/course/poster.webp"
></media-player>
```

The component uses Shadow DOM and exposes `::part` hooks for styling:

```css
media-player {
  --media-player-accent: #d98c32;
  --media-player-radius: 8px;
}

media-player::part(play-button) {
  color: white;
}
```

The component includes responsive custom controls, pointer-driven scrubbing, Phosphor
icons, hover frame previews, an expandable volume control, a gear settings menu for
speed and adaptive quality, and controls that fade after 3 seconds of inactivity while
playing. Preview frames should preferably come from a WebVTT sprite track. The generated
canvas fallback is opt-in because it creates a second hidden video and performs additional
decoding and seeking:

```html
<media-player
  src="/course/lesson.mp4"
  thumbnail-vtt="/course/lesson-thumbnails.vtt"
  thumbnail-fallback="generated"
  thumbnail-crossorigin="anonymous"
  caption-src="/course/lesson.en.vtt"
  caption-lang="en"
  caption-label="English"
  caption-default="true"
  chapter-src="/course/lesson-chapters.vtt"
  chapter-lang="en"
  chapter-label="Lesson chapters"
></media-player>
```

`getTimelineThumbnail()` clamps previews with the same watched-only policy as seeking.
Preview failures are non-fatal, and previews are disabled for live streams. The Web
Component dispatches `media-player-change` whenever its internal player is replaced or
destroyed, allowing framework integrations to rebind typed `subscribe()` and `on()`
listeners through `element.mediaPlayer`. HLS sources expose manifest quality levels through
`getQualityLevels()` and `setQuality()`. Fixed MP4 sources do not expose a quality menu.
Optional resource failures are reported through the typed `warning` event without changing
playback state. This includes chapter tracks, thumbnail resources, plugin setup/cleanup, and
engine cleanup failures.
Caption tracks are read from WebVTT `TextTrack`s supplied through `MediaSource.captions` or the
Web Component caption attributes, then rendered in a customizable layer above the video. The
component exposes a captions toggle when tracks are available. Caption preferences persist in
`localStorage` and can be changed from the captions settings panel or the element API:

```ts
element.setCaptionPreferences({
  textColor: '#ffff00',
  backgroundOpacity: 0.65,
  fontSize: 1.25,
  edgeStyle: 'outline',
  fontFamily: 'proportional-sans-serif',
});

element.addEventListener('caption-preferences-change', (event) => {
  console.log(event.detail.preferences);
});
```

Captions can be repositioned by dragging them, or by focusing the caption layer and using the
arrow keys. `element.resetCaptionPreferences()` restores the default style and position.

The Web Component's Picture-in-Picture action uses the Chromium Document Picture-in-Picture
API rather than native video Picture-in-Picture. This moves the same custom player surface
into an always-on-top browser window, so the custom controls remain available. Browsers
without Document Picture-in-Picture show an unavailable-feature message instead of opening
the native video controls.

The control row includes direct captions and loop toggles. Loop is disabled for live streams.
Right-clicking the video opens a custom menu with Picture-in-Picture, frame copying, frame
download, and loop actions. Shift+F10 and the Context Menu key open the same menu for keyboard
users.

Chapter data can be supplied as an inline `chapters` array or as a WebVTT `chapterTrack` on
`MediaSource`. The two forms are mutually exclusive:

```ts
await player.load({
  src: '/course/lesson.mp4',
  chapters: [
    { title: 'Introduction', startTime: 0, endTime: 15 },
    { title: 'Main topic', startTime: 15, endTime: 35 },
    { title: 'Summary', startTime: 35, endTime: 60 },
  ],
});
```

The Web Component exposes the same feature through `chapter-src`, `chapter-lang`, and
`chapter-label`. When chapters are available, the Chapters control appears beside Captions.
Selecting a chapter seeks to its start, chapter boundaries appear on the timeline, and timeline
previews include the chapter title. Chapter loading failures are non-fatal to playback.
Inline chapters currently require finite, non-negative `startTime` and `endTime` values. If
chapters overlap, active chapter lookup uses the first matching chapter after start-time sorting.

To test chapters manually, serve the VTT and media files over HTTP, open the player, and verify
the Chapters button, popup keyboard navigation, seeking, active chapter highlighting, timeline
markers, and preview titles. Remove `chapter-src` and confirm the button and markers disappear.

The element automatically loads the optional HLS adapter for HLS sources when native
HLS is unavailable. If the optional `hls.js` dependency is not installed, native HLS
still works in browsers that provide it.

## Public Events

The core normalizes browser events into:

```text
load-start, loaded, play, pause, buffer-start, buffer-end,
seek-start, seek-end, seek-blocked, progress, tracking-report,
volume-change, speed-change, fullscreen-change,
picture-in-picture-change, quality-change, milestone, completed, ended,
chapters-change, error, warning, destroy
```

All `on()` calls return an unsubscribe function.

## Live HLS

Live streams expose `streamType: 'live'`, the current `seekable` DVR window, live-edge
status, and `secondsBehindLiveEdge`. Completion and persisted watched percentage are VOD
concepts and remain unavailable for live streams.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run test:browser
npm run validate:package
npm run validate:release
```

The package publishes ESM, CommonJS, and declarations. The headless core is available at
the package root; the Web Component and HLS adapter are available from `/element` and
`/hls` subpaths.

## License

MIT. See [LICENSE](./LICENSE).
