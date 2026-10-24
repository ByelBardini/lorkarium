import { useEffect, useEffectEvent, useRef } from 'react';

/** Runs `run` once when the component mounts; the ref keeps StrictMode's second effect from
 *  running it again (a second link issued would kill the first).
 *
 *  Example: `useOnceOnMount(() => fetcher.send({ intent: 'deletion-check', userId }))` */
export function useOnceOnMount(run: () => void): void {
  const ran = useRef(false);
  const onMount = useEffectEvent(run);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    onMount();
  }, []);
}
