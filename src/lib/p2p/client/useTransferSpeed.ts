"use client";

import { useEffect, useRef, useState } from "react";

const SAMPLE_INTERVAL_MS = 500;
const SMOOTHING = 0.3; // EMA factor — higher reacts faster, lower reads steadier

/**
 * Derives a smoothed bytes/sec transfer speed from a running "bytes
 * transferred so far" count. onProgress fires once per 64KB chunk (see
 * webrtc.ts), which for a fast connection can be dozens of times a
 * second — rather than recomputing on every one of those, a timer
 * samples on a fixed interval and applies a light exponential moving
 * average, so the displayed number reads smoothly instead of jittering
 * with every chunk.
 */
export function useTransferSpeed(transferred: number, active: boolean): number {
  const [speed, setSpeed] = useState(0);
  const transferredRef = useRef(transferred);

  // Keeps the ref current for the interval callback below to read —
  // done in an effect (after render) rather than during render itself,
  // and a plain ref write doesn't trigger a re-render on its own.
  useEffect(() => {
    transferredRef.current = transferred;
  });

  useEffect(() => {
    if (!active) return;

    let lastBytes = transferredRef.current;
    let lastTime = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsedMs = now - lastTime;
      const instantaneous = ((transferredRef.current - lastBytes) / elapsedMs) * 1000;
      lastBytes = transferredRef.current;
      lastTime = now;

      setSpeed((prev) => (prev === 0 ? instantaneous : prev + SMOOTHING * (instantaneous - prev)));
    }, SAMPLE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      setSpeed(0);
    };
  }, [active]);

  return speed;
}
