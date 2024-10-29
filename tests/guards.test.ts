import { expect, test } from 'vitest';
import { createFSM } from '../src/main.js';

function getMachine(isDesktopApp: boolean) {
  return createFSM<{
    states: 'loggedOut' | 'loggedIn' | 'loggedOutInDesktopApp';
    events: { type: 'LOGIN' | 'LOGOUT' };
    guards: 'isDesktopApp';
  }>({
    initial: 'loggedOut',
    guards: {
      isDesktopApp,
    },
    states: {
      loggedOut: {
        on: {
          LOGIN: 'loggedIn',
        },
      },
      loggedIn: {
        on: {
          LOGOUT: [
            { guard: 'isDesktopApp', target: 'loggedOutInDesktopApp' },
            { target: 'loggedOut' },
          ],
        },
      },
      loggedOutInDesktopApp: {
        final: true,
      },
    },
  });
}

test('conditions and guards', () => {
  const machine = getMachine(true);

  machine.send({ type: 'LOGIN' });

  expect(machine.state).toBe('loggedIn');

  machine.send({ type: 'LOGOUT' });

  expect(machine.state).toBe('loggedOutInDesktopApp');
});

test('fallback guard target', () => {
  const machine = getMachine(false);

  machine.send({ type: 'LOGIN' });

  expect(machine.state).toBe('loggedIn');

  machine.send({ type: 'LOGOUT' });

  expect(machine.state).toBe('loggedOut');
});

test('guard with not fallback target', () => {
  let allowGoToB = false;

  const machine = createFSM<{
    states: 'A' | 'B' | 'C';
    events: { type: 'NEXT' };
    guards: 'shouldGoToB';
  }>({
    initial: 'A',
    guards: {
      shouldGoToB: () => allowGoToB,
    },
    states: {
      A: {
        on: {
          NEXT: {
            guard: 'shouldGoToB',
            target: 'B',
          },
        },
      },
      B: {
        on: {
          NEXT: 'C',
        },
      },
      C: {
        on: {
          NEXT: 'A',
        },
      },
    },
  });

  machine.send({ type: 'NEXT' });
  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('A');

  allowGoToB = true;

  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('B');
});

test('inline guards', () => {
  let canGoToB = false;

  const machine = createFSM<{
    states: 'A' | 'B';
    events: { type: 'NEXT' };
  }>({
    initial: 'A',
    states: {
      A: {
        on: {
          NEXT: {
            guard: () => canGoToB,
            target: 'B',
          },
        },
      },
      B: {
        final: true,
      },
    },
  });

  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('A');

  canGoToB = true;

  machine.send({ type: 'NEXT' });

  expect(machine.state).toBe('B');
});

test('guards on state independent transitions', () => {
  let canClose = false;

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
        guard: () => canClose,
      },
    },
  });

  feedbackMachine.send({ type: 'CLOSE' });

  expect(feedbackMachine.state).toBe('prompt');

  canClose = true;

  feedbackMachine.send({ type: 'CLOSE' });

  expect(feedbackMachine.state).toBe('closed');
});
