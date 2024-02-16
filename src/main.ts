import { Store } from 't-state';

export function createFSM<S extends string>({
  initial,
  states,
}: {
  initial: S;
  states: { [K in S]: {} };
}) {
  function interpret() {
    const state = new Store({
      state: {
        value: initial,
      },
    });

    return {
      get state() {
        return state.state.value;
      },
    };
  }

  return {
    interpret,
  };
}
