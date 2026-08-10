import { useState, useMemo } from 'react';
import type { FrameData, ProbeInfo } from '../types';
import type { QuiverConfig } from '../utils/quiver';
import { DEFAULT_QUIVER_CONFIG } from '../utils/quiver';

export interface ReportPlots {
  velocityPng: string;
  streamlinesPng: string;
  pressurePng: string;
  vorticityPng: string;
}

export interface VisualizationState {
  field: 'velocity' | 'pressure' | 'vorticity';
  setField: React.Dispatch<React.SetStateAction<'velocity' | 'pressure' | 'vorticity'>>;
  showQuiver: boolean;
  setShowQuiver: React.Dispatch<React.SetStateAction<boolean>>;
  quiverConfig: QuiverConfig;
  setQuiverConfig: React.Dispatch<React.SetStateAction<QuiverConfig>>;
  useManualRange: boolean;
  setUseManualRange: React.Dispatch<React.SetStateAction<boolean>>;
  manualMin: string;
  setManualMin: React.Dispatch<React.SetStateAction<string>>;
  manualMax: string;
  setManualMax: React.Dispatch<React.SetStateAction<string>>;
  colorRange: { min: number; max: number };
  viewMode: 'domain' | 'results';
  setViewMode: React.Dispatch<React.SetStateAction<'domain' | 'results'>>;
  vizMode: 'interactive' | 'report';
  setVizMode: React.Dispatch<React.SetStateAction<'interactive' | 'report'>>;
  reportPlots: ReportPlots | null;
  setReportPlots: React.Dispatch<React.SetStateAction<ReportPlots | null>>;
  reportLoading: boolean;
  setReportLoading: React.Dispatch<React.SetStateAction<boolean>>;
  compareMode: boolean;
  setCompareMode: React.Dispatch<React.SetStateAction<boolean>>;
  compareData: FrameData | null;
  setCompareData: React.Dispatch<React.SetStateAction<FrameData | null>>;
  probe: ProbeInfo | null;
  setProbe: React.Dispatch<React.SetStateAction<ProbeInfo | null>>;
}

export function useVisualization(frameData: FrameData | null): VisualizationState {
  const [field, setField] = useState<'velocity' | 'pressure' | 'vorticity'>('velocity');
  const [showQuiver, setShowQuiver] = useState(false);
  const [quiverConfig, setQuiverConfig] = useState<QuiverConfig>(DEFAULT_QUIVER_CONFIG);
  const [useManualRange, setUseManualRange] = useState(false);
  const [manualMin, setManualMin] = useState('0');
  const [manualMax, setManualMax] = useState('0.1');
  const [viewMode, setViewMode] = useState<'domain' | 'results'>('domain');
  const [vizMode, setVizMode] = useState<'interactive' | 'report'>('interactive');
  const [reportPlots, setReportPlots] = useState<ReportPlots | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareData, setCompareData] = useState<FrameData | null>(null);
  const [probe, setProbe] = useState<ProbeInfo | null>(null);

  // Compute color range for the color scale bar (NaN-safe, symmetric for pressure)
  const colorRange = useMemo(() => {
    if (!frameData) return { min: 0, max: 1 };

    if (useManualRange) {
      return { min: parseFloat(manualMin) || 0, max: parseFloat(manualMax) || 1 };
    }

    if (field === 'velocity') {
      let maxVal = 0;
      for (const val of frameData.velocity) {
        if (Number.isFinite(val) && val > maxVal) maxVal = val;
      }
      return { min: 0, max: maxVal || 1 };
    } else if (field === 'pressure') {
      let minVal = Infinity;
      let maxVal = -Infinity;
      for (const val of frameData.p) {
        if (!Number.isFinite(val)) continue;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      if (!Number.isFinite(minVal) || !Number.isFinite(maxVal) || minVal === maxVal) {
        return { min: -1, max: 1 };
      }
      const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
      return { min: -absMax, max: absMax };
    } else {
      let maxAbs = 0;
      for (const val of frameData.omega) {
        if (Number.isFinite(val)) {
          const abs = Math.abs(val);
          if (abs > maxAbs) maxAbs = abs;
        }
      }
      return { min: -maxAbs, max: maxAbs || 1 };
    }
  }, [frameData, field, useManualRange, manualMin, manualMax]);

  return {
    field,
    setField,
    showQuiver,
    setShowQuiver,
    quiverConfig,
    setQuiverConfig,
    useManualRange,
    setUseManualRange,
    manualMin,
    setManualMin,
    manualMax,
    setManualMax,
    colorRange,
    viewMode,
    setViewMode,
    vizMode,
    setVizMode,
    reportPlots,
    setReportPlots,
    reportLoading,
    setReportLoading,
    compareMode,
    setCompareMode,
    compareData,
    setCompareData,
    probe,
    setProbe,
  };
}
