# Light fsm

A lightweight finite state machine library for typescript based on t-state

# Installation

```bash
pnpm add light-fsm
```

# Usage

## Creating a machine

Use the `createFSM` function to create a new state machine.

```ts
import { createFSM } from 'light-fsm';

const lightFSM = createFSM<{
  states: 'green' | 'yellow' | 'red' | 'emergency';
  events: { type: 'TIMER_END' | 'EMERGENCY' };
}>({
  initial: 'green',
  states: {
    green: {
      on: {
        TIMER_END: 'yellow',
      },
    },
    yellow: {
      on: {
        TIMER_END: 'red',
        EMERGENCY: 'emergency',
      },
    },
    red: {
      on: {
        TIMER_END: 'green',
      },
    },
    emergency: {
      final: true,
    },
  },
});
```

## Sending events

Use the `send` method to send events to the state machine.

```ts
lightFSM.send({ type: 'TIMER_END' });
```

## Machine instance methods

### `state`

Get the current state of the state machine.

```ts
const state = lightFSM.state;

console.log(state); // 'green'
```

### `snapshot`

Get a snapshot of the state machine.

```ts
const snapshot = lightFSM.snapshot;

console.log(snapshot);
// {
//   current: { id: 'green' }, // states with context also expose `current.ctx`
//   prev: undefined,
//   done: false,
//   lastEvent: undefined,
// }
```

`current` is a discriminated object: narrowing `current.id` narrows `current.ctx`
(see [Context](#context)). The `state` getter is a shortcut for `current.id`.

### `store`

Get the internal `t-state` store. Allowing you to subscribe to the state machine ou use it in your react application. See the [t-state documentation](https://github.com/lucasols/t-state) for more information.

```ts
const store = lightFSM.store;

// note: t-state's callback `current`/`prev` are the whole snapshot before/after,
// so the matched state is `current.current` (`{ id, ctx }`)
store.subscribe(({ current, prev }) => {
  console.log(current.current.id, prev?.current.id);
});
```

## Guards

Guards are functions that can be used to determine it a transition should be allowed or not. You should use guards instead of simple conditions in order to the dev validations work.

```ts
import { createFSM } from 'light-fsm';

const lightFSM = createFSM<{
  states: 'form' | 'submitting' | 'submitted' | 'error';
  events: { type: 'SUBMIT' | 'SUBMIT_DONE' };
  guards: 'isFormValid';
}>({
  initial: 'form',
  guards: {
    isFormValid: () => checkIfFormIsValid(),
  },
  states: {
    form: {
      on: {
        SUBMIT: [
          { guard: 'isFormValid', target: 'submitting' },
          { target: 'error' },
        ],
      },
    },
    submitting: {
      on: {
        SUBMIT_DONE: 'submitted',
      },
    },
    error: {
      final: true,
    },
    submitted: {
      final: true,
    },
  },
});
```

You can also use inline guards:

```ts
const machine = createFSM<{
  states: 'A' | 'B';
  events: { type: 'NEXT' };
}>({
  initial: 'A',
  states: {
    A: {
      on: {
        NEXT: {
          guard: () => canGoToB(),
          target: 'B',
        },
      },
    },
    B: {
      final: true,
    },
  },
});
```

## Context

States can carry strongly-typed data, called _context_. Context is **tied to each
state**: declare a state as `{ id; ctx }` instead of a bare string to give it context.
The snapshot then becomes a discriminated union — narrowing `snapshot.value` narrows
`snapshot.context`.

```ts
const fetchFSM = createFSM<{
  states:
    | 'idle' // bare string -> no context
    | { id: 'loading'; ctx: { id: string } }
    | { id: 'success'; ctx: { data: string } }
    | { id: 'failure'; ctx: { error: string } };
  events:
    | { type: 'FETCH'; id: string }
    | { type: 'RESOLVE'; data: string }
    | { type: 'REJECT'; error: string };
}>({
  initial: 'idle', // no `initialContext` needed: `idle` has no context
  states: {
    idle: {
      on: {
        // transitioning into a state that has context requires `assign`,
        // which must return exactly that state's context
        FETCH: { target: 'loading', assign: ({ event }) => ({ id: event.id }) },
      },
    },
    loading: {
      on: {
        RESOLVE: { target: 'success', assign: ({ event }) => ({ data: event.data }) },
        REJECT: { target: 'failure', assign: ({ event }) => ({ error: event.error }) },
      },
    },
    success: { final: true },
    failure: {
      on: {
        FETCH: { target: 'loading', assign: ({ event }) => ({ id: event.id }) },
      },
    },
  },
});

fetchFSM.send({ type: 'FETCH', id: 'req-1' });

const snapshot = fetchFSM.snapshot;

if (snapshot.current.id === 'success') {
  // `current.ctx` is narrowed to `{ data: string }`
  console.log(snapshot.current.ctx.data);
}
```

The snapshot's `current` field holds the matched state as `{ id, ctx }` — `ctx` is
present only for states that declare context. Checking `current.id` narrows
`current.ctx`, so `value` and context stay correlated.

### `assign`

`assign` computes the **complete** context for the target state from the triggering
event and the previous state's context. Context is owned per-state, so it is fully
replaced on each transition (it is not merged).

```ts
assign: ({ event, prev, prevContext }) => ({ id: event.id });
```

- `event` — the event that triggered the transition, narrowed to the matching event type
- `prev` — the state being left
- `prevContext` — the context of the state being left

`assign` is **required** when the target state declares context and **disallowed**
otherwise. States without context can still be targeted with a bare string (e.g.
`TIMER_END: 'yellow'`).

### `initialContext`

When the initial state declares context, you must provide `initialContext`, typed to
that exact state's context:

```ts
const counter = createFSM<{
  states:
    | { id: 'active'; ctx: { count: number } }
    | { id: 'paused'; ctx: { count: number } };
  events: { type: 'TOGGLE' };
}>({
  initial: 'active',
  initialContext: { count: 0 },
  states: {
    active: {
      on: { TOGGLE: { target: 'paused', assign: ({ prevContext }) => prevContext } },
    },
    paused: {
      on: { TOGGLE: { target: 'active', assign: ({ prevContext }) => prevContext } },
    },
  },
});
```

### Context in `entry` / `exit` / `action`

The `entry`, `exit`, and transition `action` callbacks receive the relevant context:

- `entry` receives `context` — the new state's context
- `exit` receives `context` — the context of the state being left
- `action` receives both `prevContext` and `context` (the new context)
