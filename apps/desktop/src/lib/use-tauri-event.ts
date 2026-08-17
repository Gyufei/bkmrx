import { listen, type Event, type EventName } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';

type TauriEventHandler<T> = (event: Event<T>) => void;

export function useTauriEvent<T>(
  eventName: EventName,
  handler: TauriEventHandler<T>,
  enabled = true,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen<T>(eventName, (event) => handlerRef.current(event))
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error: unknown) => {
        console.error(`Failed to listen for Tauri event "${eventName}"`, error);
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled, eventName]);
}
