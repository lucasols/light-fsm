import { expect, test } from 'vitest';

import { sleep } from '@lucasols/utils/sleep';

import { FSMConfig, createFSM } from '../src/main.js';

type LightStates = 'green' | 'yellow' | 'red' | 'emergency';
type LightEvents = 'TIMER_END' | 'EMERGENCY';

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
      "prev": undefined,
      "value": "green",
    }
  `);
});

test('should transition correctly', () => {
  const lightState = createFSM(lightFSMConfig);

  expect(lightState.state).toEqual('green');

  lightState.send('TIMER_END');

  expect(lightState.state).toEqual('yellow');

  lightState.send('TIMER_END');

  expect(lightState.state).toEqual('red');

  lightState.send('TIMER_END');

  expect(lightState.state).toEqual('green');

  expect(lightState.snapshot).toMatchInlineSnapshot(`
    {
      "done": false,
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

  lightState.send('FAKE' as LightEvents);

  expect(lightState.state).toBe('green');

  expect(err).toMatchInlineSnapshot(
    `[Error: Event 'FAKE' not allowed in state 'green']`,
  );
});

test('end state should not transition', () => {
  const lightState = createFSM(lightFSMConfig);

  lightState.send('TIMER_END');

  lightState.send('EMERGENCY');

  expect(lightState.state).toBe('emergency');

  const result = lightState.send('TIMER_END');

  expect(lightState.state).toBe('emergency');

  expect(result).toMatchInlineSnapshot(`
    {
      "changed": false,
      "snapshot": {
        "done": false,
        "prev": "yellow",
        "value": "emergency",
      },
    }
  `);
});

test('state independent transitions', () => {
  const feedbackMachine = createFSM<{
    states: 'prompt' | 'thanks' | 'closed';
    events: 'CLICK' | 'CLOSE';
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

  feedbackMachine.send('CLICK');

  expect(feedbackMachine.state).toBe('thanks');

  feedbackMachine.send('CLOSE');

  expect(feedbackMachine.state).toBe('closed');
});

test('final states', () => {
  let err: Error | undefined;

  const feedbackMachine = createFSM<{
    states: 'prompt' | 'thanks' | 'closed';
    events: 'CLICK' | 'CLOSE' | 'RESET';
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

  feedbackMachine.send('CLOSE');

  expect(feedbackMachine.state).toBe('closed');

  const result = feedbackMachine.send('RESET');

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
    events: 'TOGGLE';
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

  toogleMachine.send('TOGGLE');

  expect(toogleMachine.state).toBe('inactive');

  expect(executed).toBe(true);
});

test('should execute actions on state independent transitions', () => {
  let executed = false;

  const feedbackMachine = createFSM<{
    states: 'prompt' | 'thanks' | 'closed';
    events: 'CLICK' | 'CLOSE' | 'RESET';
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

  feedbackMachine.send('CLOSE');

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
    events: 'NEXT';
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

  machine.send('NEXT');

  expect(bExecuted).toBe(true);
  expect(machine.state).toBe('b');

  machine.send('NEXT');

  expect(cExecuted).toBe(true);
  expect(machine.state).toBe('c');
});

test('should execute exit actions on transitions', () => {
  let aExited = false;
  let bExited = false;

  const machine = createFSM<{
    states: 'a' | 'b' | 'c';
    events: 'NEXT';
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
      c: {},
    },
  });

  machine.send('NEXT');

  expect(aExited).toBe(true);
  expect(machine.state).toBe('b');

  machine.send('NEXT');

  expect(machine.state).toBe('a');
  expect(bExited).toBe(true);
});

test('actions should be run in exit, transition actions, entry order', () => {
  const actionsHistory: string[] = [];

  const machine = createFSM<{
    states: 'a' | 'b' | 'c';
    events: 'NEXT';
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
      c: {},
    },
  });

  machine.send('NEXT');

  expect(actionsHistory).toEqual(['exit a', 'transition a -> b', 'entry b']);
});

test('send back events on transition actions', async () => {
  const eventsHistory: string[] = [];

  const machine = createFSM<{
    states: 'a' | 'b';
    events: 'NEXT';
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

              machine.send('NEXT');
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

  machine.send('NEXT');

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
    events: 'NEXT';
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

  machine.send('NEXT');

  expect(machine.state).toBe('a');
});

test('self transitions should not execute actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a';
    events: 'NEXT';
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

  machine.send('NEXT');

  expect(executed).toBe(false);
});

test('send back events on initial sync entry actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a' | 'b';
    events: 'NEXT';
  }>({
    initial: 'a',
    states: {
      a: {
        entry: ({ send }) => {
          send('NEXT');
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
  })

  expect(machine.state).toBe('b');

  expect(executed).toBe(true);

  expect(subscriberCalled).toBe(false);
});

test('send back events on sync entry actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a' | 'b';
    events: 'NEXT';
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
          send('NEXT');
          executed = true;
        },
        on: {
          NEXT: 'a',
        },
      },
    },
  });

  machine.send('NEXT');

  expect(machine.state).toBe('a');

  expect(executed).toBe(true);
});

test('send back events on sync transition actions', () => {
  let executed = false;

  const machine = createFSM<{
    states: 'a' | 'b';
    events: 'NEXT';
  }>({
    initial: 'a',
    states: {
      a: {
        on: {
          NEXT: {
            target: 'b',
            action: ({ send }) => {
              send('NEXT');
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

  const result = machine.send('NEXT');

  expect(machine.state).toBe('a');

  expect(executed).toBe(true);

  expect(result.snapshot).toMatchInlineSnapshot(`
    {
      "done": false,
      "prev": "a",
      "value": "b",
    }
  `);
});
