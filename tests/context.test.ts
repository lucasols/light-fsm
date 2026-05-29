import { expect, test } from 'vitest';
import { createFSM } from '../src/main.js';

type FetchProps = {
  states:
    | 'idle' // bare string -> no context
    | { id: 'loading'; ctx: { id: string } }
    | { id: 'success'; ctx: { data: string } }
    | { id: 'failure'; ctx: { error: string } };
  events:
    | { type: 'FETCH'; id: string }
    | { type: 'RESOLVE'; data: string }
    | { type: 'REJECT'; error: string };
};

function getFetchMachine() {
  return createFSM<FetchProps>({
    initial: 'idle',
    states: {
      idle: {
        on: {
          FETCH: { target: 'loading', assign: ({ event }) => ({ id: event.id }) },
        },
      },
      loading: {
        on: {
          RESOLVE: {
            target: 'success',
            assign: ({ event }) => ({ data: event.data }),
          },
          REJECT: {
            target: 'failure',
            assign: ({ event }) => ({ error: event.error }),
          },
        },
      },
      success: { final: true },
      failure: {
        on: {
          FETCH: {
            target: 'loading',
            assign: ({ event }) => ({ id: event.id }),
          },
        },
      },
    },
  });
}

test('initial state without context has undefined context', () => {
  const machine = getFetchMachine();

  expect(machine.snapshot.current).toEqual({ id: 'idle' });
});

test('assign sets the target state context from the event', () => {
  const machine = getFetchMachine();

  machine.send({ type: 'FETCH', id: 'req-1' });

  expect(machine.snapshot.current).toEqual({ id: 'loading', ctx: { id: 'req-1' } });

  machine.send({ type: 'RESOLVE', data: 'hello' });

  expect(machine.snapshot.current).toEqual({ id: 'success', ctx: { data: 'hello' } });
});

test('context narrows on the discriminated snapshot', () => {
  const machine = getFetchMachine();

  machine.send({ type: 'FETCH', id: 'req-2' });
  machine.send({ type: 'REJECT', error: 'boom' });

  const snap = machine.snapshot;

  if (snap.current.id === 'failure') {
    expect(snap.current.ctx.error).toBe('boom');
  } else {
    throw new Error('expected failure state');
  }
});

test('context resets per state (full replace, not merge)', () => {
  const machine = getFetchMachine();

  machine.send({ type: 'FETCH', id: 'req-3' });
  expect(machine.snapshot.current).toEqual({ id: 'loading', ctx: { id: 'req-3' } });

  machine.send({ type: 'RESOLVE', data: 'done' });
  // previous { id } is gone, replaced by the success context
  expect(machine.snapshot.current).toEqual({ id: 'success', ctx: { data: 'done' } });
});

test('initialContext is used and exposed in the snapshot', () => {
  const machine = createFSM<{
    states: { id: 'a'; ctx: { n: number } } | { id: 'b'; ctx: { n: number } };
    events: { type: 'GO' };
  }>({
    initial: 'a',
    initialContext: { n: 1 },
    states: {
      a: {
        on: {
          GO: { target: 'b', assign: ({ prevContext }) => ({ n: prevContext.n + 1 }) },
        },
      },
      b: {
        on: {
          GO: { target: 'a', assign: ({ prevContext }) => ({ n: prevContext.n + 1 }) },
        },
      },
    },
  });

  expect(machine.snapshot.current).toEqual({ id: 'a', ctx: { n: 1 } });

  machine.send({ type: 'GO' });
  expect(machine.snapshot.current).toEqual({ id: 'b', ctx: { n: 2 } });

  machine.send({ type: 'GO' });
  expect(machine.snapshot.current).toEqual({ id: 'a', ctx: { n: 3 } });
});

test('entry/exit/action receive prevContext and the new context', () => {
  const seen: Record<string, unknown> = {};

  const machine = createFSM<{
    states:
      | { id: 'a'; ctx: { from: string } }
      | { id: 'b'; ctx: { to: string } };
    events: { type: 'GO' };
  }>({
    initial: 'a',
    initialContext: { from: 'start' },
    states: {
      a: {
        exit: ({ context, next }) => {
          seen.exitContext = context;
          seen.exitNext = next;
        },
        on: {
          GO: {
            target: 'b',
            assign: () => ({ to: 'b-context' }),
            action: ({ prevContext, context }) => {
              seen.actionPrevContext = prevContext;
              seen.actionContext = context;
            },
          },
        },
      },
      b: {
        entry: ({ context, prev }) => {
          seen.entryContext = context;
          seen.entryPrev = prev;
        },
      },
    },
  });

  machine.send({ type: 'GO' });

  expect(seen).toEqual({
    exitContext: { from: 'start' },
    exitNext: 'b',
    actionPrevContext: { from: 'start' },
    actionContext: { to: 'b-context' },
    entryContext: { to: 'b-context' },
    entryPrev: 'a',
  });
});

test('guarded transitions carry their own assign', () => {
  let premium = false;

  function getAuthMachine() {
    return createFSM<{
      states:
        | 'anonymous'
        | { id: 'free'; ctx: { name: string } }
        | { id: 'pro'; ctx: { name: string; tier: 'pro' } };
      events: { type: 'LOGIN'; name: string };
      guards: 'isPremium';
    }>({
      initial: 'anonymous',
      guards: { isPremium: () => premium },
      states: {
        anonymous: {
          on: {
            LOGIN: [
              {
                guard: 'isPremium',
                target: 'pro',
                assign: ({ event }) => ({ name: event.name, tier: 'pro' }),
              },
              { target: 'free', assign: ({ event }) => ({ name: event.name }) },
            ],
          },
        },
        free: {},
        pro: {},
      },
    });
  }

  const machine = getAuthMachine();

  machine.send({ type: 'LOGIN', name: 'ana' });
  expect(machine.snapshot.current).toEqual({ id: 'free', ctx: { name: 'ana' } });

  premium = true;

  const proMachine = getAuthMachine();

  proMachine.send({ type: 'LOGIN', name: 'bob' });
  expect(proMachine.snapshot.current).toEqual({
    id: 'pro',
    ctx: { name: 'bob', tier: 'pro' },
  });
});
