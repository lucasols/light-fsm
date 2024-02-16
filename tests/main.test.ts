import { describe, test, expect } from 'vitest';

import { createFSM } from '../src/main.js';

describe('interpreter', () => {
  type States = 'active' | 'inactive';

  const toggleMachine = createFSM<States>({
    initial: 'active',
    states: {
      active: {
        on: { TOGGLE: 'inactive' },
      },
      inactive: {},
    },
  });

  test('initial state is set correctly', () => {
    const toggleService = toggleMachine.interpret();

    expect(toggleService.state).toBe('active');
  });

  test('listeners should subscribe to state changes', (done) => {
    const toggleService = interpret(toggleMachine).start();

    toggleService.subscribe((state) => {
      if (state.matches('inactive')) {
        done();
      }
    });

    toggleService.send('TOGGLE');
  });

  test('should execute actions', (done) => {
    let executed = false;

    const actionMachine = createMachine({
      initial: 'active',
      states: {
        active: {
          on: {
            TOGGLE: {
              target: 'inactive',
              actions: () => {
                executed = true;
              },
            },
          },
        },
        inactive: {},
      },
    });

    const actionService = interpret(actionMachine).start();

    actionService.subscribe(() => {
      if (executed) {
        done();
      }
    });

    actionService.send('TOGGLE');
  });

  test('should execute initial entry action', () => {
    let executed = false;

    const machine = createMachine({
      initial: 'foo',
      states: {
        foo: {
          entry: () => {
            executed = true;
          },
        },
      },
    });

    interpret(machine).start();
    expect(executed).toBe(true);
  });

  test('should lookup string actions in options', () => {
    let executed = false;

    const machine = createMachine(
      {
        initial: 'foo',
        states: {
          foo: {
            entry: 'testAction',
          },
        },
      },
      {
        actions: {
          testAction: () => {
            executed = true;
          },
        },
      },
    );

    interpret(machine).start();

    expect(executed).toBe(true);
  });

  test('should reveal the current state', () => {
    const machine = createMachine({
      initial: 'test',
      context: { foo: 'bar' },
      states: {
        test: {},
      },
    });
    const service = interpret(machine);

    service.start();

    expect(service.state.value).toEqual('test');
    expect(service.state.context).toEqual({ foo: 'bar' });
  });

  test('should reveal the current state after transition', (done) => {
    const machine = createMachine({
      initial: 'test',
      context: { foo: 'bar' },
      states: {
        test: {
          on: { CHANGE: 'success' },
        },
        success: {},
      },
    });
    const service = interpret(machine);

    service.start();

    service.subscribe(() => {
      if (service.state.value === 'success') {
        done();
      }
    });

    service.send('CHANGE');
  });

  test('should not re-execute exit/entry actions for transitions with undefined targets', () => {
    const machine = createMachine({
      initial: 'test',
      states: {
        test: {
          entry: ['entry'],
          exit: ['exit'],
          on: {
            EVENT: {
              // undefined target
              actions: ['action'],
            },
          },
        },
      },
    });

    const { initialState } = machine;

    expect(initialState.actions.map((a) => a.type)).toEqual(['entry']);

    const nextState = machine.transition(initialState, 'EVENT');

    expect(nextState.actions.map((a) => a.type)).toEqual(['action']);
  });

  describe('`start` method', () => {
    test('should start the service with initial state by default', () => {
      const machine = createMachine({
        initial: 'foo',
        states: {
          foo: {
            on: {
              NEXT: 'bar',
            },
          },
          bar: {},
        },
      });

      const service = interpret(machine).start();

      expect(service.state.value).toBe('foo');
    });

    test('should rehydrate the state if the state if provided', () => {
      const machine = createMachine({
        initial: 'foo',
        states: {
          foo: {
            on: {
              NEXT: 'bar',
            },
          },
          bar: {
            on: {
              NEXT: 'baz',
            },
          },
          baz: {},
        },
      });

      const service = interpret(machine).start('bar');
      expect(service.state.value).toBe('bar');

      service.send('NEXT');
      expect(service.state.matches('baz')).toBe(true);
    });

    test('should rehydrate the state and the context if both are provided', () => {
      const machine = createMachine({
        initial: 'foo',
        states: {
          foo: {
            on: {
              NEXT: 'bar',
            },
          },
          bar: {
            on: {
              NEXT: 'baz',
            },
          },
          baz: {},
        },
      });

      const context = { hello: 'world' };
      const service = interpret(machine).start({ value: 'bar', context });
      expect(service.state.value).toBe('bar');
      expect(service.state.context).toBe(context);

      service.send('NEXT');
      expect(service.state.matches('baz')).toBe(true);
    });

    test('should execute initial actions when re-starting a service', () => {
      let entryActionCalled = false;
      const machine = createMachine({
        initial: 'test',
        states: {
          test: {
            entry: () => (entryActionCalled = true),
          },
        },
      });

      const service = interpret(machine).start();
      service.stop();

      entryActionCalled = false;

      service.start();

      expect(entryActionCalled).toBe(true);
    });

    test('should execute initial actions when re-starting a service that transitioned to a different state', () => {
      let entryActionCalled = false;
      const machine = createMachine({
        initial: 'a',
        states: {
          a: {
            entry: () => (entryActionCalled = true),
            on: {
              NEXT: 'b',
            },
          },
          b: {},
        },
      });

      const service = interpret(machine).start();
      service.send({ type: 'NEXT' });
      service.stop();

      entryActionCalled = false;

      service.start();

      expect(entryActionCalled).toBe(true);
    });

    test('should not execute actions of the last known non-initial state when re-starting a service', () => {
      let entryActionCalled = false;
      const machine = createMachine({
        initial: 'a',
        states: {
          a: {
            on: {
              NEXT: 'b',
            },
          },
          b: {
            entry: () => (entryActionCalled = true),
          },
        },
      });

      const service = interpret(machine).start();
      service.send({ type: 'NEXT' });
      service.stop();

      entryActionCalled = false;

      service.start();

      expect(entryActionCalled).toBe(false);
    });
  });
});
