import { expect, test } from 'vitest';

import { sleep } from '@ls-stack/utils/sleep';

import { type FSMConfig, createFSM } from '../src/main.js';

type LightStates = 'green' | 'yellow' | 'red' | 'emergency';
type LightEvents = { type: 'TIMER_END' | 'EMERGENCY' };

const lightFSMConfig: FSMConfig<{ states: LightStates; events: LightEvents }> =
  {
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
      emergency: {},
    },
  };

test('initial state should be set correctly', () => {
  const lightState = createFSM(lightFSMConfig);

  expect(lightState.snapshot).toMatchInlineSnapshot(`
    {
      "done": false,
      "lastEvent": undefined,
      "prev": undefined,
      "value": "green",
    }
  `);
});

test('should transition correctly', () => {
  const lightState = createFSM(lightFSMConfig);

  expect(lightState.state).toEqual('green');

  lightState.send({ type: 'TIMER_END' });

  expect(lightState.state).toEqual('yellow');

  lightState.send({ type: 'TIMER_END' });

  expect(lightState.state).toEqual('red');

  lightState.send({ type: 'TIMER_END' });

  expect(lightState.state).toEqual('green');

  expect(lightState.snapshot).toMatchInlineSnapshot(`
    {
      "done": false,
      "lastEvent": {
        "type": "TIMER_END",
      },
      "prev": "red",
      "value": "green",
    }
  `);
});

test('should stay on the same state for undefined transitions', () => {
  let err: Error | undefined;

  const lightState = createFSM<{ states: LightStates; events: LightEvents }>({
    ...lightFSMConfig,
    handleInvalidTransition: (error) => {
      err = error;
    },
  });

  lightState.send({ type: 'FAKE' as LightEvents['type'] });

  expect(lightState.state).toBe('green');

  expect(err).toMatchInlineSnapshot(
    `[Error: Event 'FAKE' not allowed in state 'green']`,
  );
});

test('end state should not transition', () => {
  const lightState = createFSM(lightFSMConfig);

  lightState.send({ type: 'TIMER_END' });

  lightState.send({ type: 'EMERGENCY' });

  expect(lightState.state).toBe('emergency');

  const result = lightState.send({ type: 'TIMER_END' });

  expect(lightState.state).toBe('emergency');

  expect(result).toMatchInlineSnapshot(`
    {
      "changed": false,
      "snapshot": {
        "done": false,
        "lastEvent": {
          "type": "EMERGENCY",
        },
        "prev": "yellow",
        "value": "emergency",
      },
    }
  `);
});

test('state independent transitions', () => {
  const feedbackMachine = createFSM<{
    states: 'prompt' | 'thanks' | 'closed';
    events: { type: 'CLICK' | 'CLOSE' };
  }>({
    initial: 'prompt',
    states: {
      prompt: {
        on: {
          CLICK: 'thanks',
        },
      },
      thanks: {},
      closed: {},
    },
    on: {
      CLOSE: 'closed',
    },
  });

  expect(feedbackMachine.state).toBe('prompt');

  feedbackMachine.send({ type: 'CLICK' });

  expect(feedbackMachine.state).toBe('thanks');

  feedbackMachine.send({ type: 'CLOSE' });

  expect(feedbackMachine.state).toBe('closed');
});

test('final states', () => {
  let err: Error | undefined;

  const feedbackMachine = createFSM<{
    states: 'prompt' | 'thanks' | 'closed';
    events: { type: 'CLICK' | 'CLOSE' | 'RESET' };
  }>({
    initial: 'prompt',
    states: {
      prompt: {
        on: {
          CLICK: 'thanks',
        },
      },
      thanks: {},
      closed: {
        final: true,
      },
    },
    on: {
      CLOSE: 'closed',
      RESET: 'prompt',
    },
    handleInvalidTransition: (error) => {
      err = error;
    },
  });

  feedbackMachine.send({ type: 'CLOSE' });

  expect(feedbackMachine.state).toBe('closed');

  const result = feedbackMachine.send({ type: 'RESET' });

  expect(result.changed).toBe(false);

  expect(feedbackMachine.state).toBe('closed');

  expect(err).toMatchInlineSnapshot(
    `[Error: Cannot transition from final state 'closed']`,
  );
});

test('should execute event actions', () => {
  let executed = false;

  const toogleMachine = createFSM<{
    states: 'active' | 'inactive';
    events: { type: 'TOGGLE' };
  }>({
    initial: 'active',
    states: {
      active: {
        on: {
          TOGGLE: {
            target: 'inactive',
            action: () => {
              executed = true;
            },
          },
        },
      },
      inactive: {},
    },
  });

  toogleMachine.send({ type: 'TOGGLE' });

  expect(toogleMachine.state).toBe('inactive');

  expect(executed).toBe(true);
});

test('should execute actions on state independent transitions', () => {
  let executed = false;

  const feedbackMachine = createFSM<{
    states: 'prompt' | 'thanks' | 'closed';
    events: { type: 'CLICK' | 'CLOSE' | 'RESET' };
  }>({
    initial: 'prompt',
    states: {
      prompt: {
        on: {
          CLICK: 'thanks',
        },
      },
      thanks: {},
      closed: {
        final: true,
      },
    },
    on: {
      CLOSE: {
        target: 'closed',
        action: () => {
          executed = true;
        },
      },
    },
  });

  feedbackMachine.send({ type: 'CLOSE' });

  expect(executed).toBe(true);
});

test('should execute initial entry action', () => {
  let executed = false;

  createFSM<{
    states: 'foo';
    events: never;
  }>({
    initial: 'foo',
    states: {
      foo: {
        entry: ({ prev }) => {
          executed = true;

          expect(prev).toBe(undefined);
        },
      },
    },
  });

  expect(executed).toBe(true);
});

test('should execute entry actions on transitions', () => {
  let bExecuted = false;
  let cExecuted = false;

  const machine = createFSM<{
    states: 'a' | 'b' | 'c';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        on: {
          NEXT: 'b',
        },
      },
      b: {
        entry: ({ next, prev }) => {
          bExecuted = true;

          expect(prev).toBe('a');
          expect(next).toBe('b');
        },
        on: {
          NEXT: 'c',
        },
      },
      c: {
        entry: ({ next, prev }) => {
          cExecuted = true;

          expect(prev).toBe('b');
          expect(next).toBe('c');
        },
        on: {
          NEXT: 'a',
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(bExecuted).toBe(true);
  expect(machine.state).toBe('b');

  machine.send({ type: 'NEXT' });

  expect(cExecuted).toBe(true);
  expect(machine.state).toBe('c');
});

test('should execute exit actions on transitions', () => {
  let aExited = false;
  let bExited = false;

  const machine = createFSM<{
    states: 'a' | 'b';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        exit: ({ prev, next }) => {
          aExited = true;

          expect(prev).toBe('a');
          expect(next).toBe('b');
        },
        on: {
          NEXT: 'b',
        },
      },
      b: {
        on: {
          NEXT: 'a',
        },
        exit: ({ prev, next }) => {
          bExited = true;

          expect(prev).toBe('b');
          expect(next).toBe('a');
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(aExited).toBe(true);
  expect(machine.state).toBe('b');

  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('a');
  expect(bExited).toBe(true);
});

test('actions should be run in exit, transition actions, entry order', () => {
  const actionsHistory: string[] = [];

  const machine = createFSM<{
    states: 'a' | 'b';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        exit: () => {
          actionsHistory.push('exit a');
        },
        on: {
          NEXT: {
            target: 'b',
            action: () => {
              actionsHistory.push('transition a -> b');
            },
          },
        },
      },
      b: {
        entry: () => {
          actionsHistory.push('entry b');
        },
        on: {
          NEXT: 'a',
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(actionsHistory).toEqual(['exit a', 'transition a -> b', 'entry b']);
});

test('send back events on transition actions', async () => {
  const eventsHistory: string[] = [];

  const machine = createFSM<{
    states: 'a' | 'b';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        on: {
          NEXT: {
            target: 'b',
            action: async ({ next, prev }) => {
              eventsHistory.push(`${prev} -> ${next}`);

              await sleep(10);

              eventsHistory.push('sendBack NEXT');

              machine.send({ type: 'NEXT' });
            },
          },
        },
      },
      b: {
        on: {
          NEXT: {
            target: 'a',
          },
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('b');

  expect(eventsHistory).toMatchInlineSnapshot(`
    [
      "a -> b",
    ]
  `);

  await sleep(15);

  expect(machine.state).toBe('a');

  expect(eventsHistory).toMatchInlineSnapshot(`
    [
      "a -> b",
      "sendBack NEXT",
    ]
  `);
});

test('self transitions', () => {
  const machine = createFSM<{
    states: 'a';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        on: {
          NEXT: 'a',
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('a');
});

test('self transitions should not execute actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        exit: () => {
          executed = true;
        },
        on: {
          NEXT: {
            target: 'a',
            action: () => {
              executed = true;
            },
          },
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(executed).toBe(false);
});

test('send back events on initial sync entry actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a' | 'b';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        entry: ({ send }) => {
          send({ type: 'NEXT' });
          executed = true;
        },
        on: {
          NEXT: 'b',
        },
      },
      b: {
        on: {
          NEXT: 'a',
        },
      },
    },
  });

  let subscriberCalled = false;

  machine.store.subscribe(() => {
    subscriberCalled = true;
  });

  expect(machine.state).toBe('b');

  expect(executed).toBe(true);

  expect(subscriberCalled).toBe(false);
});

test('send back events on sync entry actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a' | 'b';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        on: {
          NEXT: 'b',
        },
      },
      b: {
        entry: ({ send }) => {
          send({ type: 'NEXT' });
          executed = true;
        },
        on: {
          NEXT: 'a',
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('a');

  expect(executed).toBe(true);
});

test('send back events on sync transition actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a' | 'b';
    events: { type: 'NEXT' };
  }>({
    initial: 'a',
    states: {
      a: {
        on: {
          NEXT: {
            target: 'b',
            action: ({ send }) => {
              send({ type: 'NEXT' });
              executed = true;
            },
          },
        },
      },
      b: {
        on: {
          NEXT: 'a',
        },
      },
    },
  });

  const result = machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('a');

  expect(executed).toBe(true);

  expect(result.snapshot).toMatchInlineSnapshot(`
    {
      "done": false,
      "lastEvent": {
        "type": "NEXT",
      },
      "prev": "a",
      "value": "b",
    }
  `);
});

test('return last sent event', () => {
  const machine = createFSM<{
    states: 'a' | 'b';
    events: { type: 'GO_TO_A' | 'GO_TO_B' };
  }>({
    initial: 'a',
    states: {
      a: {
        on: {
          GO_TO_B: 'b',
        },
      },
      b: {
        on: {
          GO_TO_A: 'a',
        },
      },
    },
  });

  machine.send({ type: 'GO_TO_B' });

  expect(machine.snapshot.lastEvent).toStrictEqual({ type: 'GO_TO_B' });

  machine.send({ type: 'GO_TO_A' });

  expect(machine.snapshot.lastEvent).toStrictEqual({ type: 'GO_TO_A' });
});

test('entry/exit actions should receive the event that caused the transition', () => {
  let entryEvent: string | undefined;
  let exitEvent: string | undefined;

  const machine = createFSM<{
    states: 'idle' | 'a' | 'b';
    events: { type: 'GO_TO_A' | 'GO_TO_B' };
  }>({
    initial: 'idle',
    states: {
      idle: {
        on: {
          GO_TO_A: 'a',
        },
      },
      a: {
        on: {
          GO_TO_B: 'b',
        },
        entry: ({ event }) => {
          entryEvent = event?.type;
        },
        exit: ({ event }) => {
          exitEvent = event?.type;
        },
      },
      b: {},
    },
  });

  machine.send({ type: 'GO_TO_A' });

  expect(entryEvent).toBe('GO_TO_A');
  expect(exitEvent).toBe(undefined);

  machine.send({ type: 'GO_TO_B' });

  expect(exitEvent).toBe('GO_TO_B');
});

test('events with payload', () => {
  const machine = createFSM<{
    states: 'idle' | 'a' | 'b';
    events:
      | { type: 'GO_TO_A'; payload: number }
      | { type: 'GO_TO_B'; payload: string };
  }>({
    initial: 'idle',
    states: {
      idle: {
        on: {
          GO_TO_A: 'a',
        },
      },
      a: {
        entry: ({ event }) => {
          expect(event?.payload).toBe(1);
        },
        on: {
          GO_TO_B: 'b',
        },
      },
      b: {
        entry: ({ event }) => {
          expect(event?.payload).toBe('hello');
        },
      },
    },
  });

  machine.send({ type: 'GO_TO_A', payload: 1 });

  expect(machine.snapshot.lastEvent).toMatchInlineSnapshot(`
    {
      "payload": 1,
      "type": "GO_TO_A",
    }
  `);

  machine.send({ type: 'GO_TO_B', payload: 'hello' });

  expect(machine.snapshot.lastEvent).toMatchInlineSnapshot(`
    {
      "payload": "hello",
      "type": "GO_TO_B",
    }
  `);
});

test('detect unreachable states', () => {
  expect(() => {
    createFSM<{
      states: 'a' | 'b';
      events: { type: 'NEXT' };
    }>({
      initial: 'a',
      states: {
        a: {
          on: {
            NEXT: 'a',
          },
        },
        b: {},
      },
    });
  }).toThrowErrorMatchingInlineSnapshot(
    `[Error: Unreachable states detected: b]`,
  );

  expect(() => {
    createFSM<{
      states: 'a' | 'b' | 'c';
      events: { type: 'NEXT' };
    }>({
      initial: 'a',
      states: {
        a: {
          on: {
            NEXT: 'a',
          },
        },
        b: {
          on: {
            NEXT: 'b',
          },
        },
        c: {
          on: {
            NEXT: 'c',
          },
        },
      },
    });
  }).toThrowErrorMatchingInlineSnapshot(
    `[Error: Unreachable states detected: b, c]`,
  );
});

test('not throw on unreachable state error', () => {
  expect(() => {
    createFSM<{
      states: 'a' | 'b';
      events: { type: 'NEXT' | 'GO_TO_B' };
    }>({
      initial: 'a',
      states: {
        a: {
          on: {
            NEXT: 'a',
          },
        },
        b: {},
      },
      on: {
        GO_TO_B: 'b',
      },
    });
  }).not.toThrow();
});
