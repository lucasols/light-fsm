import { describe, test, expect } from 'vitest';

import { createFSM } from '../src/main.js';

describe('transitions', () => {
  test('should transition to the next state', () => {
    const toggleMachine = createFSM({
      initial: 'active',
      states: {
        active: {
          on: { TOGGLE: 'inactive' },
        },
        inactive: {},
      },
    });

    const toggleService = toggleMachine.interpret();

    expect(toggleService.state).toBe('active');

    toggleService.send('TOGGLE');

    expect(toggleService.state).toBe('inactive');
  });

  test('should transition correctly', () => {
    const nextState = lightFSM.transition('green', 'TIMER');
    expect(nextState.value).toEqual('yellow');
    expect(nextState.actions.map((action) => action.type)).toEqual([
      'exitGreen',
      'g-y 1',
      'g-y 2',
    ]);
    expect(nextState.context).toEqual({
      count: 2,
      foo: 'static++',
      go: false,
    });
  });

  test('should stay on the same state for undefined transitions', () => {
    const nextState = lightFSM.transition('green', 'FAKE' as any);
    expect(nextState.value).toBe('green');
    expect(nextState.actions).toEqual([]);
  });

  describe('when a wildcard transition is defined', () => {
    type Event = { type: 'event' };
    type State =
      | { value: 'pass'; context: {} }
      | { value: 'fail'; context: {} };
    test('should not use a wildcard when an unguarded transition matches', () => {
      const machine = createMachine<{}, Event, State>({
        initial: 'fail',
        states: { fail: { on: { event: 'pass', '*': 'fail' } }, pass: {} },
      });
      const nextState = machine.transition(machine.initialState, 'event');
      expect(nextState.value).toBe('pass');
    });

    test('should not use a wildcard when a guarded transition matches', () => {
      const machine = createMachine<{}, Event, State>({
        initial: 'fail',
        states: {
          fail: {
            on: { event: { target: 'pass', cond: () => true }, '*': 'fail' },
          },
          pass: {},
        },
      });
      const nextState = machine.transition(machine.initialState, 'event');
      expect(nextState.value).toBe('pass');
    });

    test('should use a wildcard when no guarded transition matches', () => {
      const machine = createMachine<{}, Event, State>({
        initial: 'fail',
        states: {
          fail: {
            on: { event: { target: 'fail', cond: () => false }, '*': 'pass' },
          },
          pass: {},
        },
      });
      const nextState = machine.transition(machine.initialState, 'event');
      expect(nextState.value).toBe('pass');
    });

    test('should use a wildcard when no transition matches', () => {
      const machine = createMachine<{}, Event, State>({
        initial: 'fail',
        states: { fail: { on: { event: 'fail', '*': 'pass' } }, pass: {} },
      });
      const nextState = machine.transition(machine.initialState, 'FAKE' as any);
      expect(nextState.value).toBe('pass');
    });

    test("should throw an error when an event's type is the wildcard", () => {
      const machine = createMachine<{}, Event, State>({
        initial: 'fail',
        states: { pass: {}, fail: {} },
      });
      expect(() => machine.transition('fail', '*' as any)).toThrow(
        /wildcard type/,
      );
    });
  });

  test('should throw an error for undefined states', () => {
    expect(() => {
      lightFSM.transition('unknown', 'TIMER');
    }).toThrow();
  });

  test('should throw an error for undefined next state config', () => {
    const invalidState = 'blue';
    const testConfig = {
      id: 'test',
      initial: 'green',
      states: {
        green: {
          on: {
            TARGET_INVALID: invalidState,
          },
        },
        yellow: {},
      },
    };
    const testMachine = createMachine(testConfig);

    expect(() => {
      testMachine.transition('green', 'TARGET_INVALID');
    }).toThrow(
      `State '${invalidState}' not found on machine ${testConfig.id ?? ''}`,
    );
  });

  test('should work with guards', () => {
    const yellowState = lightFSM.transition('yellow', 'EMERGENCY');
    expect(yellowState.value).toEqual('yellow');

    const redState = lightFSM.transition('yellow', {
      type: 'EMERGENCY',
      value: 2,
    });
    expect(redState.value).toEqual('red');
    expect(redState.context.count).toBe(0);

    const yellowOneState = lightFSM.transition('yellow', 'INC');
    const redOneState = lightFSM.transition(yellowOneState, {
      type: 'EMERGENCY',
      value: 1,
    });

    expect(redOneState.value).toBe('red');
    expect(redOneState.context.count).toBe(1);
  });

  test('should be changed if state changes', () => {
    expect(lightFSM.transition('green', 'TIMER').changed).toBe(true);
  });

  test('should be changed if any actions occur', () => {
    expect(lightFSM.transition('yellow', 'INC').changed).toBe(true);
  });

  test('should not be changed on unknown transitions', () => {
    expect(lightFSM.transition('yellow', 'UNKNOWN' as any).changed).toBe(false);
  });

  test('should match initialState', () => {
    const { initialState } = lightFSM;

    expect(initialState.matches('green')).toBeTruthy();

    if (initialState.matches('green')) {
      expect(initialState.context.go).toBeTruthy();
    }
  });

  test('should match transition states', () => {
    const { initialState } = lightFSM;
    const nextState = lightFSM.transition(initialState, 'TIMER');

    expect(nextState.matches('yellow')).toBeTruthy();

    if (nextState.matches('yellow')) {
      expect(nextState.context.go).toBeFalsy();
    }
  });
});

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

  test('should execute actions', () => {
    let executed = false;

    const actionMachine = createFSM<States>({
      initial: 'active',
      states: {
        active: {
          on: {
            TOGGLE: {
              target: 'inactive',
              entry: () => {
                executed = true;
              },
            },
          },
        },
        inactive: {},
      },
    });

    const actionService = actionMachine.interpret();

    actionService.send('TOGGLE');

    expect(executed).toBe(true);
  });

  test('should execute initial entry action', () => {
    let executed = false;

    const machine = createFSM({
      initial: 'foo',
      states: {
        foo: {
          entry: () => {
            executed = true;
          },
        },
      },
    });

    machine.interpret();

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

  test('should reveal the current state after transition', () => {
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
