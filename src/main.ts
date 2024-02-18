import { Store } from 't-state';

type FSMProps = {
  states: string;
  events: { type: string };
};

type ActionArgs<P extends FSMProps> = {
  next: P['states'];
  prev: P['states'];
  event: P['events'] | undefined;
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
        [E in P['events']['type']]?: Target<P>;
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
  on?: { [E in P['events']['type']]?: Target<P> };
  handleInvalidTransition?: (
    error: Error,
    state: { state: P['states']; event: P['events'] },
  ) => void;
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
    lastEvent: Events | undefined;
  };

  const store = new Store<StoreState>({
    state: {
      value: initial,
      prev: undefined,
      done: false,
      lastEvent: undefined,
    },
  });

  const initialStateConfig = states[initial];

  if (initialStateConfig.entry) {
    initialStateConfig.entry({
      next: initial,
      prev: undefined,
      send,
      event: undefined,
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
        { state: currentState, event },
      );

      return {
        changed: false,
        snapshot: store.state,
      };
    }

    const eventType = event.type as Props['events']['type'];

    const nextTargetObj = currentStateConfig.on?.[eventType] || on?.[eventType];

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
          lastEvent: event,
        });

        snapshot = store.state;

        const actionArgs = {
          next: nextState,
          prev: currentState,
          send,
          event,
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
          new Error(
            `Event '${event.type}' not allowed in state '${currentState}'`,
          ),
          { state: currentState, event },
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
