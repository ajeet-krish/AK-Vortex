import { useState, useCallback, useEffect } from 'react';
import type { Shape } from './GeometryEditor';

interface ObstacleTreeProps {
  shapes: Shape[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  disabled?: boolean;
}

function getShapeIcon(type: string): string {
  switch (type) {
    case 'circle': return '\u25CB';
    case 'rectangle': return '\u25A1';
    case 'polygon': return '\u25B3';
    default: return '?';
  }
}

function getShapeSummary(shape: Shape): string {
  switch (shape.type) {
    case 'circle': return `r=${shape.radius}`;
    case 'rectangle': return `${shape.width}x${shape.height}`;
    case 'polygon': return `${shape.points?.length ?? 0} pts`;
    default: return '';
  }
}

export default function ObstacleTree({
  shapes, selectedId, onSelect, onDelete, onDuplicate, disabled,
}: ObstacleTreeProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (disabled) return;
    setContextMenu({ x: e.clientX, y: e.clientY, id });
  }, [disabled]);

  if (shapes.length === 0) return null;

  return (
    <div className="obstacle-tree">
      <div className="tree-section-header">
        <span>Obstacles ({shapes.length})</span>
      </div>
      <div className="tree-content">
        {shapes.map((shape) => (
          <div
            key={shape.id}
            className={`tree-item-selectable ${selectedId === shape.id ? 'selected' : ''}`}
            onClick={() => onSelect(shape.id)}
            onContextMenu={(e) => handleContextMenu(e, shape.id)}
          >
            {!disabled && (
              <button
                className="tree-item-delete"
                style={{ opacity: 1, marginRight: '4px' }}
                onClick={(e) => { e.stopPropagation(); onDelete(shape.id); }}
                title="Delete obstacle"
              >
                &times;
              </button>
            )}
            <span className="obstacle-icon">{getShapeIcon(shape.type)}</span>
            <span className="tree-item-label">{shape.name}</span>
            <span className="obstacle-summary">{getShapeSummary(shape)}</span>
          </div>
        ))}
      </div>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button className="context-menu-item" onClick={() => { onDuplicate(contextMenu.id); setContextMenu(null); }}>
            Duplicate
          </button>
          <button className="context-menu-item danger" onClick={() => { onDelete(contextMenu.id); setContextMenu(null); }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
