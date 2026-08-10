/**
 * System Info Detection
 *
 * Queries system capabilities: available RAM (from Rust backend via sysinfo crate),
 * CPU core count, and display devicePixelRatio (from browser API).
 */

import { invoke } from '@tauri-apps/api/core';
import type { SystemInfo } from '../types';

/** Cached system info (queried once on app startup) */
let cachedSystemInfo: SystemInfo | null = null;

/**
 * Get devicePixelRatio with safe fallback.
 * Returns 1.0 if the API is unavailable (e.g., during SSR).
 */
export function getDevicePixelRatio(): number {
  try {
    return window.devicePixelRatio || 1.0;
  } catch {
    return 1.0;
  }
}

/**
 * Query full system capabilities.
 * Combines Rust-side sysinfo (RAM, cores) with browser-side DPR.
 * Result is cached after first call.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  if (cachedSystemInfo) return cachedSystemInfo;

  try {
    const rustInfo = await invoke<{
      total_ram_bytes: number;
      available_ram_bytes: number;
      cpu_cores: number;
    }>('get_system_info');

    cachedSystemInfo = {
      totalRamBytes: rustInfo.total_ram_bytes,
      availableRamBytes: rustInfo.available_ram_bytes,
      cpuCores: rustInfo.cpu_cores,
      devicePixelRatio: getDevicePixelRatio(),
    };
  } catch (e) {
    console.warn('Failed to query system info from Rust backend:', e);
    // Fallback: use browser-only estimates
    cachedSystemInfo = {
      totalRamBytes: 8 * 1024 * 1024 * 1024,       // assume 8 GB
      availableRamBytes: 4 * 1024 * 1024 * 1024,    // assume 4 GB available
      cpuCores: navigator.hardwareConcurrency || 4,
      devicePixelRatio: getDevicePixelRatio(),
    };
  }

  return cachedSystemInfo;
}

/**
 * Invalidate cached system info.
 * Call this if the system state may have changed (e.g., after closing large apps).
 */
export function invalidateSystemInfoCache(): void {
  cachedSystemInfo = null;
}
