/**
 * Grid Validation, Memory Estimation, and Runtime Estimation
 *
 * Provides real-time validation feedback for grid configuration.
 * Memory model: ~305 bytes per LBM node (f + f_next + obstacle + wall_dist + forces + thermal).
 * Runtime model: ~1M node-steps per second on Apple M5 (measured from Phase 4 runs).
 */

import type { SystemInfo, ValidationResult } from '../types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Bytes per LBM node: 9 distributions * 2 (f + f_next) * 8 bytes + auxiliary arrays */
const BYTES_PER_NODE = 305;

/** Measured performance: node-steps per second on Apple M5 MacBook Pro */
const NODE_STEPS_PER_SEC = 1_000_000;

/** Disk bytes per binary frame: 24-byte header + 5 channels * nx * ny * 4 bytes (float32) */
const BYTES_PER_FRAME_HEADER = 24;
const CHANNELS_PER_FRAME = 5;
const BYTES_PER_CHANNEL_ELEMENT = 4; // float32

/** Warning thresholds */
const RAM_WARN_PERCENT = 50;
const RAM_DANGER_PERCENT = 80;
const CELL_COUNT_WARN = 2_000_000;
const CELL_COUNT_DANGER = 8_000_000;
const FRAME_SIZE_WARN_MB = 50;
const TOTAL_DISK_WARN_GB = 2;

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate grid configuration and compute all estimates.
 *
 * @param nx - Grid width in cells
 * @param ny - Grid height in cells
 * @param maxSteps - Total simulation steps
 * @param saveInterval - Steps between frame saves
 * @param systemInfo - System capabilities (RAM, cores, DPR)
 */
export function validateGrid(
  nx: number,
  ny: number,
  maxSteps: number,
  saveInterval: number,
  systemInfo: SystemInfo | null,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Bounds validation ---
  if (nx < 32 || nx > 4096) {
    errors.push(`Grid width ${nx} out of range [32, 4096]`);
  }
  if (ny < 32 || ny > 4096) {
    errors.push(`Grid height ${ny} out of range [32, 4096]`);
  }
  if (maxSteps < 1 || maxSteps > 1_000_000) {
    errors.push(`Step count ${maxSteps} out of range [1, 1,000,000]`);
  }

  // --- Memory estimation ---
  const totalNodes = nx * ny;
  const estimatedMemoryBytes = totalNodes * BYTES_PER_NODE;

  // --- Runtime estimation ---
  const totalNodeSteps = totalNodes * maxSteps;
  const estimatedRuntimeSec = totalNodeSteps / NODE_STEPS_PER_SEC;

  // --- Disk estimation ---
  const frameSizeBytes = BYTES_PER_FRAME_HEADER + CHANNELS_PER_FRAME * totalNodes * BYTES_PER_CHANNEL_ELEMENT;
  const numFrames = Math.ceil(maxSteps / saveInterval);
  const totalDiskBytes = frameSizeBytes * numFrames;

  // --- RAM warnings ---
  let ramPercent = 0;
  if (systemInfo && systemInfo.availableRamBytes > 0) {
    ramPercent = (estimatedMemoryBytes / systemInfo.availableRamBytes) * 100;

    if (ramPercent > RAM_DANGER_PERCENT) {
      warnings.push(
        `High memory usage: ${formatBytes(estimatedMemoryBytes)} (${ramPercent.toFixed(0)}% of available RAM). ` +
        `Simulation may be slow or fail.`
      );
    } else if (ramPercent > RAM_WARN_PERCENT) {
      warnings.push(
        `Moderate memory usage: ${formatBytes(estimatedMemoryBytes)} (${ramPercent.toFixed(0)}% of available RAM).`
      );
    }
  }

  // --- Cell count warnings ---
  if (totalNodes > CELL_COUNT_DANGER) {
    warnings.push(
      `Very large grid: ${(totalNodes / 1e6).toFixed(1)}M cells. ` +
      `Simulation will take ${formatRuntime(estimatedRuntimeSec)}. Consider reducing resolution.`
    );
  } else if (totalNodes > CELL_COUNT_WARN) {
    warnings.push(
      `Large grid: ${(totalNodes / 1e6).toFixed(1)}M cells. ` +
      `Estimated runtime: ${formatRuntime(estimatedRuntimeSec)}.`
    );
  }

  // --- Disk warnings ---
  const frameSizeMB = frameSizeBytes / (1024 * 1024);
  if (frameSizeMB > FRAME_SIZE_WARN_MB) {
    warnings.push(
      `Each frame is ${frameSizeMB.toFixed(1)} MB. ` +
      `${numFrames} frames will use ${formatBytes(totalDiskBytes)} on disk.`
    );
  }
  const totalDiskGB = totalDiskBytes / (1024 * 1024 * 1024);
  if (totalDiskGB > TOTAL_DISK_WARN_GB) {
    warnings.push(
      `Total output size: ${totalDiskGB.toFixed(1)} GB. ` +
      `Consider increasing save interval to reduce disk usage.`
    );
  }

  // --- Aspect ratio sanity ---
  const aspect = nx / ny;
  if (aspect > 10 || aspect < 0.1) {
    warnings.push(
      `Extreme aspect ratio ${aspect.toFixed(1)}:1 may cause numerical issues.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    estimatedMemoryBytes,
    memoryDisplay: formatBytes(estimatedMemoryBytes),
    estimatedRuntimeSec,
    runtimeDisplay: formatRuntime(estimatedRuntimeSec),
    ramPercent,
  };
}

/* ------------------------------------------------------------------ */
/*  Formatting Helpers                                                 */
/* ------------------------------------------------------------------ */

/** Format bytes to human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format seconds to "~X min Y sec" human-readable string */
export function formatRuntime(seconds: number): string {
  if (seconds < 1) return '< 1 sec';
  if (seconds < 60) return `~${Math.round(seconds)} sec`;

  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);

  if (mins < 60) {
    return secs > 0 ? `~${mins} min ${secs} sec` : `~${mins} min`;
  }

  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `~${hours} hr ${remainMins} min` : `~${hours} hr`;
}
