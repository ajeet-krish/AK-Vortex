import { useState } from 'react';

interface LogTerminalProps {
  log: string[];
  onClear: () => void;
}

export default function LogTerminal({ log, onClear }: LogTerminalProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`log-terminal ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="log-terminal-header" onClick={() => setExpanded(!expanded)}>
        <span>{expanded ? '▼' : '▶'} Log</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
          {log.length} entries
        </span>
        {expanded && (
          <button className="log-clear" onClick={(e) => { e.stopPropagation(); onClear(); }}>
            Clear
          </button>
        )}
      </div>
      {expanded && (
        <div className="log-terminal-content">
          {log.map((entry, i) => (
            <div key={i} className="log-entry">{entry}</div>
          ))}
        </div>
      )}
    </div>
  );
}