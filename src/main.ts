import { Store } from 't-state';

type FSMProps = {
  states: string;
  events: string;
};

type ActionArgs<P extends FSMProps> = {
  next: P['states'];
  prev: P['states'];
  send: (event: P['events']) => {
    changed: boolean;
  };
};

type Target<P extends FSMProps> =
  | P['states']
  | {
      target: P['states'];
      action?: (args: ActionArgs<P>) => void;
    };

export type FSMConfig<P extends FSMProps> = {
  initial: P['states'];
  states: {
    [K in P['states']]: {
      on?: {
        [E in P['events']]?: Target<P>;
      };
      final?: boolean;
      entry?: (
        args: Omit<ActionArgs<P>, 'prev'> & {
          prev: undefined | P['states'];
        },
      ) => void;
      exit?: (args: ActionArgs<P>) => void;
    };
  };
  /** state independent transitions */
  on?: { [E in P['events']]?: Target<P> };
  handleInvalidTransition?: (error: Error) => void;
};

export function createFSM<Props extends FSMProps = never>({
  initial,
  states,
  on,
  handleInvalidTransition,
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
      prev: undefined,
      done: false,
    },
  });

  const initialStateConfig = states[initial];

  if (initialStateConfig.entry) {
    initialStateConfig.entry({
      next: initial,
      prev: undefined,
      send,
    });
  }

  function send(event: Events): {
    changed: boolean;
    snapshot: StoreState;
  } {
    const currentState = store.state.value;

    const currentStateConfig = states[currentState];

    if (currentStateConfig.final) {
      handleInvalidTransition?.(
        new Error(`Cannot transition from final state '${currentState}'`),
      );

      return {
        changed: false,
        snapshot: store.state,
      };
    }

    const nextTargetObj = currentStateConfig.on?.[event] || on?.[event];

    const nextState =
      typeof nextTargetObj === 'string' ? nextTargetObj : nextTargetObj?.target;

    const changed = !!(nextState && nextState !== currentState);

    let snapshot = undefined as StoreState | undefined;

    if (changed) {
      const nextStateConfig = states[nextState];

      store.batch(() => {
        store.setState({
          value: nextState,
          prev: currentState,
          done: Boolean(nextStateConfig.final),
        });

        snapshot = store.state;

        const actionArgs = {
          next: nextState,
          prev: currentState,
          send,
        };

        currentStateConfig.exit?.(actionArgs);

        if (typeof nextTargetObj !== 'string' && nextTargetObj) {
          nextTargetObj.action?.(actionArgs);
        }

        nextStateConfig.entry?.(actionArgs);
      });
    } else {
      if (handleInvalidTransition && !nextState) {
        handleInvalidTransition(
          new Error(`Event '${event}' not allowed in state '${currentState}'`),
        );
      }
    }

    return {
      changed,
      snapshot: snapshot ?? store.state,
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
