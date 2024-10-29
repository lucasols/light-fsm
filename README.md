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

console.log(snapshot.value); // { value: 'green', prev: undefined, done: false, lastEvent: undefined }
```

### `store`

Get the internal `t-state` store. Allowing you to subscribe to the state machine ou use it in your react application. See the [t-state documentation](https://github.com/lucasols/t-state) for more information.

```ts
const store = lightFSM.store;

store.subscribe(({ current, prev }) => {
  console.log(current, prev);
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
