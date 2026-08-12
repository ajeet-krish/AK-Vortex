import { useState, useEffect, useCallback, useRef } from 'react';

export interface PlaybackState {
    playing: boolean;
    playbackSpeed: number;
    setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
    togglePlay: () => void;
    stopPlayback: () => void;
    frameIndexRef: React.MutableRefObject<number>;
}

export function usePlayback(
    frameCount: number,
    setFrameIndex: React.Dispatch<React.SetStateAction<number>>
): PlaybackState {
    const [playing, setPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(200); // ms per frame
    const frameIndexRef = useRef(0);
    const lastTimeRef = useRef(0);
    const animFrameRef = useRef<number>(0);

    // requestAnimationFrame loop (replaces setInterval for smoother animation)
    useEffect(() => {
        if (!playing || frameCount === 0) return;

        const animate = (time: number) => {
            if (lastTimeRef.current === 0) {
                lastTimeRef.current = time;
            }

            const elapsed = time - lastTimeRef.current;
            if (elapsed >= playbackSpeed) {
                lastTimeRef.current = time;
                setFrameIndex((prev) => {
                    const next = prev + 1;
                    frameIndexRef.current = next >= frameCount ? 0 : next;
                    return frameIndexRef.current;
                });
            }

            animFrameRef.current = requestAnimationFrame(animate);
        };

        animFrameRef.current = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            lastTimeRef.current = 0;
        };
    }, [playing, playbackSpeed, frameCount, setFrameIndex]);

    const togglePlay = useCallback(() => {
        setPlaying((prev) => !prev);
    }, []);

    const stopPlayback = useCallback(() => {
        setPlaying(false);
    }, []);

    return { playing, playbackSpeed, setPlaybackSpeed, togglePlay, stopPlayback, frameIndexRef };
}
