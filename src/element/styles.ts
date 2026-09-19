export const MEDIA_PLAYER_STYLES = `
:host {
  --media-player-accent: #f2b84b;
  --media-player-panel: rgba(11, 14, 19, 0.92);
  --media-player-text: #f7f4ed;
  --media-player-muted: #a9adb5;
  --media-player-radius: 0;
  display: block;
  color: var(--media-player-text);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}

:host([picture-in-picture]) {
  width: 100%;
  height: 100%;
}

.player {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: #080a0e;
  border-radius: var(--media-player-radius);
  isolation: isolate;
}

:host([picture-in-picture]) .player {
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  border-radius: 0;
}

.player:fullscreen {
  width: 100vw;
  height: 100vh;
  max-width: none;
  border-radius: 0;
  aspect-ratio: auto;
}

.player:fullscreen video {
  width: 100%;
  height: 100%;
}

.caption-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.caption-group {
  position: absolute;
  min-width: 3rem;
  max-width: min(86%, 48rem);
  padding: 0.22em 0.5em;
  color: #fff;
  font-size: 1em;
  line-height: 1.22;
  text-align: center;
  overflow-wrap: anywhere;
  pointer-events: auto;
  cursor: grab;
  transform: translate(-50%, -50%);
  transition: left 180ms ease, top 180ms ease;
  user-select: none;
}

.caption-group[data-dragging="true"] {
  cursor: grabbing;
  transition: none;
}

.caption-group:focus-visible {
  outline: 2px solid var(--media-player-accent);
  outline-offset: 3px;
}

.caption-group[hidden] {
  display: none;
}

.caption-cue {
  display: block;
}

.shortcut-feedback {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 4;
  display: grid;
  place-items: center;
  width: 4.25rem;
  height: 4.25rem;
  color: var(--media-player-text);
  background: rgba(0, 0, 0, 0.68);
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.82);
}

.shortcut-feedback.is-visible {
  animation: shortcut-feedback-in 1s ease both;
}

.shortcut-feedback.seek-left {
  left: clamp(3.25rem, 11%, 7rem);
  display: inline-flex;
  gap: 0.45rem;
  width: auto;
  min-width: 4.25rem;
  padding: 0 0.75rem;
}

.shortcut-feedback.seek-right {
  right: clamp(3.25rem, 11%, 7rem);
  left: auto;
  display: inline-flex;
  gap: 0.45rem;
  width: auto;
  min-width: 4.25rem;
  padding: 0 0.75rem;
  transform: translate(50%, -50%) scale(0.82);
}

.shortcut-feedback.seek-right.is-visible {
  animation-name: shortcut-feedback-right-in;
}

.shortcut-feedback.volume {
  width: 7rem;
  height: 7rem;
  background: transparent;
  flex-direction: column;
  gap: 0.35rem;
}

.shortcut-feedback.volume::before {
  position: absolute;
  inset: -2rem;
  z-index: -1;
  content: "";
  background: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.58) 0%,
    rgba(0, 0, 0, 0.25) 42%,
    transparent 74%
  );
  border-radius: 50%;
}

.shortcut-feedback[hidden],
.shortcut-feedback [hidden] {
  display: none !important;
}

.feedback-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.feedback-detail {
  color: var(--media-player-text);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.shortcut-feedback:not(.seek-left):not(.seek-right):not(.volume) .feedback-detail {
  position: absolute;
  bottom: calc(100% + 0.45rem);
}

@keyframes shortcut-feedback-in {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.82);
  }

  16%,
  72% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.02);
  }
}

@keyframes shortcut-feedback-right-in {
  0% {
    opacity: 0;
    transform: translate(50%, -50%) scale(0.82);
  }

  16%,
  72% {
    opacity: 1;
    transform: translate(50%, -50%) scale(1);
  }

  100% {
    opacity: 0;
    transform: translate(50%, -50%) scale(1.02);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shortcut-feedback.is-visible {
    animation: shortcut-feedback-reduced 1s linear both;
  }
}

@keyframes shortcut-feedback-reduced {
  0%,
  72% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #080a0e;
}

video:focus-visible {
  outline: none;
}

.player:focus-visible {
  outline: 2px solid var(--media-player-accent);
  outline-offset: -2px;
}

.controls {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  display: grid;
  gap: 0.7rem;
  padding: 2.4rem 1rem 0.85rem;
  background: linear-gradient(transparent, var(--media-player-panel) 38%);
  opacity: 1;
  transform: translateY(0);
  transition: opacity 180ms ease, transform 180ms ease;
}

.player.controls-hidden .controls {
  pointer-events: none;
  opacity: 0;
  transform: translateY(0.35rem);
}

.timeline-area {
  position: relative;
  height: 1.05rem;
  cursor: pointer;
  touch-action: none;
}

.timeline-track {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 0.2rem;
  overflow: visible;
  background: rgba(255, 255, 255, 0.24);
  border-radius: 999px;
  transform: translateY(-50%);
}

.timeline-buffered,
.timeline-progress {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border-radius: inherit;
}

.timeline-buffered {
  width: var(--timeline-buffered, 0%);
  background: rgba(255, 255, 255, 0.32);
}

.timeline-progress {
  width: var(--timeline-position, 0%);
  background: var(--media-player-accent);
}

.timeline-chapters {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.timeline-chapter-marker {
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: 2px;
  background: var(--media-player-accent);
  border-radius: 999px;
  transform: translateX(-1px);
  opacity: 0.9;
}

.timeline-thumb {
  position: absolute;
  top: 50%;
  left: var(--timeline-position, 0%);
  width: 0.68rem;
  height: 0.68rem;
  background: var(--media-player-accent);
  border: 2px solid var(--media-player-text);
  border-radius: 50%;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.38);
  transform: translate(-50%, -50%);
  transition: width 120ms ease, height 120ms ease;
}

.timeline-area:hover .timeline-thumb,
.timeline-area:focus-within .timeline-thumb {
  width: 0.9rem;
  height: 0.9rem;
}

.timeline {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
  accent-color: var(--media-player-accent);
}

.timeline:disabled {
  cursor: default;
}

.timeline-preview {
  position: absolute;
  bottom: calc(100% + 0.45rem);
  left: 0;
  z-index: 3;
  display: grid;
  gap: 0.28rem;
  min-width: 4.2rem;
  padding: 0.25rem;
  color: var(--media-player-text);
  background: rgba(8, 10, 14, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  transform: translateX(0);
}

.thumbnail-viewport {
  position: relative;
  width: 160px;
  height: 90px;
  overflow: hidden;
  background: #000;
}

.thumbnail-placeholder {
  position: absolute;
  inset: 0;
  background: #000;
}

.thumbnail-placeholder[hidden] {
  display: none;
}

.thumbnail-viewport img {
  position: absolute;
  display: block;
  max-width: 100%;
  object-fit: contain;
  z-index: 1;
}

.thumbnail-viewport img[hidden] {
  display: none;
}

.thumbnail-time {
  padding: 0 0.15rem;
  font-size: 0.68rem;
  line-height: 1.2;
  text-align: center;
}

.thumbnail-chapter {
  max-width: 13rem;
  overflow: hidden;
  padding: 0 0.15rem;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thumbnail-chapter[hidden] {
  display: none;
}

.timeline-preview[hidden] {
  display: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

button,
select {
  color: inherit;
  font: inherit;
  border: 0;
  border-radius: 8px;
  background: transparent;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.25rem;
  min-height: 2.25rem;
  cursor: pointer;
}

button:hover,
button:focus-visible,
select:focus-visible {
  outline: 2px solid var(--media-player-accent);
  outline-offset: 2px;
}

button:hover {
  background: rgba(255, 255, 255, 0.12);
}

button.is-active,
[role="menuitemcheckbox"].is-selected {
  color: var(--media-player-accent);
}

button[data-tooltip] {
  position: relative;
}

button[data-tooltip]::after {
  position: absolute;
  right: 50%;
  bottom: calc(100% + 0.45rem);
  z-index: 8;
  width: max-content;
  max-width: 13rem;
  padding: 0.35rem 0.5rem;
  color: var(--media-player-text);
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  content: attr(data-tooltip);
  background: rgba(8, 10, 14, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 5px;
  opacity: 0;
  transform: translate(50%, 0.25rem);
  transition: opacity 120ms ease, transform 120ms ease;
}

button[data-tooltip]:hover::after,
button[data-tooltip]:focus-visible::after {
  opacity: 1;
  transform: translate(50%, 0);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

button:disabled:hover {
  background: transparent;
}

ph-play,
ph-pause,
ph-speaker-high,
ph-speaker-low,
ph-speaker-none,
ph-speaker-slash,
ph-picture-in-picture,
ph-copy,
ph-download-simple,
ph-repeat,
ph-corners-out,
ph-corners-in,
ph-gear,
ph-caret-left,
ph-caret-right,
ph-check,
ph-arrow-left,
ph-arrow-right,
ph-list-bullets,
ph-subtitles {
  display: block;
  line-height: 0;
}

.pause-icon,
.speaker-low,
.speaker-none,
.speaker-slash,
.fullscreen-exit {
  display: none;
}

.play.is-playing .play-icon,
.volume-control.is-muted .speaker-high,
.volume-control.is-muted .speaker-low,
.volume-control.is-muted .speaker-none,
.volume-control.is-low .speaker-high,
.fullscreen.is-fullscreen .fullscreen-enter {
  display: none;
}

.play.is-playing .pause-icon,
.volume-control.is-muted .speaker-slash,
.volume-control.is-low .speaker-low,
.fullscreen.is-fullscreen .fullscreen-exit {
  display: block;
}

.volume-control {
  display: flex;
  align-items: center;
  width: 2.25rem;
  overflow: visible;
  transition: width 180ms ease;
}

.volume-control:hover,
.volume-control:focus-within {
  width: 7.25rem;
}

.volume-button {
  flex: 0 0 2.25rem;
}

.volume-slider-shell {
  width: 0;
  overflow: hidden;
  transition: width 180ms ease;
}

.volume-control:hover .volume-slider-shell,
.volume-control:focus-within .volume-slider-shell {
  width: 5.1rem;
}

.volume {
  width: 4.4rem;
  height: 1.05rem;
  margin: 0 0.4rem 0 0.1rem;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.volume::-webkit-slider-runnable-track {
  height: 0.2rem;
  background: linear-gradient(
    to right,
    var(--media-player-accent) 0 var(--volume-position, 100%),
    rgba(255, 255, 255, 0.24) var(--volume-position, 100%) 100%
  );
  border-radius: 999px;
}

.volume::-moz-range-track {
  height: 0.2rem;
  background: rgba(255, 255, 255, 0.24);
  border-radius: 999px;
}

.volume::-moz-range-progress {
  height: 0.2rem;
  background: var(--media-player-accent);
  border-radius: 999px;
}

.volume::-webkit-slider-thumb {
  width: 0.68rem;
  height: 0.68rem;
  margin-top: -0.24rem;
  appearance: none;
  background: var(--media-player-accent);
  border: 2px solid var(--media-player-text);
  border-radius: 50%;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.38);
}

.volume::-moz-range-thumb {
  width: 0.68rem;
  height: 0.68rem;
  background: var(--media-player-accent);
  border: 2px solid var(--media-player-text);
  border-radius: 50%;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.38);
}

.time,
.live {
  color: var(--media-player-muted);
  font-size: 0.76rem;
  white-space: nowrap;
}

.live {
  color: var(--media-player-accent);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.spacer {
  flex: 1;
}

.settings-panel {
  position: absolute;
  right: 0.75rem;
  bottom: 3.65rem;
  z-index: 4;
  width: min(19rem, calc(100% - 1.5rem));
  overflow: visible;
  color: var(--media-player-text);
  background: rgba(20, 20, 20, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.42);
}

.settings-panel[hidden] {
  display: none;
}

.chapters-panel {
  position: absolute;
  right: 0.75rem;
  bottom: 3.65rem;
  z-index: 4;
  width: min(22rem, calc(100% - 1.5rem));
  max-height: min(60vh, 22rem);
  overflow: auto;
  color: var(--media-player-text);
  background: rgba(20, 20, 20, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.42);
}

.chapters-panel[hidden] {
  display: none;
}

.chapters-heading {
  padding: 0.75rem 0.9rem 0.45rem;
  color: var(--media-player-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.chapters-list {
  display: grid;
  gap: 0.15rem;
  padding: 0.35rem;
}

.chapter-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.75rem;
  justify-content: initial;
  width: 100%;
  padding: 0.6rem 0.55rem;
  text-align: left;
}

.chapter-row.is-active {
  color: var(--media-player-accent);
  background: rgba(242, 184, 75, 0.12);
}

.chapter-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-time {
  color: var(--media-player-muted);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

.context-menu {
  position: absolute;
  z-index: 8;
  display: grid;
  min-width: 12rem;
  padding: 0.35rem;
  color: var(--media-player-text);
  background: rgba(20, 20, 20, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.42);
}

.context-menu[hidden] {
  display: none;
}

.context-menu button {
  display: grid;
  grid-template-columns: 1.1rem 1fr auto;
  justify-content: initial;
  gap: 0.55rem;
  width: 100%;
  min-height: 2.3rem;
  padding: 0.35rem 0.55rem;
  text-align: left;
}

.context-menu button:hover,
.context-menu button:focus-visible,
.context-menu button.is-selected {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu .context-check {
  visibility: hidden;
  color: var(--media-player-accent);
}

.context-menu button.is-selected .context-check {
  visibility: visible;
}

.settings-menu-view,
.settings-subview {
  padding: 0.35rem;
}

.settings-menu-view[hidden],
.settings-subview[hidden] {
  display: none;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 2.55rem;
  gap: 0.65rem;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  text-align: left;
}

.settings-row:hover,
.settings-row:focus-visible {
  background: rgba(255, 255, 255, 0.1);
}

.settings-row:disabled,
.settings-row:disabled:hover {
  color: var(--media-player-muted);
  background: transparent;
}

.settings-row-value {
  margin-left: auto;
  color: var(--media-player-muted);
  font-size: 0.78rem;
}

.settings-row[hidden] {
  display: none;
}

.caption-settings {
  display: grid;
  gap: 0.4rem;
  max-height: min(25rem, 62vh);
  overflow-y: auto;
  scrollbar-color: rgba(242, 184, 75, 0.7) transparent;
  scrollbar-width: thin;
}

.caption-settings::-webkit-scrollbar,
.caption-options::-webkit-scrollbar {
  width: 0.42rem;
}

.caption-settings::-webkit-scrollbar-track,
.caption-options::-webkit-scrollbar-track {
  background: transparent;
}

.caption-settings::-webkit-scrollbar-thumb,
.caption-options::-webkit-scrollbar-thumb {
  background: rgba(242, 184, 75, 0.7);
  border: 1px solid rgba(11, 14, 19, 0.9);
  border-radius: 999px;
}

.caption-toggle,
.caption-setting-row,
.caption-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 2.55rem;
  gap: 0.65rem;
  padding: 0.35rem 0.65rem;
  color: var(--media-player-text);
  text-align: left;
  border-radius: 8px;
}

.caption-toggle:hover,
.caption-toggle:focus-visible,
.caption-setting-row:hover,
.caption-setting-row:focus-visible,
.caption-option:hover,
.caption-option:focus-visible {
  background: rgba(255, 255, 255, 0.1);
}

.caption-toggle-track {
  position: relative;
  width: 2.1rem;
  height: 1.15rem;
  margin-left: auto;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  transition: background 180ms ease, border-color 180ms ease;
}

.caption-toggle-track > span {
  position: absolute;
  top: 0.15rem;
  left: 0.16rem;
  width: 0.77rem;
  height: 0.77rem;
  background: var(--media-player-text);
  border-radius: 50%;
  transition: transform 180ms ease;
}

.caption-toggle.is-active .caption-toggle-track {
  background: var(--media-player-accent);
  border-color: var(--media-player-accent);
}

.caption-toggle.is-active .caption-toggle-track > span {
  transform: translateX(0.94rem);
}

.caption-setting-list {
  display: grid;
  gap: 0.15rem;
}

.caption-setting-row {
  min-height: 2.35rem;
}

.caption-setting-value {
  max-width: 10rem;
  margin-left: auto;
  overflow: hidden;
  color: var(--media-player-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caption-options {
  display: grid;
  gap: 0.15rem;
  max-height: min(21rem, 54vh);
  padding-top: 0.45rem;
  overflow-y: auto;
  scrollbar-color: rgba(242, 184, 75, 0.7) transparent;
  scrollbar-width: thin;
}

.caption-option {
  justify-content: space-between;
  min-height: 2.95rem;
  padding-inline: 0.7rem;
}

.caption-option.is-selected {
  color: var(--media-player-accent);
  background: rgba(242, 184, 75, 0.1);
}

.caption-option ph-check {
  visibility: hidden;
  color: var(--media-player-accent);
}

.caption-option.is-selected ph-check {
  visibility: visible;
}

.caption-setting-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding-top: 0.25rem;
}

.caption-setting-actions button {
  min-height: 1.9rem;
  padding: 0.2rem 0.55rem;
  color: var(--media-player-text);
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.12);
}

.caption-setting-actions button:hover,
.caption-setting-actions button:focus-visible {
  background: rgba(255, 255, 255, 0.2);
}

.settings-heading {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2.25rem;
  padding: 0 0.1rem 0.35rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
}

.settings-heading strong {
  font-size: 0.82rem;
}

.settings-back {
  min-width: 1.8rem;
  min-height: 1.8rem;
}

.speed-value-large {
  padding: 0.55rem 0 0.2rem;
  font-size: 1.35rem;
  font-weight: 700;
  text-align: center;
}

.speed-stepper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.35rem 0.5rem;
}

.speed-stepper > button {
  min-width: 1.75rem;
  min-height: 1.75rem;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
}

.speed-track {
  position: relative;
  flex: 1;
  height: 0.22rem;
  background: rgba(255, 255, 255, 0.64);
  border-radius: 999px;
}

.speed-track-thumb {
  position: absolute;
  top: 50%;
  width: 0.7rem;
  height: 0.7rem;
  background: var(--media-player-text);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.speed-presets {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.35rem;
}

.speed-presets button,
.quality-option {
  min-width: 0;
  min-height: 1.8rem;
  padding: 0.2rem 0.25rem;
  color: var(--media-player-text);
  font-size: 0.74rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
}

.speed-presets button.is-selected,
.quality-option.is-selected {
  color: #151515;
  background: var(--media-player-text);
}

.quality-options {
  display: grid;
  gap: 0.25rem;
  padding-top: 0.45rem;
}

.quality-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-inline: 0.7rem;
  border-radius: 7px;
}

.quality-option ph-check {
  visibility: hidden;
}

.quality-option.is-selected ph-check {
  visibility: visible;
}

.message {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: 80%;
  padding: 0.65rem 0.8rem;
  color: var(--media-player-text);
  font-size: 0.85rem;
  text-align: center;
  background: rgba(8, 10, 14, 0.8);
  border-radius: 8px;
  transform: translate(-50%, -50%);
}

.message[hidden] {
  display: none;
}

@media (max-width: 520px) {
  .controls {
    gap: 0.35rem;
    padding: 1.7rem 0.55rem 0.45rem;
  }

  .time {
    font-size: 0.68rem;
  }

}

@media (prefers-reduced-motion: reduce) {
  .controls,
  .volume-control,
  .timeline-thumb,
  .caption-group {
    transition: none;
  }
}
`;
