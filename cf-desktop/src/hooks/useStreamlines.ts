import { useEffect, useRef, useState } from 'react';
import type { FrameData } from '../types';
import type { Point } from '../utils/streamline';

export type { Point } from '../utils/streamline';

export function useStreamlines(
    frameData: FrameData | null,
    enabled: boolean
): Point[][] {
    const [streamlines, setStreamlines] = useState<Point[][]>([]);
    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);

    // Create worker on mount
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/streamlineWorker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (e: MessageEvent) => {
            const { requestId, nLines, counts, xy } = e.data;
            // Ignore stale responses
            if (requestId !== requestIdRef.current) return;

            // Unpack flat array into Point[][]
            const lines: Point[][] = [];
            let offset = 0;
            for (let i = 0; i < nLines; i++) {
                const line: Point[] = [];
                for (let j = 0; j < counts[i]; j++) {
                    line.push({ x: xy[offset], y: xy[offset + 1] });
                    offset += 2;
                }
                lines.push(line);
            }
            setStreamlines(lines);
        };

        workerRef.current = worker;
        return () => {
            worker.terminate();
            workerRef.current = null;
        };
    }, []);

    // Send computation request when frame data changes
    useEffect(() => {
        if (!enabled || !frameData || !workerRef.current) {
            setStreamlines([]);
            return;
        }

        const requestId = ++requestIdRef.current;
        workerRef.current.postMessage({
            type: 'compute',
            requestId,
            u: frameData.u,
            v: frameData.v,
            nx: frameData.nx,
            ny: frameData.ny,
            obstacle: frameData.obstacle,
            nSeeds: 13,
        });
    }, [frameData, enabled]);

    return streamlines;
}
