# Light fsm

A lightweight finite state machine library for typescript based on t-state

## Documentation

### Overview

`light-fsm` is a lightweight finite state machine (FSM) library designed for TypeScript applications. It leverages the `t-state` library to provide a simple yet powerful API for managing state transitions in a predictable manner.

### Finite State Machine Concept

A finite state machine is a computational model used to design algorithms. It consists of a finite number of states, transitions between those states, and actions that can occur in each state. `light-fsm` simplifies the process of defining and managing these states and transitions in your application.

### Installation

To install `light-fsm`, run the following command in your project directory:

```bash
npm install light-fsm
```

### Usage

To use `light-fsm`, you first define the states and transitions of your machine. Here's a simple example:

```typescript
import { createFSM, FSMConfig } from 'light-fsm';

type LightStates = 'green' | 'yellow' | 'red';
type LightEvents = { type: 'TIMER' | 'POWER_OUTAGE' };

const config: FSMConfig<{ states: LightStates; events: LightEvents }> = {
  initial: 'green',
  states: {
    green: {
      on: {
        TIMER: 'yellow',
      },
    },
    yellow: {
      on: {
        TIMER: 'red',
      },
    },
    red: {
      on: {
        TIMER: 'green',
        POWER_OUTAGE: 'red',
      },
    },
  },
};

const trafficLight = createFSM(config);

// Transition to the next state
trafficLight.send({ type: 'TIMER' });
```

### Configuration Options

The `FSMConfig` object allows you to define the initial state, states, and transitions of your finite state machine. Each state can define actions that occur on entry (`entry`), on exit (`exit`), or during transitions (`on`).

### API Reference

- `createFSM(config: FSMConfig)`: Creates a new finite state machine based on the provided configuration.
- `send(event: Event)`: Triggers a state transition based on the given event.

For more detailed information, please refer to the type definitions in the library.

### Contributing

Contributions to `light-fsm` are welcome! Please refer to the project's GitHub repository for contribution guidelines.

### License

`light-fsm` is licensed under the MIT License. See the LICENSE file for more details.
