import type { Player, PlayerPlugin } from '../types/public';

export class PluginManager {
  private readonly cleanups: Array<{ name: string; cleanup: () => void }> = [];

  constructor(
    private readonly onError: (error: {
      name: string;
      phase: 'setup' | 'cleanup';
      error: unknown;
    }) => void,
  ) {}

  setup(plugins: PlayerPlugin[], player: Player): void {
    for (const plugin of plugins) {
      if (!plugin.name.trim()) {
        continue;
      }
      try {
        const cleanup = plugin.setup(player);
        if (cleanup) {
          this.cleanups.push({ name: plugin.name, cleanup });
        }
      } catch (error) {
        this.onError({ name: plugin.name, phase: 'setup', error });
      }
    }
  }

  destroy(): void {
    for (const { name, cleanup } of [...this.cleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        this.onError({ name, phase: 'cleanup', error });
      }
    }
    this.cleanups.length = 0;
  }
}
