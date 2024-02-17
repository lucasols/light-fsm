import { Store } from 't-state';

type FSMProps = {
  states: string;
  events: string;
};

type Target<P extends FSMProps> =
  | P['states']
  | {
      target: P['states'];
      action?: (args: { next: P['states']; prev: P['states'] }) => void;
    };

export type FSMConfig<P extends FSMProps> = {
  initial: P['states'];
  states: {
    [K in P['states']]: {
      on?: {
        [E in P['events']]?: Target<P>;
      };
      final?: boolean;
      entry?: (args: {
        next: P['states'];
        prev: P['states'] | undefined;
      }) => void;
      exit?: (args: { next: P['states']; prev: P['states'] }) => void;
    };
  };
  /** state independent transitions */
  on?: { [E in P['events']]?: Target<P> };
};

export function createFSM<Props extends FSMProps = never>({
  initial,
  states,
  on,
}: FSMConfig<Props>) {
  type States = Props['states'];
  type Events = Props['events'];

  type StoreState = {
    value: States;
    prev: States | undefined;
    done: boolean;
  };

  const store = new Store<StoreState>({
    state: {
      value: initial,
      prev: initial,
      done: false,
    },
  });

  const initialStateConfig = states[initial];

  if (initialStateConfig.entry) {
    initialStateConfig.entry({
      next: initial,
      prev: undefined,
    });
  }

  function send(event: Events): {
    changed: boolean;
    snapshot: StoreState;
  } {
    const currentState = store.state.value;

    const currentStateConfig = states[currentState];

    if (currentStateConfig.final) {
      return {
        changed: false,
        snapshot: store.state,
      };
    }

    const nextTargetObj = currentStateConfig.on?.[event] || on?.[event];

    const nextState =
      typeof nextTargetObj === 'string' ? nextTargetObj : nextTargetObj?.target;

    const changed = !!(nextState && nextState !== currentState);

    if (changed) {
      const nextStateConfig = states[nextState];

      const actionArgs = {
        next: nextState,
        prev: currentState,
      };

      currentStateConfig.exit?.(actionArgs);

      if (typeof nextTargetObj !== 'string' && nextTargetObj) {
        nextTargetObj.action?.(actionArgs);
      }

      nextStateConfig.entry?.(actionArgs);

      store.setState({
        value: nextState,
        prev: currentState,
        done: Boolean(nextStateConfig.final),
      });
    }

    return {
      changed,
      snapshot: store.state,
    };
  }

  return {
    get state() {
      return store.state.value;
    },
    get snapshot() {
      return store.state;
    },
    send,
    store,
  };
}
