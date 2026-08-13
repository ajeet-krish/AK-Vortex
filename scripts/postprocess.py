#!/usr/bin/env python3
"""
AK-Vortex Post-Processor
Reads JSON frame output and produces:
  - PNG renders (contour, streamlines, or split)
  - Strouhal number from force history (Welch FFT)
  - Obstacle overlay (strict black)
  - Pressure contour option

Usage:
    python3 scripts/postprocess.py output/re100
    python3 scripts/postprocess.py output/step_re100 --split --cmap coolwarm
    python3 scripts/postprocess.py output/re100 --last-only
    python3 scripts/postprocess.py output/re100 --strouhal
    python3 scripts/postprocess.py output/re100 --split --cmap jet --strouhal
    python3 scripts/postprocess.py output/ribs_re100 --field pressure
"""

import os, sys, json, re, struct, argparse, subprocess
from pathlib import Path
import numpy as np

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon as MplPolygon
    HAS_MPL = True
except ImportError:
    HAS_MPL = False

try:
    from scipy import signal
    from scipy.ndimage import gaussian_filter
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


# ---------------------------------------------------------------------------
# Binary frame reader
# ---------------------------------------------------------------------------
MAGIC_BIN = 0x4C424D31

def parse_bin_frame(path: str) -> dict:
    """Read a binary frame file and return field data.

    Binary format (little-endian) from export_web_data.py:
      [0..3]   magic        uint32  0x4C424D31 ("LBM1")
      [4..7]   n_frames     uint32  number of frames (for multi-frame files)
      [8..11]  nx           uint32  grid width
      [12..15] ny           uint32  grid height
      [16..19] nChannels    uint32  number of float32 channels (5)
      [20..23] dtypeFlag    uint32  0 = float32, 1 = float16
      [24..]   data         float16[nFrames * nChannels * nx * ny]

    Channel order: [u, v, p, omega, obstacle]

    For single-frame files (n_frames=1), reads one frame.
    For multi-frame files, reads the first frame.
    """
    with open(path, 'rb') as f:
        header = f.read(24)
        magic, n_frames, nx, ny, n_channels, dtype_flag = struct.unpack('<6I', header)

        if magic != MAGIC_BIN:
            raise ValueError(f"Bad magic: 0x{magic:08x}")

        n = nx * ny
        if dtype_flag == 0:
            # float32
            data = np.frombuffer(f.read(n_channels * n * 4), dtype=np.float32)
        elif dtype_flag == 1:
            # float16 stored as uint16
            raw16 = np.frombuffer(f.read(n_channels * n * 2), dtype=np.uint16)
            data = raw16.view(np.float16).astype(np.float32)
        else:
            raise ValueError(f"Unsupported dtype: {dtype_flag}")

        # Split into channels (first frame only)
        u = data[0*n:1*n].reshape(ny, nx)
        v = data[1*n:2*n].reshape(ny, nx)
        p = data[2*n:3*n].reshape(ny, nx)
        omega = data[3*n:4*n].reshape(ny, nx)
        obstacle = data[4*n:5*n].reshape(ny, nx)

        # Compute velocity magnitude
        velocity = np.sqrt(u**2 + v**2)

        # Compute density (incompressible: rho ~ 1.0)
        rho = np.ones_like(u)

        return {
            'nx': nx, 'ny': ny,
            'u': u, 'v': v, 'rho': rho, 'p': p,
            'omega': omega, 'obstacle': obstacle,
            'velocity': velocity,
        }


def parse_json_frame(path: str) -> dict:
    """Read a JSON frame file and return field data."""
    with open(path) as f:
        data = json.load(f)

    nx = int(data.get('nx', 0))
    ny = int(data.get('ny', 0))

    result = {
        'nx': nx, 'ny': ny,
        'u': np.array(data.get('u', data.get('velocity', []))).reshape(ny, nx),
        'v': np.array(data.get('v', [])).reshape(ny, nx),
        'rho': np.array(data.get('rho', [])).reshape(ny, nx),
        'p': np.array(data.get('p', [])).reshape(ny, nx),
        'omega': np.array(data.get('omega', [])).reshape(ny, nx),
        'obstacle': np.array(data.get('obstacle', [])).reshape(ny, nx),
        'velocity': np.array(data.get('velocity', [])).reshape(ny, nx),
    }

    # Preserve obstacle_meta (circles/rectangles/polygons from C++ solver)
    obstacle_meta = data.get('obstacle_meta')
    if obstacle_meta:
        result['obstacle_meta'] = obstacle_meta

    return result


# ---------------------------------------------------------------------------
# Per-case colormap configuration
# ---------------------------------------------------------------------------
CASE_CMAPS = {
    'cylinder':              ('jet', 'jet'),
    'cavity':                ('jet', 'jet'),
    'lid-driven-cavity':     ('jet', 'jet'),
    'backward-facing-step':  ('jet', 'jet'),
    'ribbed-channel':        ('jet', 'jet'),
    'urban-canyon':          ('jet', 'jet'),
    'urban-side':            ('jet', 'jet'),
    'urban-topdown':         ('jet', 'jet'),
    'building-downwash':     ('jet', 'jet'),
    'flat-plate':            ('jet', 'jet'),
    'square-cylinder':       ('jet', 'jet'),
    'periodic-hills':        ('jet', 'jet'),
    'cylinder-near-wall':    ('jet', 'jet'),
    'side-by-side':          ('jet', 'jet'),
    'rotating-cylinder':     ('jet', 'jet'),
    'orifice-plate':         ('jet', 'jet'),
}

# Detect shape type from meta.json or directory name
def _detect_shape(meta, output_dir=None):
    st = meta.get('shape_type', '')
    if st:
        return st if st else 'cylinder'
    # Fallback: infer from directory name
    if output_dir:
        dname = os.path.basename(output_dir)
        pname = os.path.basename(os.path.dirname(output_dir))
        # Check parent directory for case type
        if pname == 'cylinder':
            return 'cylinder'
        if pname == 'step':
            return 'backward-facing-step'
        if pname == 'ribs':
            return 'ribbed-channel'
        if pname == 'ahmed_body':
            return 'ahmed-body'
        if pname == 'downwash':
            return 'building-downwash'
        if pname == 'cavity':
            return 'cavity'
        if pname == 'flatplate':
            return 'flat-plate'
        if pname == 'square_cylinder':
            return 'square-cylinder'
        if pname == 'periodic_hills':
            return 'periodic-hills'
        if pname == 'cylinder_near_wall':
            return 'cylinder-near-wall'
        if pname == 'side_by_side':
            return 'side-by-side'
        if pname == 'rotating_cylinder':
            return 'rotating-cylinder'
        if pname == 'orifice_plate':
            return 'orifice-plate'
        if pname == 'urban':
            if 'side' in dname:
                return 'urban-side'
            if 'downwash' in dname:
                return 'building-downwash'
            return 'urban-canyon'
        # New nested paths under urban/
        if pname == 'side':
            return 'urban-side'
        if pname == 'topdown_v':
            return 'urban-topdown'
        if pname == 'topdown_h':
            return 'urban-topdown'
        if pname == 'city_grid':
            return 'urban-canyon'
        # Legacy flat directory names
        if 'urban_side' in dname:
            return 'urban-side'
        if 'urban_topdown' in dname:
            return 'urban-topdown'
        if 'cylinder' not in dname and 'step' in dname:
            return 'backward-facing-step'
        if 'ribs' in dname:
            return 'ribbed-channel'
        if 'urban' in dname:
            return 'urban-canyon'
        if 'downwash' in dname:
            return 'building-downwash'
        if 'flatplate' in dname:
            return 'flat-plate'
        if 'square_cylinder' in dname:
            return 'square-cylinder'
        if 'periodic_hills' in dname:
            return 'periodic-hills'
        if 'cylinder_near_wall' in dname:
            return 'cylinder-near-wall'
        if 'side_by_side' in dname:
            return 'side-by-side'
        if 'rotating_cylinder' in dname:
            return 'rotating-cylinder'
        if 'cavity' in dname:
            return 'cavity'
    return 'cylinder'
DEFAULT_CMAP = 'jet'


def _load_meta(output_dir):
    path = os.path.join(output_dir, 'meta.json')
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def _list_frames(output_dir):
    """List frame files, preferring binary over JSON when both exist."""
    frames_dir = os.path.join(output_dir, 'frames')
    if not os.path.isdir(frames_dir):
        return []

    # Collect both JSON and binary frames
    json_files = list(Path(frames_dir).glob('frame_*.json'))
    bin_files = list(Path(frames_dir).glob('frame_*.bin'))

    # Build a dict: step -> path (prefer binary)
    frames = {}
    for p in json_files:
        m = re.search(r'frame_(\d+)', p.name)
        if m:
            step = int(m.group(1))
            frames[step] = p
    for p in bin_files:
        m = re.search(r'frame_(\d+)', p.name)
        if m:
            step = int(m.group(1))
            frames[step] = p  # binary overrides JSON

    result = sorted(frames.values(), key=lambda p: int(re.search(r'frame_(\d+)', p.name).group(1)))
    return result


def _load_frame(path):
    """Load a frame from either binary or JSON format, preferring binary.

    Binary frames do not contain obstacle_meta (circles/rectangles/polygons).
    When loading a binary frame, the corresponding JSON frame is read to
    extract obstacle_meta so that vector-geometry overlays render correctly.
    """
    path_str = str(path)
    if path_str.endswith('.bin'):
        result = parse_bin_frame(path_str)
        # Merge obstacle_meta from the corresponding JSON frame
        json_path = path_str[:-4] + '.json'  # .bin -> .json
        if os.path.exists(json_path):
            try:
                with open(json_path) as f:
                    json_data = json.load(f)
                obstacle_meta = json_data.get('obstacle_meta')
                if obstacle_meta:
                    result['obstacle_meta'] = obstacle_meta
            except (json.JSONDecodeError, KeyError, OSError):
                pass
        return result
    else:
        return parse_json_frame(path_str)


def _load_frame_safe(path):
    try:
        return _load_frame(path)
    except (json.JSONDecodeError, KeyError, ValueError, struct.error):
        return None


def _resolve_cmap(cmap_arg, meta, output_dir='', field='velocity'):
    if cmap_arg:
        return cmap_arg
    shape = _detect_shape(meta, output_dir)
    pair = CASE_CMAPS.get(shape, (DEFAULT_CMAP, DEFAULT_CMAP))
    return pair[0]


def _resolve_stream_cmap(cmap_arg, meta, output_dir=''):
    if cmap_arg:
        return cmap_arg
    shape = _detect_shape(meta, output_dir)
    pair = CASE_CMAPS.get(shape, (DEFAULT_CMAP, DEFAULT_CMAP))
    return pair[1]


# ---------------------------------------------------------------------------
# Obstacle overlay helper
# ---------------------------------------------------------------------------
OBSTACLE_COLOR = '#000000'  # strict black
OBSTACLE_EDGE_COLOR = 'white'
OBSTACLE_LINEWIDTH = 0.8

# Obstacle registry: maps case names to geometry definitions
# Each entry: { 'type': 'circle'|'rectangle'|'polygon'|'buildings',
#               'params': {...} } or a function returning the geometry
OBSTACLE_REGISTRY = {
    'cylinder': lambda nx, ny: [{'type': 'circle', 'cx': nx/4, 'cy': ny/2+1, 'r': min(nx,ny)*0.0375}],
    'backward-facing-step': lambda nx, ny: [{'type': 'rectangle', 'x0': 0, 'y0': 0, 'w': nx/4, 'h': ny/3}],
    'cavity': lambda nx, ny: [],  # walls only, no internal obstacle
}

def _draw_circle_patch(ax, cx, cy, r, nx, ny):
    """Draw a crisp circle obstacle overlay."""
    from matplotlib.patches import Circle
    circle = Circle((cx, cy), r, facecolor=OBSTACLE_COLOR, edgecolor=OBSTACLE_EDGE_COLOR,
                     linewidth=OBSTACLE_LINEWIDTH, zorder=5)
    ax.add_patch(circle)

def _draw_rectangle_patch(ax, x0, y0, w, h, nx, ny):
    """Draw a crisp rectangle obstacle overlay."""
    from matplotlib.patches import Rectangle
    rect = Rectangle((x0, y0), w, h, facecolor=OBSTACLE_COLOR, edgecolor=OBSTACLE_EDGE_COLOR,
                      linewidth=OBSTACLE_LINEWIDTH, zorder=5)
    ax.add_patch(rect)

def _draw_polygon_patch(ax, vertices, nx, ny):
    """Draw a crisp polygon obstacle overlay."""
    from matplotlib.patches import Polygon
    poly = Polygon(vertices, closed=True, facecolor=OBSTACLE_COLOR, edgecolor=OBSTACLE_EDGE_COLOR,
                   linewidth=OBSTACLE_LINEWIDTH, zorder=5)
    ax.add_patch(poly)

def _read_obstacle_meta(frame_data):
    """Extract geometry list from obstacle_meta in frame data.

    Returns a list of dicts with keys matching the C++ solver output:
      circles:    [{'cx', 'cy', 'r'}, ...]
      rectangles: [{'x0', 'y0', 'w', 'h'}, ...]
      polygons:   [{'vertices': [[x,y], ...]}, ...]

    Returns None if no usable geometry is found.
    """
    meta = frame_data.get('obstacle_meta')
    if not meta or not isinstance(meta, dict):
        return None

    geometry = []

    for c in meta.get('circles', []):
        geometry.append({
            'type': 'circle',
            'cx': float(c['cx']),
            'cy': float(c['cy']),
            'r': float(c['r']),
        })

    for r in meta.get('rectangles', []):
        geometry.append({
            'type': 'rectangle',
            'x0': float(r['x0']),
            'y0': float(r['y0']),
            'w': float(r['w']),
            'h': float(r['h']),
        })

    for p in meta.get('polygons', []):
        geometry.append({
            'type': 'polygon',
            'vertices': p['vertices'],
        })

    return geometry if geometry else None


def _extract_obstacle_contour(obstacle_mask, nx, ny):
    """Extract smooth obstacle boundary from binary mask using contour.

    Fallback when obstacle_meta is not available. Uses matplotlib contour
    to extract a smooth boundary from the binary obstacle mask, producing
    a vector PathPatch instead of a blocky pixel overlay.
    """
    from matplotlib.path import Path
    from matplotlib.patches import PathPatch

    fig_tmp, ax_tmp = plt.subplots()
    obs_float = obstacle_mask.astype(float)
    if HAS_SCIPY:
        obs_smooth = gaussian_filter(obs_float, sigma=2.0)
    else:
        obs_smooth = obs_float
    cs = ax_tmp.contour(obs_smooth, levels=[0.5])
    plt.close(fig_tmp)

    paths = []
    for collection in cs.collections:
        for p in collection.get_paths():
            vertices = p.vertices
            codes = p.codes
            if codes is not None:
                paths.append(Path(vertices, codes))
            else:
                paths.append(Path(vertices))

    if not paths:
        return None

    combined = paths[0]
    for p in paths[1:]:
        combined = Path.make_compound_path(combined, p)

    return PathPatch(combined, facecolor=OBSTACLE_COLOR, edgecolor=OBSTACLE_EDGE_COLOR,
                     linewidth=OBSTACLE_LINEWIDTH, zorder=5)


def _overlay_obstacles(ax, obstacle_mask, nx=None, ny=None, geometry=None):
    """Draw obstacle regions with vector-geometry patches for crisp rendering.

    Priority:
      1. obstacle_meta geometry (exact circles/rectangles/polygons)
      2. Contour-based smooth boundary extraction from binary mask
      3. Ultimate fallback: pixel mask overlay
    """
    if geometry:
        # Use vector-geometry patches for crisp rendering
        for geom in geometry:
            gtype = geom.get('type', '')
            if gtype == 'circle':
                _draw_circle_patch(ax, geom['cx'], geom['cy'], geom['r'],
                                   nx or 800, ny or 300)
            elif gtype == 'rectangle':
                _draw_rectangle_patch(ax, geom['x0'], geom['y0'], geom['w'], geom['h'],
                                      nx or 800, ny or 300)
            elif gtype == 'polygon':
                _draw_polygon_patch(ax, geom['vertices'], nx or 800, ny or 300)
    elif obstacle_mask is not None and obstacle_mask.size > 0:
        # Try contour-based smooth boundary first
        patch = _extract_obstacle_contour(obstacle_mask, nx or 800, ny or 300)
        if patch:
            ax.add_patch(patch)
        else:
            # Ultimate fallback: pixel mask overlay
            obs = np.ma.masked_where(~obstacle_mask, np.ones_like(obstacle_mask, dtype=float))
            ax.imshow(obs, origin='lower', cmap='gray_r', aspect='auto',
                      vmin=0, vmax=1, alpha=1.0,
                      interpolation='nearest')


# ---------------------------------------------------------------------------
# PNG rendering
# ---------------------------------------------------------------------------
def render_contour(ax, vel, cmap, vmin, vmax, obstacle=None, geometry=None, dpi=300):
    """Render field data using contourf for smooth, high-quality contours.

    Uses 256 contour levels for smooth color transitions, with optional
    thin contour lines for visual definition. Obstacle regions are masked.
    """
    ny, nx = vel.shape

    # Create coordinate arrays
    x = np.linspace(0, nx, nx)
    y = np.linspace(0, ny, ny)

    # Mask obstacle regions
    if obstacle is not None and obstacle.size > 0:
        obs_bool = obstacle > 0.5 if obstacle.dtype != bool else obstacle
        field_masked = np.ma.masked_where(obs_bool, vel)
    else:
        field_masked = vel

    # Generate smooth contour levels
    levels = np.linspace(vmin, vmax, 256)

    # Use contourf for smooth contours
    im = ax.contourf(x, y, field_masked, levels=levels, cmap=cmap, origin='lower')

    # Add thin contour lines for visual definition (every 10th level)
    ax.contour(x, y, field_masked, levels=levels[::10], colors='black',
               linewidths=0.1, alpha=0.3)

    ax.set_box_aspect(ny / nx)
    _overlay_obstacles(ax, obstacle, nx, ny, geometry)
    ax.axis('off')
    ax.set_facecolor('white')
    return im


def render_streamlines(ax, u, v, cmap, obstacle=None, geometry=None, density=1.0):
    ny, nx_grid = u.shape
    yg, xg = np.mgrid[0:ny, 0:nx_grid]
    step = max(1, nx_grid // 50)
    vel_mag = np.sqrt(u[::step, ::step]**2 + v[::step, ::step]**2)
    sp = ax.streamplot(xg[::step, ::step], yg[::step, ::step],
                       u[::step, ::step], v[::step, ::step],
                       color=vel_mag,
                       cmap=cmap, density=density, linewidth=0.8, arrowsize=0.8)
    _overlay_obstacles(ax, obstacle, nx_grid, ny, geometry)
    ax.axis('off')
    ax.set_aspect('equal')
    ax.set_box_aspect(ny / nx_grid)
    ax.set_facecolor('white')
    return sp, vel_mag


def save_png_combined(data, output_dir, frame, cmap_contour, cmap_stream, field='velocity', dpi=300):
    vel = np.array(data[field])
    u = np.array(data['u'])
    v = np.array(data['v'])
    obs = np.array(data.get('obstacle', []))
    if obs.ndim == 1 and obs.size > 0:
        obs = obs.reshape(data['ny'], data['nx'])
    if vel.ndim == 1:
        vel = vel.reshape(data['ny'], data['nx'])
    if u.ndim == 1:
        u = u.reshape(data['ny'], data['nx'])
    if v.ndim == 1:
        v = v.reshape(data['ny'], data['nx'])

    geometry = _read_obstacle_meta(data)

    field_label = 'Pressure' if field == 'rho' else 'Velocity Magnitude'
    vmax_val = max(vel.max(), 0.01)
    vmin_val = vel.min() if field == 'rho' else 0

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 5))
    fig.patch.set_facecolor('white')

    im = render_contour(ax1, vel, cmap_contour, vmin_val, vmax_val, obs, geometry=geometry, dpi=dpi)
    cbar1 = plt.colorbar(im, ax=ax1, shrink=0.8)
    cbar1.set_label('|V| (lattice units)', color='black')

    sp, smag = render_streamlines(ax2, u, v, cmap_stream, obs, geometry=geometry)
    if sp and smag.size > 0:
        cbar2 = plt.colorbar(sp.lines, ax=ax2, shrink=0.8)
        cbar2.set_label('|V| (lattice units)', color='black')

    plt.tight_layout()
    path = os.path.join(output_dir, f'frame_{int(frame):04d}.png')
    plt.savefig(path, dpi=dpi, facecolor='white', edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"  Saved {path}")


def save_png_split(data, output_dir, frame, cmap_contour, cmap_stream, field='velocity', dpi=300):
    vel = np.array(data[field])
    u = np.array(data['u'])
    v = np.array(data['v'])
    obs = np.array(data.get('obstacle', []))
    if obs.ndim == 1 and obs.size > 0:
        obs = obs.reshape(data['ny'], data['nx'])
    if vel.ndim == 1:
        vel = vel.reshape(data['ny'], data['nx'])
    if u.ndim == 1:
        u = u.reshape(data['ny'], data['nx'])
    if v.ndim == 1:
        v = v.reshape(data['ny'], data['nx'])

    geometry = _read_obstacle_meta(data)

    field_label = 'Pressure' if field == 'rho' else 'Velocity Magnitude'
    vmax_val = max(vel.max(), 0.01)
    vmin_val = vel.min() if field == 'rho' else 0

    # Contour
    ny_data, nx_data = vel.shape
    fig, ax = plt.subplots(1, 1, figsize=(10, max(3, 10 * ny_data / nx_data)))
    fig.patch.set_facecolor('white')
    im = render_contour(ax, vel, cmap_contour, vmin_val, vmax_val, obs, geometry=geometry, dpi=dpi)
    cbar = plt.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label('|V| (lattice units)', color='black')
    plt.tight_layout(pad=0.5)
    fig.subplots_adjust(right=0.92)
    path = os.path.join(output_dir, f'contour_{int(frame):04d}.png')
    plt.savefig(path, dpi=dpi, facecolor='white', edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"  Saved {path}")

    # Streamlines
    ny_data, nx_data = u.shape
    fig, ax = plt.subplots(1, 1, figsize=(10, max(3, 10 * ny_data / nx_data)))
    fig.patch.set_facecolor('white')
    sp, smag = render_streamlines(ax, u, v, cmap_stream, obs, geometry=geometry)
    if sp and smag.size > 0:
        cbar = plt.colorbar(sp.lines, ax=ax, shrink=0.8)
        cbar.set_label('|V| (lattice units)', color='black')
    plt.tight_layout(pad=0.5)
    fig.subplots_adjust(right=0.92)
    path = os.path.join(output_dir, f'streamlines_{int(frame):04d}.png')
    plt.savefig(path, dpi=dpi, facecolor='white', edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"  Saved {path}")


# ---------------------------------------------------------------------------
# Video overlay rendering (contour + streamlines on same axes)
# ---------------------------------------------------------------------------
def render_video_overlay(data, output_dir, frame, cmap, field='velocity', dpi=300):
    vel = np.array(data[field])
    u = np.array(data['u'])
    v = np.array(data['v'])
    obs = np.array(data.get('obstacle', []))
    if obs.ndim == 1 and obs.size > 0:
        obs = obs.reshape(data['ny'], data['nx'])
    if vel.ndim == 1:
        vel = vel.reshape(data['ny'], data['nx'])
    if u.ndim == 1:
        u = u.reshape(data['ny'], data['nx'])
    if v.ndim == 1:
        v = v.reshape(data['ny'], data['nx'])

    geometry = _read_obstacle_meta(data)

    vmax_val = max(vel.max(), 0.01)
    vmin_val = 0

    ny, nx = vel.shape
    x = np.linspace(0, nx, nx)
    y = np.linspace(0, ny, ny)

    fig, ax = plt.subplots(1, 1, figsize=(10, 5))
    fig.patch.set_facecolor('white')

    # Mask obstacle regions for contourf
    if obs is not None and obs.size > 0:
        obs_bool = obs > 0.5 if obs.dtype != bool else obs
        vel_masked = np.ma.masked_where(obs_bool, vel)
    else:
        vel_masked = vel

    levels = np.linspace(vmin_val, vmax_val, 256)
    im = ax.contourf(x, y, vel_masked, levels=levels, cmap=cmap, origin='lower')
    _overlay_obstacles(ax, obs, nx, ny, geometry)

    yg, xg = np.mgrid[0:ny, 0:nx]
    step = max(1, nx // 50)
    vel_mag = np.sqrt(u[::step, ::step]**2 + v[::step, ::step]**2)
    ax.streamplot(xg[::step, ::step], yg[::step, ::step],
                  u[::step, ::step], v[::step, ::step],
                  color=vel_mag,
                  cmap=cmap, density=1.0, linewidth=0.8, arrowsize=0.8)

    ax.axis('off')
    ax.set_facecolor('white')

    cbar = plt.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label('|V| (lattice units)', color='black')

    plt.tight_layout(pad=0.5)
    fig.subplots_adjust(right=0.92)
    path = os.path.join(output_dir, f'vid_{int(frame):04d}.png')
    plt.savefig(path, dpi=dpi, facecolor='white', edgecolor='none', bbox_inches='tight')
    plt.close()


def make_video(output_dir):
    vid_pattern = os.path.join(output_dir, 'vid_*.png')
    output_path = os.path.join(output_dir, 'simulation.mp4')
    cmd = [
        'ffmpeg', '-y', '-framerate', '15',
        '-pattern_type', 'glob', '-i', vid_pattern,
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-preset', 'medium', '-crf', '18',
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  Video saved: {output_path}")
        # Clean up individual frames
        for f in Path(output_dir).glob('vid_*.png'):
            f.unlink()
    else:
        print(f"  ffmpeg error: {result.stderr}")


# ---------------------------------------------------------------------------
# Strouhal computation (Welch FFT on forces.jsonl)
# ---------------------------------------------------------------------------
def compute_strouhal(output_dir):
    forces_path = os.path.join(output_dir, 'forces.jsonl')
    if not os.path.exists(forces_path):
        print("  No forces.jsonl found, skipping Strouhal")
        return None

    meta = _load_meta(output_dir)
    re_val = meta.get('re', 0)
    u_inflow = meta.get('u_inflow', 0.1)
    length_scale = meta.get('length_scale', 1.0)

    steps, cl_vals = [], []
    with open(forces_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            steps.append(rec['step'])
            cl_vals.append(rec['cl'])

    cl = np.array(cl_vals)
    n = len(cl)

    trim = n // 5
    cl_trimmed = cl[trim:]
    steps_trimmed = np.array(steps[trim:])

    if len(cl_trimmed) < 64:
        print(f"  Too few samples ({len(cl_trimmed)}) for Welch FFT, skipping")
        return None

    if not HAS_SCIPY:
        print("  scipy not installed, skipping Strouhal")
        return None

    nperseg = min(len(cl_trimmed) // 4, 16384)
    if nperseg < 8:
        nperseg = len(cl_trimmed) // 4
    if nperseg < 4:
        return None

    f, psd = signal.welch(cl_trimmed - cl_trimmed.mean(),
                          fs=1.0,
                          nperseg=nperseg,
                          window='hann',
                          noverlap=nperseg // 2)

    if u_inflow > 0 and length_scale > 0:
        f_min = 0.01 * u_inflow / length_scale
        f_max = 0.5 * u_inflow / length_scale
    else:
        f_min, f_max = 1e-5, 0.1

    mask = (f >= f_min) & (f <= f_max)
    if not mask.any():
        print(f"  No peaks in frequency range [{f_min:.6f}, {f_max:.6f}]")
        return None

    f_band = f[mask]
    psd_band = psd[mask]
    idx_peak = np.argmax(psd_band)
    f_peak = f_band[idx_peak]

    st = f_peak * length_scale / u_inflow if u_inflow > 0 else 0

    print(f"  Strouhal = {st:.4f} (f_peak = {f_peak:.6f}, Re = {re_val})")

    meta['strouhal'] = st
    if len(cl_trimmed) > 100:
        meta['cl_amplitude'] = float(np.std(cl_trimmed))
        cd_vals = []
        with open(forces_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                cd_vals.append(rec['cd'])
        meta['cd_mean'] = float(np.mean(np.array(cd_vals)[trim:]))

    meta_path = os.path.join(output_dir, 'meta.json')
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    print(f"  Updated {meta_path}")

    return st


# ---------------------------------------------------------------------------
# Vorticity rendering (RdBu symmetric colormap)
# ---------------------------------------------------------------------------
def save_vorticity_png(data, output_dir, frame, dpi=300):
    omega = np.array(data.get('omega', []))
    obs = np.array(data.get('obstacle', []))
    if omega.ndim == 0 or omega.size == 0:
        print(f"  No omega field in frame {frame}, skipping")
        return
    if omega.ndim == 1:
        omega = omega.reshape(data['ny'], data['nx'])
    if obs.ndim == 1 and obs.size > 0:
        obs = obs.reshape(data['ny'], data['nx'])

    geometry = _read_obstacle_meta(data)

    # Symmetric limits around 0
    vmax = max(abs(omega.max()), abs(omega.min()), 1e-6)

    ny_data, nx_data = omega.shape
    fig, ax = plt.subplots(1, 1, figsize=(10, max(3, 10 * ny_data / nx_data)))
    fig.patch.set_facecolor('white')
    im = render_contour(ax, omega, 'RdBu', -vmax, vmax, obs, geometry=geometry, dpi=dpi)
    cbar = plt.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label('Vorticity', color='black')
    plt.tight_layout(pad=0.5)
    fig.subplots_adjust(right=0.92)
    path = os.path.join(output_dir, f'vorticity_{int(frame):04d}.png')
    plt.savefig(path, dpi=dpi, facecolor='white', edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"  Saved {path}")


def save_mesh_png(data, output_dir, frame, meta=None, dpi=300):
    """Render the computational grid: cell edges + obstacle boundaries.

    Draws a wireframe of the lattice grid with:
    - Thin gray lines for interior cell edges (alpha=0.15)
    - Thick black lines for domain boundaries
    - Red lines for obstacle boundaries (where fluid meets solid)
    - Colored patches for obstacle regions
    """
    ny_data = data['ny']
    nx_data = data['nx']
    obs = np.array(data.get('obstacle', []))
    if obs.ndim == 1 and obs.size > 0:
        obs = obs.reshape(ny_data, nx_data)
    else:
        obs = np.zeros((ny_data, nx_data), dtype=bool)

    fig, ax = plt.subplots(1, 1, figsize=(10, max(3, 10 * ny_data / nx_data)))
    fig.patch.set_facecolor('white')

    # Draw faint interior cell edges
    # Skip some lines if grid is very large to keep file size reasonable
    skip_x = max(1, nx_data // 200)
    skip_y = max(1, ny_data // 200)

    for x in range(0, nx_data + 1, skip_x):
        ax.axvline(x - 0.5, color='gray', linewidth=0.3, alpha=0.15)
    for y in range(0, ny_data + 1, skip_y):
        ax.axhline(y - 0.5, color='gray', linewidth=0.3, alpha=0.15)

    # Draw domain boundary (thick black)
    ax.plot([-0.5, nx_data - 0.5, nx_data - 0.5, -0.5, -0.5],
            [-0.5, -0.5, ny_data - 0.5, ny_data - 0.5, -0.5],
            color='black', linewidth=1.5)

    # Draw obstacle boundaries (red edges where fluid meets solid)
    # Find obstacle boundary cells: obstacle cells adjacent to fluid
    obs_bool = obs > 0.5
    for y in range(ny_data):
        for x in range(nx_data):
            if not obs_bool[y, x]:
                continue
            # Check 4 neighbors
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx2, ny2 = x + dx, y + dy
                if 0 <= nx2 < nx_data and 0 <= ny2 < ny_data:
                    if not obs_bool[ny2, nx2]:
                        # This is a boundary edge
                        if dx == -1:  # fluid to the left
                            ax.plot([x - 0.5, x - 0.5], [y - 0.5, y + 0.5],
                                    color='red', linewidth=0.8, alpha=0.7)
                        elif dx == 1:  # fluid to the right
                            ax.plot([x + 0.5, x + 0.5], [y - 0.5, y + 0.5],
                                    color='red', linewidth=0.8, alpha=0.7)
                        elif dy == -1:  # fluid below
                            ax.plot([x - 0.5, x + 0.5], [y - 0.5, y - 0.5],
                                    color='red', linewidth=0.8, alpha=0.7)
                        elif dy == 1:  # fluid above
                            ax.plot([x - 0.5, x + 0.5], [y + 0.5, y + 0.5],
                                    color='red', linewidth=0.8, alpha=0.7)

    # Overlay obstacle regions as light gray patches
    obs_mask = np.ma.masked_where(~obs_bool, np.ones_like(obs_bool, dtype=float))
    ax.imshow(obs_mask, origin='lower', cmap='gray_r', aspect='equal',
              vmin=0, vmax=1, alpha=0.3, interpolation='nearest',
              extent=[-0.5, nx_data - 0.5, -0.5, ny_data - 0.5])

    ax.set_xlim(-1, nx_data)
    ax.set_ylim(-1, ny_data)
    ax.set_aspect('equal')
    ax.set_box_aspect(ny_data / nx_data)
    ax.set_xlabel('x (lattice units)')
    ax.set_ylabel('y (lattice units)')
    ax.set_title(f'Computational Grid ({nx_data}x{ny_data})', fontsize=10)
    ax.grid(False)

    plt.tight_layout(pad=0.5)
    path = os.path.join(output_dir, f'mesh_{int(frame):04d}.png')
    plt.savefig(path, dpi=dpi, facecolor='white', edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"  Saved {path}")


def save_cp_png(data, output_dir, frame, meta=None, dpi=300):
    """Pressure coefficient Cp = (p - p_ref) / (0.5 * rho_inf * U_inf^2)
    Obstacle cells (rho=0) are masked as NaN and rendered transparent.
    Color range auto-scaled to fluid cell percentile range.
    """
    rho = np.array(data.get('rho', []))
    obs = np.array(data.get('obstacle', []))
    if rho.ndim == 0 or rho.size == 0:
        print(f"  No rho field in frame {frame}, skipping Cp")
        return
    if rho.ndim == 1:
        rho = rho.reshape(data['ny'], data['nx'])
    if obs.ndim == 1 and obs.size > 0:
        obs = obs.reshape(data['ny'], data['nx'])
    else:
        obs = np.zeros_like(rho, dtype=bool)

    geometry = _read_obstacle_meta(data)

    # Reference values from meta or defaults
    if meta:
        u_inf = float(meta.get('u_inflow', meta.get('u_ref', 0.1)))
        rho_inf = float(meta.get('rho_inf', 1.0))
    else:
        u_inf = 0.1
        rho_inf = 1.0

    # In lattice units: p = rho / 3 (cs^2 = 1/3)
    p = rho / 3.0
    p_ref = 1.0 / 3.0  # quiescent reference at rho=1.0
    q_inf = 0.5 * rho_inf * u_inf * u_inf
    cp = (p - p_ref) / max(q_inf, 1e-12)

    # Mask obstacle cells (rho=0 gives extreme Cp)
    fluid_mask = obs < 0.5
    cp_fluid = cp[fluid_mask]

    if cp_fluid.size == 0:
        print(f"  No fluid cells in frame {frame}, skipping Cp")
        return

    # Auto-scale to fluid percentiles, symmetric around 0
    cp_lo = np.percentile(cp_fluid, 2)
    cp_hi = np.percentile(cp_fluid, 98)
    cp_abs = max(abs(cp_lo), abs(cp_hi), 0.5)

    cp_masked = np.ma.masked_where(~fluid_mask, cp)
    cp_clip = np.clip(cp_masked, -cp_abs, cp_abs)

    # Adaptive figsize matching data aspect ratio
    ny, nx = cp_clip.shape
    fig, ax = plt.subplots(1, 1, figsize=(10, max(3, 10 * ny / nx)))
    fig.patch.set_facecolor('white')
    im = render_contour(ax, cp_clip, 'RdBu', -cp_abs, cp_abs, obs, geometry=geometry, dpi=dpi)
    cbar = plt.colorbar(im, ax=ax, shrink=0.8)
    cbar.set_label('Pressure Coefficient Cp', color='black')
    plt.tight_layout(pad=0.5)
    fig.subplots_adjust(right=0.92)
    path = os.path.join(output_dir, f'cp_{int(frame):04d}.png')
    plt.savefig(path, dpi=dpi, facecolor='white', edgecolor='none', bbox_inches='tight')
    plt.close()
    print(f"  Saved {path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description='AK-Vortex Post-Processor')
    parser.add_argument('input_dir', help='Output directory (e.g. output/re100)')
    parser.add_argument('--split', action='store_true',
                        help='Render contour and streamlines as separate PNGs')
    parser.add_argument('--cmap', default=None,
                        help='Colormap override (jet, coolwarm, viridis, plasma, RdBu)')
    parser.add_argument('--last-only', action='store_true',
                        help='Only render the last frame')
    parser.add_argument('--strouhal', action='store_true',
                        help='Compute Strouhal from forces.jsonl')
    parser.add_argument('--vorticity', action='store_true',
                        help='Render vorticity (omega) field')
    parser.add_argument('--cp', action='store_true',
                        help='Render pressure coefficient Cp field')
    parser.add_argument('--field', default='velocity',
                        choices=['velocity', 'pressure'],
                        help='Field to render as contour (velocity or pressure)')
    parser.add_argument('--friction', action='store_true',
                        help='Print friction factor from meta.json (ribbed channel)')
    parser.add_argument('--video', action='store_true',
                        help='Render overlay video (contour + streamlines on same frame)')
    parser.add_argument('--mesh', action='store_true',
                        help='Render computational grid (cell edges + obstacle boundaries)')
    parser.add_argument('--dpi', type=int, default=300,
                        help='Output DPI (default: 300, options: 60, 120, 300, 600)')
    args = parser.parse_args()

    input_dir = args.input_dir
    if not os.path.isdir(input_dir):
        print(f"Error: directory not found: {input_dir}", file=sys.stderr)
        sys.exit(1)

    meta = _load_meta(input_dir)
    frame_files = _list_frames(input_dir)

    # Map --field to data key
    field_key = 'rho' if args.field == 'pressure' else 'velocity'

    if frame_files:
        cmap_primary = _resolve_cmap(args.cmap, meta, input_dir)
        cmap_stream = _resolve_stream_cmap(args.cmap, meta, input_dir)
        print(f"Colormap: contour={cmap_primary}, streamlines={cmap_stream}, field={args.field}")

        if args.last_only:
            frame_files = frame_files[-1:]

        for vtk_path in frame_files:
            frame_match = re.search(r'frame_(\d+)', vtk_path.name)
            frame_num = int(frame_match.group(1)) if frame_match else 0
            data = _load_frame_safe(str(vtk_path))
            if data is None:
                print(f"  SKIP frame {frame_num} (corrupt JSON)")
                continue

            if not HAS_MPL:
                print("matplotlib not installed, skipping PNG output")
            elif args.mesh:
                save_mesh_png(data, input_dir, frame_num, meta, dpi=args.dpi)
            elif args.cp:
                save_cp_png(data, input_dir, frame_num, meta, dpi=args.dpi)
            elif args.vorticity:
                save_vorticity_png(data, input_dir, frame_num, dpi=args.dpi)
            elif args.video:
                pass  # rendered in video section below
            elif args.split:
                save_png_split(data, input_dir, frame_num, cmap_primary, cmap_stream, field_key, dpi=args.dpi)
            else:
                save_png_combined(data, input_dir, frame_num, cmap_primary, cmap_stream, field_key, dpi=args.dpi)
    else:
        print(f"No frame JSON files found in {input_dir}/frames/")

    if args.video and frame_files:
        cmap_primary = _resolve_cmap(args.cmap, meta, input_dir)
        print(f"  Rendering {len(frame_files)} video frames with colormap={cmap_primary}")
        for vtk_path in frame_files:
            frame_match = re.search(r'frame_(\d+)', vtk_path.name)
            frame_num = int(frame_match.group(1)) if frame_match else 0
            data = _load_frame(str(vtk_path))
            if HAS_MPL:
                render_video_overlay(data, input_dir, frame_num, cmap_primary, field_key, dpi=args.dpi)
        make_video(input_dir)

    if args.strouhal:
        compute_strouhal(input_dir)

    if args.friction:
        f = meta.get('friction_factor', None)
        f_smooth = meta.get('f_smooth', None)
        ratio = meta.get('f_ratio', None)
        xr_h = meta.get('xr_h', None)
        u_bulk = meta.get('u_bulk', None)
        if f is not None:
            print(f"  Friction factor f = {f:.4f}")
            if f_smooth:
                print(f"  Smooth channel f_smooth = {f_smooth:.4f}")
            if ratio:
                print(f"  f/f_smooth = {ratio:.2f}")
            if xr_h:
                print(f"  Xr/h = {xr_h:.2f}")
            if u_bulk:
                print(f"  u_bulk = {u_bulk:.6f}")
        else:
            print("  No friction factor data in meta.json")

    print("Done.")


if __name__ == '__main__':
    main()
