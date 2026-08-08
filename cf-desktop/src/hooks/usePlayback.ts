import { useState, useEffect, useCallback } from 'react';

export interface PlaybackState {
    playing: boolean;
    playbackSpeed: number;
    setPlaybackSpeed: React.Dispatch<React.SetStateAction<number>>;
    togglePlay: () => void;
    stopPlayback: () => void;
}

export function usePlayback(
    frameCount: number,
    setFrameIndex: React.Dispatch<React.SetStateAction<number>>
): PlaybackState {
    const [playing, setPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(200);

    // Auto-advance timer
    useEffect(() => {
        if (!playing || frameCount === 0) return;

        const timer = setInterval(() => {
            setFrameIndex((prev) => {
                const next = prev + 1;
                if (next >= frameCount) {
                    setPlaying(false);
                    return prev;
                }
                return next;
            });
        }, playbackSpeed);

        return () => clearInterval(timer);
    }, [playing, playbackSpeed, frameCount, setFrameIndex]);

    const togglePlay = useCallback(() => {
        if (playing) {
            setPlaying(false);
        } else {
            setPlaying(true);
        }
    }, [playing]);

    const stopPlayback = useCallback(() => {
        setPlaying(false);
    }, []);

    return { playing, playbackSpeed, setPlaybackSpeed, togglePlay, stopPlayback };
}
