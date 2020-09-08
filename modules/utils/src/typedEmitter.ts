import { EventName, EventPayload } from "@connext/types";
import { Evt, to, Ctx } from "evt";

// Disable max handlers warnings
Evt.setDefaultMaxHandlers(0);

export class TypedEmitter {
  private evt: Evt<[EventName, EventPayload[EventName]]>;
  constructor() {
    this.evt = Evt.create<[EventName, EventPayload[EventName]]>();
  }

  // Attaches a callback to a specified event, with an optional filter.
  // Callbacks registered using this handler should be removed intenitionally
  public attach<T extends EventName>(
    event: T,
    callback: (payload: EventPayload[T]) => void | Promise<void>,
    filter?: (payload: EventPayload[T]) => boolean,
  ): void {
    if (filter) {
      // Evt package allows filtering if all events on EVT
      // are filtered against, so convert the function
      const eventFilter = ([emittedEvent, emittedPayload]) => {
        return event === emittedEvent && filter(emittedPayload);
      };
      const eventCallback = ([_, emittedPayload]) => {
        return callback(emittedPayload);
      };
      this.evt.attach(eventFilter, eventCallback);
      return;
    }
    this.evt.$attach(to(event), callback);
  }

  // Attaches a callback to a specified event, with an optional filter
  // Callbacks registered using this handler DO NOT have to be
  // removed.
  public attachOnce<T extends EventName>(
    event: T,
    callback: (payload: EventPayload[T]) => void | Promise<void>,
    filter?: (payload: EventPayload[T]) => boolean,
  ): void {
    if (filter) {
      // Evt package allows filtering if all events on EVT
      // are filtered against, so convert the function
      const eventFilter = ([emittedEvent, emittedPayload]) => {
        return event === emittedEvent && filter(emittedPayload);
      };
      const eventCallback = ([_, emittedPayload]) => {
        return callback(emittedPayload);
      };
      this.evt.attachOnce(eventFilter, eventCallback);
      return;
    }
    this.evt.$attachOnce(to(event), callback);
  }

  // Emits an event with a given payload
  public post<T extends EventName>(event: T, payload: EventPayload[T]): void {
    this.evt.post([event, payload]);
  }

  // Detaches all listners, or all in context if specified
  public detach(ctx?: Ctx<[EventName, EventPayload[EventName]]>): void {
    this.evt.detach(ctx);
  }

  // Creates a new void context for easy listener detachment
  public createContext(): Ctx<[EventName, EventPayload[EventName]]> {
    return Evt.newCtx<[EventName, EventPayload[EventName]]>();
  }

  // Returns a promise once matching event is emitted
  public async waitFor<T extends EventName>(
    event: T,
    timeout: number, // time in MS before rejecting
    filter?: (payload: EventPayload[T]) => boolean,
  ): Promise<EventPayload[T]> {
    const eventFilter = ([emittedEvent, emittedPayload]) => {
      if (filter) {
        return event === emittedEvent && filter(emittedPayload);
      }
      return event === emittedEvent;
    };
    const [_, payload] = await this.evt.waitFor(eventFilter, timeout);
    return payload as EventPayload[T];
  }
}
