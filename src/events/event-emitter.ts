import type {
  PlayerEventHandler,
  PlayerEventMap,
  PlayerEventName,
} from '../types/public';

export class EventEmitter {
  private readonly handlers = new Map<PlayerEventName, Set<(...args: never[]) => void>>();

  on<K extends PlayerEventName>(event: K, handler: PlayerEventHandler<K>): () => void {
    const handlers = this.handlers.get(event) ?? new Set();
    handlers.add(handler as (...args: never[]) => void);
    this.handlers.set(event, handlers);

    return () => {
      handlers.delete(handler as (...args: never[]) => void);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  emit<K extends PlayerEventName>(event: K, payload: PlayerEventMap[K]): void {
    const handlers = this.handlers.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of [...handlers]) {
      handler(payload as never);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
