import { useState, useRef, useEffect, useCallback } from 'react';
import { naca4Airfoil, transformPoints, shapesOverlap } from '../utils/naca';

interface Point {
    x: number;
    y: number;
}

interface Shape {
    id: string;
    type: 'circle' | 'rectangle' | 'polygon';
    name: string;
    x: number;
    y: number;
    radius?: number;
    width?: number;
    height?: number;
    points?: Point[];
}

interface GeometryEditorProps {
    nx: number;
    ny: number;
    onGeometryChange: (shapes: Shape[]) => void;
    onSelectionChange?: (id: string | null) => void;
}

type DrawTool = 'circle' | 'rectangle' | 'polygon' | 'naca' | 'move';

// Counter to avoid Date.now() ID collisions when multiple shapes are created
// within the same millisecond
let idCounter = 0;

function nextShapeName(type: string, shapes: Shape[]): string {
    if (type === 'naca') {
        const count = shapes.filter((s) => s.name.startsWith('NACA')).length + 1;
        return `NACA ${count}`;
    }
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const count = shapes.filter((s) => s.name.startsWith(label)).length + 1;
    return `${label} ${count}`;
}

export default function GeometryEditor({ nx, ny, onGeometryChange, onSelectionChange }: GeometryEditorProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [activeTool, setActiveTool] = useState<DrawTool>('circle');
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<Point | null>(null);
    const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);
    const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // NACA parameters
    const [nacaM, setNacaM] = useState(0.02);
    const [nacaP, setNacaP] = useState(0.4);
    const [nacaT, setNacaT] = useState(0.12);
    const [nacaRotation, setNacaRotation] = useState(0);
    const [nacaChord, setNacaChord] = useState(80);

    // Collision warning
    const [collisionWarning, setCollisionWarning] = useState<string | null>(null);

    // Drag-to-move state
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragStartGrid, setDragStartGrid] = useState<Point | null>(null);

    // Resize state
    const [resizingId, setResizingId] = useState<string | null>(null);
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [resizeShapeSnapshot, setResizeShapeSnapshot] = useState<Shape | null>(null);

    // Convert grid coordinates to canvas pixel coordinates
    const gridToCanvas = useCallback((gx: number, gy: number, canvasW: number, canvasH: number) => {
        const scaleX = canvasW / nx;
        const scaleY = canvasH / ny;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (canvasW - nx * scale) / 2;
        const offsetY = (canvasH - ny * scale) / 2;
        return {
            px: offsetX + gx * scale,
            py: offsetY + gy * scale,
            scale,
            offsetX,
            offsetY,
        };
    }, [nx, ny]);

    // Convert canvas pixel coordinates to grid coordinates
    const canvasToGrid = useCallback((px: number, py: number, canvasW: number, canvasH: number) => {
        const scaleX = canvasW / nx;
        const scaleY = canvasH / ny;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (canvasW - nx * scale) / 2;
        const offsetY = (canvasH - ny * scale) / 2;
        return {
            gx: (px - offsetX) / scale,
            gy: (py - offsetY) / scale,
        };
    }, [nx, ny]);

    // Hit-test: check if a grid point is inside any shape
    const findShapeAtPoint = useCallback(
        (gx: number, gy: number): Shape | null => {
            // Iterate in reverse so topmost (last added) shape wins
            for (let i = shapes.length - 1; i >= 0; i--) {
                const s = shapes[i];
                if (s.type === 'circle' && s.radius !== undefined) {
                    const dx = gx - s.x;
                    const dy = gy - s.y;
                    if (dx * dx + dy * dy <= s.radius * s.radius) return s;
                } else if (s.type === 'rectangle' && s.width !== undefined && s.height !== undefined) {
                    if (gx >= s.x && gx <= s.x + s.width && gy >= s.y && gy <= s.y + s.height) return s;
                } else if (s.type === 'polygon' && s.points && s.points.length >= 3) {
                    // Ray-casting point-in-polygon
                    let inside = false;
                    for (let j = 0, k = s.points.length - 1; j < s.points.length; k = j++) {
                        const xi = s.points[j].x, yi = s.points[j].y;
                        const xj = s.points[k].x, yj = s.points[k].y;
                        if (((yi > gy) !== (yj > gy)) && (gx < ((xj - xi) * (gy - yi)) / (yj - yi) + xi)) {
                            inside = !inside;
                        }
                    }
                    if (inside) return s;
                }
            }
            return null;
        },
        [shapes]
    );

    // Move shape by delta in grid coordinates
    const moveShape = useCallback(
        (id: string, dx: number, dy: number) => {
            setShapes((prev) => {
                const updated = prev.map((s) => {
                    if (s.id !== id) return s;
                    if (s.type === 'circle') {
                        return { ...s, x: s.x + dx, y: s.y + dy };
                    }
                    if (s.type === 'rectangle') {
                        return { ...s, x: s.x + dx, y: s.y + dy };
                    }
                    if (s.type === 'polygon' && s.points) {
                        return {
                            ...s,
                            x: s.x + dx,
                            y: s.y + dy,
                            points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
                        };
                    }
                    return s;
                });
                onGeometryChange(updated);
                return updated;
            });
        },
        [onGeometryChange]
    );

    // Get resize handle positions in grid coordinates for a shape
    const getResizeHandles = useCallback(
        (shape: Shape): Array<{ id: string; gx: number; gy: number }> => {
            const handles: Array<{ id: string; gx: number; gy: number }> = [];
            if (shape.type === 'circle' && shape.radius !== undefined) {
                handles.push(
                    { id: 'n', gx: shape.x, gy: shape.y + shape.radius },
                    { id: 's', gx: shape.x, gy: shape.y - shape.radius },
                    { id: 'e', gx: shape.x + shape.radius, gy: shape.y },
                    { id: 'w', gx: shape.x - shape.radius, gy: shape.y },
                );
            } else if (shape.type === 'rectangle' && shape.width !== undefined && shape.height !== undefined) {
                const x0 = shape.x, y0 = shape.y;
                const x1 = shape.x + shape.width, y1 = shape.y + shape.height;
                handles.push(
                    { id: 'nw', gx: x0, gy: y0 },
                    { id: 'ne', gx: x1, gy: y0 },
                    { id: 'sw', gx: x0, gy: y1 },
                    { id: 'se', gx: x1, gy: y1 },
                    { id: 'n', gx: (x0 + x1) / 2, gy: y0 },
                    { id: 's', gx: (x0 + x1) / 2, gy: y1 },
                    { id: 'w', gx: x0, gy: (y0 + y1) / 2 },
                    { id: 'e', gx: x1, gy: (y0 + y1) / 2 },
                );
            } else if (shape.type === 'polygon' && shape.points && shape.points.length >= 3) {
                for (let i = 0; i < shape.points.length; i++) {
                    handles.push({ id: `v${i}`, gx: shape.points[i].x, gy: shape.points[i].y });
                }
            }
            return handles;
        },
        []
    );

    // Hit-test: find if a grid point is near any resize handle (threshold in grid units)
    const findHandleAtPoint = useCallback(
        (gx: number, gy: number, shapeId: string): string | null => {
            const shape = shapes.find((s) => s.id === shapeId);
            if (!shape) return null;
            const handles = getResizeHandles(shape);
            const THRESH = 15; // grid units for hit detection
            for (const h of handles) {
                const dx = gx - h.gx;
                const dy = gy - h.gy;
                if (dx * dx + dy * dy <= THRESH * THRESH) return h.id;
            }
            return null;
        },
        [shapes, getResizeHandles]
    );

    // Apply resize to shape based on handle and mouse position
    const applyResize = useCallback(
        (id: string, handle: string, gx: number, gy: number) => {
            if (!resizeShapeSnapshot) return;
            const snap = resizeShapeSnapshot;
            setShapes((prev) => prev.map((s) => {
                if (s.id !== id) return s;

                if (s.type === 'circle' && snap.type === 'circle' && snap.radius !== undefined) {
                    const dx = gx - snap.x;
                    const dy = gy - snap.y;
                    const newR = Math.max(3, Math.sqrt(dx * dx + dy * dy));
                    return { ...s, radius: newR };
                }

                if (s.type === 'rectangle' && snap.type === 'rectangle'
                    && snap.width !== undefined && snap.height !== undefined) {
                    const x0 = snap.x, y0 = snap.y;
                    const x1 = snap.x + snap.width;
                    const y1 = snap.y + snap.height;
                    let nx0 = x0, ny0 = y0, nx1 = x1, ny1 = y1;

                    // Corners
                    if (handle === 'nw') { nx0 = gx; ny0 = gy; }
                    else if (handle === 'ne') { nx1 = gx; ny0 = gy; }
                    else if (handle === 'sw') { nx0 = gx; ny1 = gy; }
                    else if (handle === 'se') { nx1 = gx; ny1 = gy; }
                    // Edges
                    else if (handle === 'n') { ny0 = gy; }
                    else if (handle === 's') { ny1 = gy; }
                    else if (handle === 'w') { nx0 = gx; }
                    else if (handle === 'e') { nx1 = gx; }

                    const finalX = Math.min(nx0, nx1);
                    const finalY = Math.min(ny0, ny1);
                    const finalW = Math.max(3, Math.abs(nx1 - nx0));
                    const finalH = Math.max(3, Math.abs(ny1 - ny0));
                    return { ...s, x: finalX, y: finalY, width: finalW, height: finalH };
                }

                if (s.type === 'polygon' && snap.type === 'polygon'
                    && snap.points && s.points && handle.startsWith('v')) {
                    const vi = parseInt(handle.slice(1));
                    if (vi >= 0 && vi < snap.points.length) {
                        // Compute centroid of snapshot
                        let cx = 0, cy = 0;
                        for (const pt of snap.points) { cx += pt.x; cy += pt.y; }
                        cx /= snap.points.length;
                        cy /= snap.points.length;
                        // Compute scale factor from old vertex distance to new
                        const oldPt = snap.points[vi];
                        const oldDist = Math.hypot(oldPt.x - cx, oldPt.y - cy);
                        const newDist = Math.hypot(gx - cx, gy - cy);
                        const scale = oldDist > 0.1 ? newDist / oldDist : 1;
                        // Scale all points relative to centroid
                        const newPoints = snap.points.map((pt) => ({
                            x: cx + (pt.x - cx) * scale,
                            y: cy + (pt.y - cy) * scale,
                        }));
                        return { ...s, points: newPoints };
                    }
                }

                return s;
            }));
        },
        [resizeShapeSnapshot]
    );

    // Check for collisions when adding a shape
    const checkCollision = useCallback(
        (newShape: Shape) => {
            for (const existing of shapes) {
                if (existing.id === newShape.id) continue;
                if (shapesOverlap(newShape, existing)) {
                    return `Warning: "${newShape.name}" overlaps "${existing.name}"`;
                }
            }
            return null;
        },
        [shapes]
    );

    // Draw the editor
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        // Clear
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, w, h);

        // Draw grid
        const { scale, offsetX, offsetY } = gridToCanvas(0, 0, w, h);
        ctx.strokeStyle = '#21262d';
        ctx.lineWidth = 1;

        // Vertical grid lines
        const gridStep = Math.max(1, Math.floor(nx / 20));
        for (let x = 0; x <= nx; x += gridStep) {
            const px = offsetX + x * scale;
            ctx.beginPath();
            ctx.moveTo(px, offsetY);
            ctx.lineTo(px, offsetY + ny * scale);
            ctx.stroke();
        }
        // Horizontal grid lines
        const gridStepY = Math.max(1, Math.floor(ny / 20));
        for (let y = 0; y <= ny; y += gridStepY) {
            const py = offsetY + y * scale;
            ctx.beginPath();
            ctx.moveTo(offsetX, py);
            ctx.lineTo(offsetX + nx * scale, py);
            ctx.stroke();
        }

        // Draw domain boundary
        ctx.strokeStyle = '#58a6ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(offsetX, offsetY, nx * scale, ny * scale);

        // Draw placed shapes
        for (const shape of shapes) {
            const isSelected = shape.id === selectedId;
            ctx.fillStyle = isSelected ? 'rgba(88, 166, 255, 0.3)' : 'rgba(139, 148, 158, 0.3)';
            ctx.strokeStyle = isSelected ? '#58a6ff' : '#8b949e';
            ctx.lineWidth = isSelected ? 2 : 1;

            if (shape.type === 'circle' && shape.radius !== undefined) {
                const { px, py } = gridToCanvas(shape.x, shape.y, w, h);
                ctx.beginPath();
                ctx.arc(px, py, shape.radius * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (shape.type === 'rectangle' && shape.width !== undefined && shape.height !== undefined) {
                const { px: x0, py: y0 } = gridToCanvas(shape.x, shape.y, w, h);
                ctx.fillRect(x0, y0, shape.width * scale, shape.height * scale);
                ctx.strokeRect(x0, y0, shape.width * scale, shape.height * scale);
            } else if (shape.type === 'polygon' && shape.points && shape.points.length >= 3) {
                ctx.beginPath();
                const first = gridToCanvas(shape.points[0].x, shape.points[0].y, w, h);
                ctx.moveTo(first.px, first.py);
                for (let i = 1; i < shape.points.length; i++) {
                    const pt = gridToCanvas(shape.points[i].x, shape.points[i].y, w, h);
                    ctx.lineTo(pt.px, pt.py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            // Draw shape name label
            if (shape.type === 'polygon' && shape.points && shape.points.length > 0) {
                let cx = 0, cy = 0;
                for (const pt of shape.points) { cx += pt.x; cy += pt.y; }
                cx /= shape.points.length;
                cy /= shape.points.length;
                const { px: labelX, py: labelY } = gridToCanvas(cx, cy, w, h);
                ctx.fillStyle = '#58a6ff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(shape.name, labelX, labelY);
            } else {
                const { px: labelX, py: labelY } = gridToCanvas(shape.x, shape.y, w, h);
                ctx.fillStyle = '#58a6ff';
                ctx.font = '11px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(shape.name, labelX, labelY);
            }

            // Draw resize handles for selected shape
            if (isSelected) {
                const handles = getResizeHandles(shape);
                for (const handle of handles) {
                    const { px: hx, py: hy } = gridToCanvas(handle.gx, handle.gy, w, h);
                    ctx.fillStyle = '#f0883e';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
            }
        }

        // Draw in-progress shape
        if (isDrawing && drawStart && drawCurrent) {
            ctx.strokeStyle = '#2ea043';
            ctx.fillStyle = 'rgba(46, 160, 67, 0.2)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            if (activeTool === 'circle') {
                const dx = drawCurrent.x - drawStart.x;
                const dy = drawCurrent.y - drawStart.y;
                const r = Math.sqrt(dx * dx + dy * dy);
                const { px, py } = gridToCanvas(drawStart.x, drawStart.y, w, h);
                ctx.beginPath();
                ctx.arc(px, py, r * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            } else if (activeTool === 'rectangle') {
                const x0 = Math.min(drawStart.x, drawCurrent.x);
                const y0 = Math.min(drawStart.y, drawCurrent.y);
                const x1 = Math.max(drawStart.x, drawCurrent.x);
                const y1 = Math.max(drawStart.y, drawCurrent.y);
                const { px, py } = gridToCanvas(x0, y0, w, h);
                ctx.fillRect(px, py, (x1 - x0) * scale, (y1 - y0) * scale);
                ctx.strokeRect(px, py, (x1 - x0) * scale, (y1 - y0) * scale);
            }
            ctx.setLineDash([]);
        }

        // Draw polygon preview
        if (activeTool === 'polygon' && polygonPoints.length > 0) {
            ctx.strokeStyle = '#2ea043';
            ctx.fillStyle = 'rgba(46, 160, 67, 0.2)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            ctx.beginPath();
            const first = gridToCanvas(polygonPoints[0].x, polygonPoints[0].y, w, h);
            ctx.moveTo(first.px, first.py);
            for (let i = 1; i < polygonPoints.length; i++) {
                const pt = gridToCanvas(polygonPoints[i].x, polygonPoints[i].y, w, h);
                ctx.lineTo(pt.px, pt.py);
            }
            if (drawCurrent) {
                const curr = gridToCanvas(drawCurrent.x, drawCurrent.y, w, h);
                ctx.lineTo(curr.px, curr.py);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw vertices
            for (const pt of polygonPoints) {
                const { px, py } = gridToCanvas(pt.x, pt.y, w, h);
                ctx.fillStyle = '#2ea043';
                ctx.beginPath();
                ctx.arc(px, py, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw flow direction arrow
        ctx.fillStyle = '#58a6ff';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Flow ->', offsetX + nx * scale * 0.15, offsetY - 10);
    }, [shapes, selectedId, isDrawing, drawStart, drawCurrent, activeTool, polygonPoints, nx, ny, gridToCanvas, getResizeHandles]);

    useEffect(() => {
        draw();
    }, [draw]);

    // Resize canvas to fill container
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;

        const observer = new ResizeObserver(() => {
            const rect = parent.getBoundingClientRect();
            canvas.width = Math.floor(rect.width);
            canvas.height = Math.floor(rect.height);
            draw();
        });
        observer.observe(parent);
        return () => observer.disconnect();
    }, [draw]);

    const getMouseGrid = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const { gx, gy } = canvasToGrid(px, py, canvas.width, canvas.height);
        return { x: Math.round(gx), y: Math.round(gy) };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pt = getMouseGrid(e);

        // If a shape is selected, check for resize handle hit first
        if (selectedId) {
            const handle = findHandleAtPoint(pt.x, pt.y, selectedId);
            if (handle) {
                const shape = shapes.find((s) => s.id === selectedId);
                if (shape) {
                    setResizingId(selectedId);
                    setResizeHandle(handle);
                    setResizeShapeSnapshot({ ...shape, points: shape.points ? shape.points.map((p) => ({ ...p })) : undefined });
                    return;
                }
            }
        }

        // Check if clicking on an existing shape (for drag-to-move, any tool)
        const hitShape = findShapeAtPoint(pt.x, pt.y);
        if (hitShape) {
            // Select the shape
            setSelectedId(hitShape.id);
            onSelectionChange?.(hitShape.id);
            // Start drag
            setDraggingId(hitShape.id);
            setDragStartGrid(pt);
            return;
        }

        // If move tool is active but clicked empty space, deselect
        if (activeTool === 'move') {
            setSelectedId(null);
            onSelectionChange?.(null);
            return;
        }

        if (activeTool === 'naca') {
            // Place NACA airfoil at click position
            const rawPoints = naca4Airfoil(nacaM, nacaP, nacaT, 80);
            const scaledPoints = transformPoints(rawPoints, pt.x, pt.y, nacaChord, nacaRotation);
            const name = nextShapeName('naca', shapes);
            const newShape: Shape = {
                id: Date.now().toString() + '-' + (++idCounter),
                type: 'polygon',
                name,
                x: pt.x,
                y: pt.y,
                points: scaledPoints,
            };
            const warning = checkCollision(newShape);
            setCollisionWarning(warning);
            const updated = [...shapes, newShape];
            setShapes(updated);
            onGeometryChange(updated);
            return;
        }

        if (activeTool === 'polygon') {
            // Check if clicking near first point to close polygon
            if (polygonPoints.length >= 3) {
                const first = polygonPoints[0];
                const dx = pt.x - first.x;
                const dy = pt.y - first.y;
                if (dx * dx + dy * dy < 100) {
                    // Close polygon
                    const name = nextShapeName('polygon', shapes);
                    const newShape: Shape = {
                        id: Date.now().toString() + '-' + (++idCounter),
                        type: 'polygon',
                        name,
                        x: 0,
                        y: 0,
                        points: [...polygonPoints],
                    };
                    const warning = checkCollision(newShape);
                    setCollisionWarning(warning);
                    const updated = [...shapes, newShape];
                    setShapes(updated);
                    setPolygonPoints([]);
                    onGeometryChange(updated);
                    return;
                }
            }
            setPolygonPoints([...polygonPoints, pt]);
            return;
        }

        setIsDrawing(true);
        setDrawStart(pt);
        setDrawCurrent(pt);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pt = getMouseGrid(e);

        // Handle resize
        if (resizingId && resizeHandle) {
            applyResize(resizingId, resizeHandle, pt.x, pt.y);
            return;
        }

        // Handle drag-to-move
        if (draggingId && dragStartGrid) {
            const dx = pt.x - dragStartGrid.x;
            const dy = pt.y - dragStartGrid.y;
            moveShape(draggingId, dx, dy);
            setDragStartGrid(pt);
            return;
        }

        if (!isDrawing && activeTool !== 'polygon') return;
        setDrawCurrent(pt);
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // Finalize resize
        if (resizingId) {
            setResizingId(null);
            setResizeHandle(null);
            setResizeShapeSnapshot(null);
            return;
        }

        // Finalize drag-to-move
        if (draggingId) {
            setDraggingId(null);
            setDragStartGrid(null);
            return;
        }

        if (!isDrawing || !drawStart) return;
        const pt = getMouseGrid(e);

        if (activeTool === 'circle') {
            const dx = pt.x - drawStart.x;
            const dy = pt.y - drawStart.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            if (radius > 2) {
                const name = nextShapeName('circle', shapes);
                const newShape: Shape = {
                    id: Date.now().toString() + '-' + (++idCounter),
                    type: 'circle',
                    name,
                    x: drawStart.x,
                    y: drawStart.y,
                    radius,
                };
                const warning = checkCollision(newShape);
                setCollisionWarning(warning);
                const updated = [...shapes, newShape];
                setShapes(updated);
                onGeometryChange(updated);
            }
        } else if (activeTool === 'rectangle') {
            const x0 = Math.min(drawStart.x, pt.x);
            const y0 = Math.min(drawStart.y, pt.y);
            const w = Math.abs(pt.x - drawStart.x);
            const h = Math.abs(pt.y - drawStart.y);
            if (w > 2 && h > 2) {
                const name = nextShapeName('rectangle', shapes);
                const newShape: Shape = {
                    id: Date.now().toString() + '-' + (++idCounter),
                    type: 'rectangle',
                    name,
                    x: x0,
                    y: y0,
                    width: w,
                    height: h,
                };
                const warning = checkCollision(newShape);
                setCollisionWarning(warning);
                const updated = [...shapes, newShape];
                setShapes(updated);
                onGeometryChange(updated);
            }
        }

        setIsDrawing(false);
        setDrawStart(null);
        setDrawCurrent(null);
    };

    const clearAll = () => {
        setShapes([]);
        setPolygonPoints([]);
        setSelectedId(null);
        onSelectionChange?.(null);
        setCollisionWarning(null);
        onGeometryChange([]);
    };

    const loadPreset = (preset: string) => {
        let newShapes: Shape[] = [];
        if (preset === 'cylinder') {
            newShapes = [{
                id: '1',
                type: 'circle',
                name: 'Cylinder',
                x: Math.round(nx / 4),
                y: Math.round(ny / 2),
                radius: 30,
            }];
        } else if (preset === 'cavity') {
            // Cavity is handled by case type, not geometry
            return;
        } else if (preset === 'step') {
            newShapes = [{
                id: '1',
                type: 'rectangle',
                name: 'Step',
                x: 0,
                y: 0,
                width: Math.round(nx / 4),
                height: Math.round(ny / 2),
            }];
        } else if (preset === 'naca2412') {
            const rawPoints = naca4Airfoil(0.02, 0.4, 0.12, 80);
            const scaledPoints = transformPoints(rawPoints, Math.round(nx / 4), Math.round(ny / 2), 120, 0);
            newShapes = [{
                id: '1',
                type: 'polygon',
                name: 'NACA 2412',
                x: Math.round(nx / 4),
                y: Math.round(ny / 2),
                points: scaledPoints,
            }];
        } else if (preset === 'naca0012') {
            const rawPoints = naca4Airfoil(0, 0, 0.12, 80);
            const scaledPoints = transformPoints(rawPoints, Math.round(nx / 4), Math.round(ny / 2), 120, 0);
            newShapes = [{
                id: '1',
                type: 'polygon',
                name: 'NACA 0012',
                x: Math.round(nx / 4),
                y: Math.round(ny / 2),
                points: scaledPoints,
            }];
        }
        setShapes(newShapes);
        setCollisionWarning(null);
        onGeometryChange(newShapes);
    };

    // Generate NACA code string for display
    const nacaCode = (() => {
        const mDigit = Math.round(nacaM * 100);
        const pDigit = Math.round(nacaP * 10);
        const tDigit = Math.round(nacaT * 100);
        return `${mDigit}${pDigit}${tDigit.toString().padStart(2, '0')}`;
    })();

    // Cursor style based on current operation
    const cursorStyle = (() => {
        if (resizingId) return 'nwse-resize';
        if (draggingId) return 'grabbing';
        if (activeTool === 'move') return 'grab';
        return 'crosshair';
    })();

    return (
        <div className="geometry-editor">
            <div className="editor-toolbar">
                <div className="tool-group">
                    <button
                        className={`tool-btn ${activeTool === 'circle' ? 'active' : ''}`}
                        onClick={() => { setActiveTool('circle'); setPolygonPoints([]); }}
                        title="Draw Circle"
                    >
                        O
                    </button>
                    <button
                        className={`tool-btn ${activeTool === 'rectangle' ? 'active' : ''}`}
                        onClick={() => { setActiveTool('rectangle'); setPolygonPoints([]); }}
                        title="Draw Rectangle"
                    >
                        []
                    </button>
                    <button
                        className={`tool-btn ${activeTool === 'polygon' ? 'active' : ''}`}
                        onClick={() => setActiveTool('polygon')}
                        title="Draw Polygon (click vertices, click first point to close)"
                    >
                        /_/
                    </button>
                    <button
                        className={`tool-btn ${activeTool === 'naca' ? 'active' : ''}`}
                        onClick={() => { setActiveTool('naca'); setPolygonPoints([]); }}
                        title="Place NACA Airfoil (click to place)"
                    >
                        NACA
                    </button>
                    <button
                        className={`tool-btn ${activeTool === 'move' ? 'active' : ''}`}
                        onClick={() => { setActiveTool('move'); setPolygonPoints([]); }}
                        title="Move shapes (click and drag)"
                    >
                        Move
                    </button>
                </div>
                <div className="tool-group">
                    <button className="tool-btn danger" onClick={clearAll} title="Clear All">
                        Clear
                    </button>
                </div>
            </div>

            {activeTool === 'naca' && (
                <div className="naca-params">
                    <div className="naca-header">
                        <span className="naca-code">NACA {nacaCode}</span>
                    </div>
                    <div className="form-group">
                        <label>Max Camber (m): {nacaM.toFixed(2)}</label>
                        <input
                            type="range"
                            min="0"
                            max="0.09"
                            step="0.01"
                            value={nacaM}
                            onChange={(e) => setNacaM(+e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Camber Position (p): {nacaP.toFixed(1)}</label>
                        <input
                            type="range"
                            min="0"
                            max="0.9"
                            step="0.1"
                            value={nacaP}
                            onChange={(e) => setNacaP(+e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Max Thickness (t): {(nacaT * 100).toFixed(0)}%</label>
                        <input
                            type="range"
                            min="0.01"
                            max="0.40"
                            step="0.01"
                            value={nacaT}
                            onChange={(e) => setNacaT(+e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Chord Length: {nacaChord}</label>
                        <input
                            type="range"
                            min="20"
                            max="200"
                            step="5"
                            value={nacaChord}
                            onChange={(e) => setNacaChord(+e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label>Rotation: {nacaRotation}deg</label>
                        <input
                            type="range"
                            min="-90"
                            max="90"
                            step="5"
                            value={nacaRotation}
                            onChange={(e) => setNacaRotation(+e.target.value)}
                        />
                    </div>
                </div>
            )}

            <div className="editor-presets">
                <span className="preset-label">Presets:</span>
                <button className="preset-btn" onClick={() => loadPreset('cylinder')}>Cylinder</button>
                <button className="preset-btn" onClick={() => loadPreset('step')}>Step</button>
                <button className="preset-btn" onClick={() => loadPreset('naca2412')}>NACA 2412</button>
                <button className="preset-btn" onClick={() => loadPreset('naca0012')}>NACA 0012</button>
            </div>

            <div className="editor-canvas-container">
                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    style={{ cursor: cursorStyle }}
                />
            </div>

            {collisionWarning && (
                <div className="collision-warning">
                    {collisionWarning}
                </div>
            )}

            {activeTool === 'polygon' && polygonPoints.length > 0 && (
                <div className="editor-hint">
                    Click to add points. Click near first point to close polygon.
                    ({polygonPoints.length} points)
                </div>
            )}

            {activeTool === 'naca' && (
                <div className="editor-hint">
                    Click on canvas to place airfoil. Adjust parameters above.
                </div>
            )}

            {activeTool === 'move' && !draggingId && (
                <div className="editor-hint">
                    Click and drag shapes to reposition them.
                </div>
            )}
        </div>
    );
}

export type { Shape, Point };
