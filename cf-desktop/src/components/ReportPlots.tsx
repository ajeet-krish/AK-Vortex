import type { ReportPlots as ReportPlotsData } from '../hooks/useVisualization';

interface ReportPlotsProps {
  plots: ReportPlotsData | null;
  loading: boolean;
  onGenerate: () => void;
  config: { nx: number; ny: number; re: number; caseType: string };
  step: number;
}

export default function ReportPlots({
  plots,
  loading,
  onGenerate,
  config,
  step,
}: ReportPlotsProps) {
  if (loading) {
    return (
      <div className="report-grid">
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
        <div className="report-skeleton" />
      </div>
    );
  }

  if (!plots) {
    return (
      <div className="report-placeholder">
        <p>Click &quot;Generate Report&quot; to create publication-quality plots</p>
        <button className="btn-primary" onClick={onGenerate}>
          Generate Report
        </button>
      </div>
    );
  }

  return (
    <div className="report-section">
      <div className="report-header">
        <h3>Publication Figures</h3>
        <button className="btn-secondary" onClick={onGenerate}>
          Regenerate
        </button>
      </div>
      <div className="report-grid">
        <div className="report-plot-cell">
          <span className="report-plot-label">Velocity Contour</span>
          <img
            src={`data:image/png;base64,${plots.velocityPng}`}
            alt={`Velocity contour for ${config.caseType} Re=${config.re} at step ${step}`}
          />
        </div>
        <div className="report-plot-cell">
          <span className="report-plot-label">Streamlines</span>
          <img
            src={`data:image/png;base64,${plots.streamlinesPng}`}
            alt={`Streamlines for ${config.caseType} Re=${config.re} at step ${step}`}
          />
        </div>
        <div className="report-plot-cell">
          <span className="report-plot-label">Pressure Coefficient</span>
          <img
            src={`data:image/png;base64,${plots.pressurePng}`}
            alt={`Pressure coefficient for ${config.caseType} Re=${config.re} at step ${step}`}
          />
        </div>
        <div className="report-plot-cell">
          <span className="report-plot-label">Vorticity</span>
          <img
            src={`data:image/png;base64,${plots.vorticityPng}`}
            alt={`Vorticity for ${config.caseType} Re=${config.re} at step ${step}`}
          />
        </div>
      </div>
    </div>
  );
}
