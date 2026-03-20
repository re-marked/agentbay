import { EventEmitter } from "node:events";
import type { Events } from "@agentbay/core";

export function createLocalEvents(): Events {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);

  return {
    broadcast(channel, event, data) {
      emitter.emit(`${channel}:${event}`, data);
    },

    subscribe(channel, callback) {
      const handler = (data: unknown) => {
        // Extract event name from the composite key
        callback(channel, data);
      };
      // Listen to all events on this channel
      emitter.on(channel, handler);
    },

    unsubscribe(channel) {
      emitter.removeAllListeners(channel);
    },
  };
}
