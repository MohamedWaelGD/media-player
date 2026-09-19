import { describe, expect, it } from 'vitest';
import { PluginManager } from '../../src/plugins/plugin-manager';
import type { Player, PlayerPlugin } from '../../src/types/public';

const player = {} as Player;

describe('PluginManager', () => {
  it('isolates setup failures and continues with later plugins', () => {
    const setup: string[] = [];
    const warnings: unknown[] = [];
    const manager = new PluginManager((warning) => warnings.push(warning));
    const plugins: PlayerPlugin[] = [
      {
        name: 'broken',
        setup: () => {
          throw new Error('setup failed');
        },
      },
      {
        name: 'healthy',
        setup: () => {
          setup.push('healthy');
        },
      },
    ];

    manager.setup(plugins, player);

    expect(setup).toEqual(['healthy']);
    expect(warnings).toEqual([
      { name: 'broken', phase: 'setup', error: expect.any(Error) },
    ]);
  });

  it('runs every cleanup in reverse order when one fails', () => {
    const cleanup: string[] = [];
    const warnings: unknown[] = [];
    const manager = new PluginManager((warning) => warnings.push(warning));
    manager.setup(
      [
        { name: 'first', setup: () => () => cleanup.push('first') },
        {
          name: 'second',
          setup: () => () => {
            cleanup.push('second');
            throw new Error('cleanup failed');
          },
        },
        { name: 'third', setup: () => () => cleanup.push('third') },
      ],
      player,
    );

    manager.destroy();
    manager.destroy();

    expect(cleanup).toEqual(['third', 'second', 'first']);
    expect(warnings).toEqual([
      { name: 'second', phase: 'cleanup', error: expect.any(Error) },
    ]);
  });
});
