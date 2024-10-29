import { Store } from 't-state';

type FSMProps = {
  states: string;
  events: { type: string };
  guards?: string;
};

type ActionArgs<P extends FSMProps> = {
  next: P['states'];
  prev: P['states'];
  event: P['events'] | undefined;
  send: (event: P['events']) => {
    changed: boolean;
  };
};

export type GuardFn<P extends FSMProps> = (args: {
  current: P['states'];
  prev: P['states'];
  event: P['events'];
}) => boolean;

type Target<P extends FSMProps> =
  | P['states']
  | {
      target: P['states'];
      guard?: P['guards'] | GuardFn<P>;
      action?: (args: ActionArgs<P>) => void;
    };

type GuardedTarget<P extends FSMProps> = {
  guard?: P['guards'] | GuardFn<P>;
  target: Target<P>;
  action?: (args: ActionArgs<P>) => void;
};

type Transitions<P extends FSMProps> = Target<P> | GuardedTarget<P>[];

export type FSMConfig<P extends FSMProps> = {
  initial: P['states'];
  states: {
    [K in P['states']]: {
      on?: {
        [E in P['events']['type']]?: Transitions<P>;
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
  on?: { [E in P['events']['type']]?: Transitions<P> };
  handleInvalidTransition?: (
    error: Error,
    state: { state: P['states']; event: P['events'] },
  ) => void;
  debug?: string;
} & (P['guards'] extends string ?
  {
    guards: {
      [K in P['guards']]: boolean | (() => boolean);
    };
  }
: { guards?: undefined });

export function createFSM<Props extends FSMProps>({
  initial,
  states,
  on,
  handleInvalidTransition,
  debug,
  guards,
}: FSMConfig<Props>) {
  type States = Props['states'];
  type Events = Props['events'];
  type Guards = Props['guards'];

  type Action = (args: ActionArgs<Props>) => void;

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    checkUnreachableStates(initial, states, on);

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

  function getStateFromGuard(
    guard: Guards | GuardFn<Props>,
    target: Target<Props>,
    event: Events,
    prev: States,
  ): States | null {
    const targetState = typeof target === 'string' ? target : target.target;

    if (guard === undefined) return targetState;

    if (typeof guard === 'function') {
      const guardResult = guard({
        current: store.state.value,
        prev,
        event,
      });

      return guardResult ? targetState : null;
    }

    const guardResultOrFn = guards?.[guard];

    if (guardResultOrFn === undefined) {
      throw new Error(`Guard '${guard}' not found`);
    }

    const guardResult =
      typeof guardResultOrFn === 'boolean' ? guardResultOrFn : (
        guardResultOrFn()
      );

    return guardResult ? targetState : null;
  }

  function getStateFromGuards(
    guardedTargets: GuardedTarget<Props>[],
    event: Events,
    prev: States,
  ): null | { state: States; action?: Action } {
    for (const guardedTarget of guardedTargets) {
      const state = getStateFromGuard(
        guardedTarget.guard,
        guardedTarget.target,
        event,
        prev,
      );

      if (state) return { state, action: guardedTarget.action };
    }

    return null;
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

    const nextTargetObj: Transitions<Props> | undefined =
      currentStateConfig.on?.[eventType] || on?.[eventType];

    let nextState: States | null = null;
    let action: Action | undefined = undefined;
    let hasGuards = false;

    if (nextTargetObj) {
      if (typeof nextTargetObj === 'string') {
        nextState = nextTargetObj;
      }
      //
      else if (Array.isArray(nextTargetObj)) {
        const state = getStateFromGuards(nextTargetObj, event, currentState);
        hasGuards = true;

        if (state) {
          nextState = state.state;
          action = state.action;
        }
      }
      //
      else if (nextTargetObj.guard) {
        hasGuards = true;
        nextState = getStateFromGuard(
          nextTargetObj.guard,
          nextTargetObj.target,
          event,
          currentState,
        );
        action = nextTargetObj.action;
      }
      //
      else {
        nextState = nextTargetObj.target;
        action = nextTargetObj.action;
      }
    }

    const changed = !!(nextState && nextState !== currentState);

    let snapshot = undefined as StoreState | undefined;

    if (changed && nextState) {
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

        action?.(actionArgs);

        nextStateConfig.entry?.(actionArgs);
      });

      if (process.env.NODE_ENV === 'development' && debug) {
        console.info(
          `FSM:${debug} ${currentState} -> ${nextState} (event: ${event.type})`,
          event,
        );
      }
    } else {
      if (
        process.env.NODE_ENV === 'development' &&
        debug &&
        !nextState &&
        hasGuards
      ) {
        console.info(
          `FSM:${debug} event: ${event.type} skipped due to guards`,
          event,
        );
      }

      if (handleInvalidTransition && !nextState && !hasGuards) {
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

function typedObjEntries<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as any;
}

type MockConfig = FSMConfig<{
  states: string;
  events: { type: string };
  guards?: string;
}>;

function checkUnreachableStates(
  initial: string,
  _states: FSMConfig<any>['states'],
  _on: FSMConfig<any>['on'],
): void {
  const states = _states as MockConfig['states'];
  const on = _on as MockConfig['on'];

  function isTargetState(
    target:
      | Transitions<{
          states: string;
          events: { type: string };
          guards?: string;
        }>
      | undefined,
    state: string,
  ): boolean {
    if (Array.isArray(target)) {
      for (const guardedTarget of target) {
        if (typeof guardedTarget.target === 'string') {
          if (guardedTarget.target === state) {
            return true;
          }
        } else if (guardedTarget.target.target === state) {
          return true;
        }
      }
      return false;
    }

    if (typeof target === 'object' && target.target === state) {
      return true;
    }

    return target === state;
  }

  const unreachableStates: string[] = [];

  for (const state of Object.keys(states)) {
    const isReachable = ((): boolean => {
      if (state === initial) {
        return true;
      }

      for (const [key, stateConfig] of typedObjEntries(states)) {
        if (key === state) {
          continue;
        }

        if (stateConfig.on) {
          for (const [_, target] of typedObjEntries(stateConfig.on)) {
            if (isTargetState(target, state)) {
              return true;
            }
          }
        }
      }

      if (on) {
        for (const [_, target] of typedObjEntries(on)) {
          if (isTargetState(target, state)) {
            return true;
          }
        }
      }

      return false;
    })();

    if (!isReachable) {
      unreachableStates.push(state);
    }
  }

  if (unreachableStates.length > 0) {
    throw new Error(
      `Unreachable states detected: ${unreachableStates.join(', ')}`,
    );
  }
}
