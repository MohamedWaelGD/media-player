import type { PlayerState } from '../types/public';

function cloneState(state: PlayerState): PlayerState {
  return {
    ...state,
    buffered: state.buffered.map((range) => ({ ...range })),
    seekable: state.seekable.map((range) => ({ ...range })),
    qualityLevels: state.qualityLevels.map((level) => ({ ...level })),
  };
}

export class StateStore {
  private state: PlayerState;
  private readonly subscribers = new Set<(state: PlayerState) => void>();

  constructor(initialState: PlayerState) {
    this.state = cloneState(initialState);
  }

  get(): PlayerState {
    return cloneState(this.state);
  }

  update(patch: Partial<PlayerState>): PlayerState {
    this.state = cloneState({ ...this.state, ...patch });
    for (const subscriber of [...this.subscribers]) {
      subscriber(this.get());
    }
    return this.get();
  }

  subscribe(subscriber: (state: PlayerState) => void): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.get());
    return () => this.subscribers.delete(subscriber);
  }

  clear(): void {
    this.subscribers.clear();
  }
}
