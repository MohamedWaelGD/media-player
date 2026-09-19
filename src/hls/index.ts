import Hls, { type HlsConfig } from 'hls.js';
import { HlsEngine } from './hls-engine';

export { HlsEngine } from './hls-engine';
export type { HlsConfig } from 'hls.js';

export function createHlsEngine(config?: Partial<HlsConfig>): HlsEngine {
  return new HlsEngine(Hls, config);
}
