import { Store } from 't-state';

/**
 * A state is declared either as a bare name (no context) or as an object
 * pairing the state `id` with its `ctx` shape.
 */
type StateDecl = string | { id: string; ctx?: unknown };

type FSMProps = {
  states: StateDecl;
  events: { type: string };
  guards?: string;
};

/** The union of state names, extracted from bare strings and `{ id }` objects. */
type StateNameOf<S> =
  S extends string ? S
  : S extends { id: infer Id extends string } ? Id
  : never;

type StateName<P extends FSMProps> = StateNameOf<P['states']>;

/** Context for a single state — `undefined` when that state declares none. */
type ContextOf<P extends FSMProps, S extends StateName<P>> =
  [Extract<P['states'], { id: S }>] extends [never] ? undefined
  : Extract<P['states'], { id: S }> extends { ctx: infer C } ? C
  : undefined;

type HasContext<P extends FSMProps> =
  [Extract<P['states'], { ctx: unknown }>] extends [never] ? false : true;

/** States that declare no context — the only ones allowed as a bare-string target. */
type StatelessStates<P extends FSMProps> = {
  [S in StateName<P>]: ContextOf<P, S> extends undefined ? S : never;
}[StateName<P>];

/**
 * Narrows the event union to the matching `type`. Falls back to the full union
 * for events declared as a single object with a union `type` field
 * (e.g. `{ type: 'A' | 'B' }`), where narrowing is not possible.
 */
type EventFor<P extends FSMProps, E extends P['events']['type']> =
  Extract<P['events'], { type: E }> extends never ? P['events']
  : Extract<P['events'], { type: E }>;

type SendFn<P extends FSMProps> = (event: P['events']) => { changed: boolean };

type AssignArgs<P extends FSMProps, From extends StateName<P>, Ev> = {
  event: Ev;
  prev: From;
  prevContext: ContextOf<P, From>;
};

type TransitionActionArgs<
  P extends FSMProps,
  From extends StateName<P>,
  To extends StateName<P>,
  Ev,
> = {
  prev: From;
  next: To;
  prevContext: ContextOf<P, From>;
  context: ContextOf<P, To>;
  event: Ev;
  send: SendFn<P>;
};

export type GuardFn<P extends FSMProps> = (args: {
  current: StateName<P>;
  prev: StateName<P>;
  event: P['events'];
}) => boolean;

/** `assign` is required iff the target state declares context, forbidden otherwise. */
type AssignField<
  P extends FSMProps,
  From extends StateName<P>,
  To extends StateName<P>,
  Ev,
> =
  ContextOf<P, To> extends undefined ?
    { assign?: undefined }
  : { assign: (args: AssignArgs<P, From, Ev>) => ContextOf<P, To> };

type TargetObj<
  P extends FSMProps,
  From extends StateName<P>,
  To extends StateName<P>,
  Ev,
> = {
  target: To;
  guard?: P['guards'] | GuardFn<P>;
  action?: (args: TransitionActionArgs<P, From, To, Ev>) => void;
} & AssignField<P, From, To, Ev>;

/** Distribute over every possible target so `assign`/`action` are pinned to `target`. */
type AnyTargetObj<P extends FSMProps, From extends StateName<P>, Ev> = {
  [To in StateName<P>]: TargetObj<P, From, To, Ev>;
}[StateName<P>];

type Transitions<P extends FSMProps, From extends StateName<P>, Ev> =
  | StatelessStates<P>
  | AnyTargetObj<P, From, Ev>
  | AnyTargetObj<P, From, Ev>[];

type EntryArgs<P extends FSMProps, K extends StateName<P>> = {
  prev: StateName<P> | undefined;
  next: K;
  context: ContextOf<P, K>;
  event: P['events'] | undefined;
  send: SendFn<P>;
};

type ExitArgs<P extends FSMProps, K extends StateName<P>> = {
  prev: K;
  next: StateName<P>;
  context: ContextOf<P, K>;
  event: P['events'] | undefined;
  send: SendFn<P>;
};

type StateConfig<P extends FSMProps, K extends StateName<P>> = {
  on?: { [E in P['events']['type']]?: Transitions<P, K, EventFor<P, E>> };
  final?: boolean;
  entry?: (args: EntryArgs<P, K>) => void;
  exit?: (args: ExitArgs<P, K>) => void;
};

/** `initialContext` is required iff the initial state declares context. */
type InitialContextField<P extends FSMProps, Init extends StateName<P>> =
  ContextOf<P, Init> extends undefined ?
    { initialContext?: undefined }
  : { initialContext: ContextOf<P, Init> };

/**
 * For machines that declare context, distributes `initial` + `initialContext`
 * over each state so the provided `initial` literal pins `initialContext` to
 * exactly that state's context. For context-less machines it collapses to a
 * flat shape.
 */
type InitialField<P extends FSMProps> =
  HasContext<P> extends true ?
    {
      [Init in StateName<P>]: { initial: Init } & InitialContextField<P, Init>;
    }[StateName<P>]
  : { initial: StateName<P>; initialContext?: undefined };

type GuardsConfig<P extends FSMProps> =
  P['guards'] extends string ?
    { guards: { [K in P['guards']]: boolean | (() => boolean) } }
  : { guards?: undefined };

export type FSMConfig<P extends FSMProps> = {
  states: { [K in StateName<P>]: StateConfig<P, K> };
  /** state independent transitions */
  on?: {
    [E in P['events']['type']]?: Transitions<P, StateName<P>, EventFor<P, E>>;
  };
  handleInvalidTransition?: (
    error: Error,
    state: { state: StateName<P>; event: P['events'] },
  ) => void;
  debug?: string;
} & InitialField<P> &
  GuardsConfig<P>;

/**
 * The matched state paired with its context. `ctx` is present only for states
 * that declare context, so narrowing `current.id` narrows `current.ctx`.
 */
type StateValue<P extends FSMProps, S extends StateName<P>> =
  ContextOf<P, S> extends undefined ?
    { id: S }
  : { id: S; ctx: ContextOf<P, S> };

type Snapshot<P extends FSMProps> = {
  [S in StateName<P>]: {
    current: StateValue<P, S>;
    prev: StateName<P> | undefined;
    done: boolean;
    lastEvent: P['events'] | undefined;
  };
}[StateName<P>];

/** Internal store shape. Bridged to the discriminated `Snapshot` at the boundary. */
type InternalState<P extends FSMProps> = {
  current: { id: StateName<P>; ctx?: unknown };
  prev: StateName<P> | undefined;
  done: boolean;
  lastEvent: P['events'] | undefined;
};

type FSM<P extends FSMProps> = {
  state: StateName<P>;
  snapshot: Snapshot<P>;
  send: (event: P['events']) => {
    changed: boolean;
    snapshot: Snapshot<P>;
  };
  store: Store<Snapshot<P>>;
};

export function createFSM<Props extends FSMProps>(
  config: FSMConfig<Props>,
): FSM<Props> {
  type Events = Props['events'];
  type AnyState = StateName<Props>;

  // Runtime-only loose views over the strongly-typed config. The public types
  // pin context/event per state; the runtime treats them uniformly, reusing the
  // public arg shapes with the per-state generics widened to the full union.
  type RuntimeTarget = {
    target: AnyState;
    guard?: Props['guards'] | GuardFn<Props>;
    action?: (
      args: TransitionActionArgs<Props, AnyState, AnyState, Events>,
    ) => void;
    assign?: (args: AssignArgs<Props, AnyState, Events>) => unknown;
  };
  type RuntimeTransitions = AnyState | RuntimeTarget | RuntimeTarget[];
  type RuntimeStateConfig = {
    on?: Record<string, RuntimeTransitions | undefined>;
    final?: boolean;
    entry?: (args: EntryArgs<Props, AnyState>) => void;
    exit?: (args: ExitArgs<Props, AnyState>) => void;
  };

  const { initial, initialContext, on, handleInvalidTransition, debug, guards } =
    config;

  const states = config.states as unknown as Record<
    StateName<Props>,
    RuntimeStateConfig
  >;
  const stateIndependentOn = on as
    | Record<string, RuntimeTransitions | undefined>
    | undefined;
  const guardsMap = guards as
    | Record<string, boolean | (() => boolean)>
    | undefined;

  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
    checkUnreachableStates(initial, config.states, on);

  function makeCurrent(
    id: StateName<Props>,
    ctx: unknown,
  ): InternalState<Props>['current'] {
    return ctx === undefined ? { id } : { id, ctx };
  }

  const store = new Store<InternalState<Props>>({
    state: {
      current: makeCurrent(initial, initialContext),
      prev: undefined,
      done: false,
      lastEvent: undefined,
    },
  });

  function toSnapshot(state: InternalState<Props>): Snapshot<Props> {
    return state as unknown as Snapshot<Props>;
  }

  const initialStateConfig = states[initial];

  if (initialStateConfig.entry) {
    initialStateConfig.entry({
      next: initial,
      prev: undefined,
      context: initialContext as ContextOf<Props, StateName<Props>>,
      send,
      event: undefined,
    });
  }

  function resolveGuard(
    guard: Props['guards'] | GuardFn<Props> | undefined,
    event: Events,
  ): boolean {
    if (guard === undefined) return true;

    if (typeof guard === 'function') {
      return guard({
        current: store.state.current.id,
        prev: store.state.current.id,
        event,
      });
    }

    const guardResultOrFn = guardsMap?.[guard];

    if (guardResultOrFn === undefined) {
      throw new Error(`Guard '${guard}' not found`);
    }

    return typeof guardResultOrFn === 'boolean' ?
        guardResultOrFn
      : guardResultOrFn();
  }

  function resolveTarget(
    target: RuntimeTransitions,
    event: Events,
  ): {
    state: StateName<Props>;
    action?: RuntimeTarget['action'];
    assign?: RuntimeTarget['assign'];
  } | null {
    if (typeof target === 'string') {
      return { state: target };
    }

    if (Array.isArray(target)) {
      for (const guardedTarget of target) {
        if (resolveGuard(guardedTarget.guard, event)) {
          return {
            state: guardedTarget.target,
            action: guardedTarget.action,
            assign: guardedTarget.assign,
          };
        }
      }

      return null;
    }

    if (!resolveGuard(target.guard, event)) {
      return null;
    }

    return { state: target.target, action: target.action, assign: target.assign };
  }

  function send(event: Props['events']): {
    changed: boolean;
    snapshot: Snapshot<Props>;
  } {
    const currentState = store.state.current.id;
    const prevContext = store.state.current.ctx;

    const currentStateConfig = states[currentState];

    if (currentStateConfig.final) {
      handleInvalidTransition?.(
        new Error(`Cannot transition from final state '${currentState}'`),
        { state: currentState, event },
      );

      return {
        changed: false,
        snapshot: toSnapshot(store.state),
      };
    }

    const eventType = event.type as Props['events']['type'];

    const nextTargetObj =
      currentStateConfig.on?.[eventType] || stateIndependentOn?.[eventType];

    const resolved =
      nextTargetObj !== undefined ?
        resolveTarget(nextTargetObj, event)
      : null;

    const nextState = resolved?.state ?? null;
    const action = resolved?.action;
    const assign = resolved?.assign;
    const hasGuards = nextTargetObj !== undefined && resolved === null;

    const changed = !!(nextState && nextState !== currentState);

    let snapshot = undefined as InternalState<Props> | undefined;

    if (changed && nextState) {
      const nextStateConfig = states[nextState];

      const prevCtx = prevContext as ContextOf<Props, StateName<Props>>;

      const nextContext = assign ?
        assign({ event, prev: currentState, prevContext: prevCtx })
      : undefined;

      const nextCtx = nextContext as ContextOf<Props, StateName<Props>>;

      const baseArgs = { prev: currentState, next: nextState, event, send };

      store.batch(() => {
        store.setState({
          current: makeCurrent(nextState, nextContext),
          prev: currentState,
          done: Boolean(nextStateConfig.final),
          lastEvent: event,
        });

        snapshot = store.state;

        currentStateConfig.exit?.({ ...baseArgs, context: prevCtx });

        action?.({ ...baseArgs, prevContext: prevCtx, context: nextCtx });

        nextStateConfig.entry?.({ ...baseArgs, context: nextCtx });
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
      snapshot: toSnapshot(snapshot ?? store.state),
    };
  }

  return {
    get state() {
      return store.state.current.id;
    },
    get snapshot() {
      return toSnapshot(store.state);
    },
    send,
    store: store as unknown as Store<Snapshot<Props>>,
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
  _states: unknown,
  _on: unknown,
): void {
  const states = _states as MockConfig['states'];
  const on = _on as MockConfig['on'];

  function isTargetState(
    target:
      | Transitions<
          { states: string; events: { type: string }; guards?: string },
          string,
          { type: string }
        >
      | undefined,
    state: string,
  ): boolean {
    if (Array.isArray(target)) {
      for (const guardedTarget of target) {
        if (guardedTarget.target === state) {
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
