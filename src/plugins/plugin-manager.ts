import type { Player, PlayerPlugin } from '../types/public';

export class PluginManager {
  private readonly cleanups: Array<() => void> = [];

  setup(plugins: PlayerPlugin[], player: Player): void {
    for (const plugin of plugins) {
      if (!plugin.name.trim()) {
        continue;
      }
      const cleanup = plugin.setup(player);
      if (cleanup) {
        this.cleanups.push(cleanup);
      }
    }
  }

  destroy(): void {
    for (const cleanup of [...this.cleanups].reverse()) {
      cleanup();
    }
    this.cleanups.length = 0;
  }
}
