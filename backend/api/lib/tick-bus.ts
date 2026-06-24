import { EventEmitter } from 'events';

export interface LiveTick {
  token:          string;
  exchange:       string;
  symbol:         string;
  tradingSymbol:  string;
  ltp:            number;
  open:           number;
  high:           number;
  low:            number;
  close:          number;
  volume:         number;
  netChange:      number;
  percentChange:  number;
  ts:             number;
}

// Singleton EventEmitter that ws-live.ts emits to and server.ts WS clients
// listen on. Allows zero-copy forwarding of AngelOne ticks to Flutter clients
// without waiting for the Redis flush interval.
class TickBus extends EventEmitter {
  emit(event: 'tick', tick: LiveTick): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  onTick(listener: (tick: LiveTick) => void): this {
    return this.on('tick', listener);
  }

  offTick(listener: (tick: LiveTick) => void): this {
    return this.off('tick', listener);
  }
}

export const tickBus = new TickBus();
tickBus.setMaxListeners(500); // support many concurrent Flutter WS clients
