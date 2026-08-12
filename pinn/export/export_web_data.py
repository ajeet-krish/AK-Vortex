"""Export LBM frame data for browser-side visualization.

Generates compact binary files consumed by docs/assets/js/flow-viewer.js:

  docs/assets/data/{case}/lbm_re{label}.bin   -- N frames, nx*ny, 5 channels (u, v, p, omega, obstacle)

The velocity-magnitude canvas viewer only needs u, v (for the contour + streamlines)
and the obstacle mask (to keep streamlines from crossing solid walls). Pressure and
vorticity are excluded to keep file sizes small; they can be added back later if a
field selector is reintroduced.

Custom binary format (.bin):
  offset 0 : uint32 magic = 0x4C424D31
  offset 4 : uint32 n_frames
  offset 8 : uint32 nx
  offset 12: uint32 ny
  offset 16: uint32 n_channels
  offset 20: uint32 dtype_flag (0=float32, 1=float16 uint16)
  offset 24: float16 little-endian data, layout [frame][channel][y][x]

The data directory name (e.g. "cavity") matches the website case page, so the
viewer can be pointed at assets/data/{case}/ with no per-case code.

Usage:
  python3 export_web_data.py            # export LBM for all cases
  python3 export_web_data.py --pinn     # also export cavity PINN sweep + ONNX
"""

import os
import sys
import json
import struct
import gzip
import argparse
import numpy as np
from scipy.ndimage import zoom

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_ROOT = os.path.join(PROJECT_ROOT, "docs", "assets", "data")
MAGIC = 0x4C424D31
DTYPE_FLAG = 1  # float16 (stored as little-endian uint16) keeps files ~half size


# Case -> output subdir + (output_subdir, web_label) configs.
# web_label becomes the filename suffix: lbm_{web_label}.bin
CASES = {
    "cavity": {
        "src": "cavity",
        "max_dim": 96,
        "configs": [("re100", "re100"), ("re400", "re400"), ("re1000", "re1000")],
    },
    "cylinder": {
        "src": "cylinder",
        "max_dim": 128,
        "configs": [("re100", "100"), ("re200", "200"), ("re1000", "1000")],
    },
    "step": {
        "src": "step",
        "max_dim": 128,
        "configs": [("re100", "100"), ("re200", "200"), ("re400", "400")],
    },
    "flatplate": {
        "src": "flatplate",
        "max_dim": 128,
        "configs": [
            ("re1000_aoa0", "aoa0"),
            ("re1000_aoa5", "aoa5"),
            ("re1000_aoa10", "aoa10"),
            ("re500_aoa0", "re500"),
            ("re2000_aoa0", "re2000"),
        ],
    },
    "orifice_plate": {
        "src": "orifice_plate",
        "max_dim": 128,
        "configs": [
            ("re100_1p1h", "1p1h"),
            ("re100_1p3h", "1p3h"),
            ("re100_2p", "2p"),
            ("re100_3p", "3p"),
        ],
    },
    "periodic_hills": {
        "src": "periodic_hills",
        "max_dim": 128,
        "configs": [("re100", "100"), ("re1000", "1000"), ("re2800", "2800")],
    },
    "square_cylinder": {
        "src": "square_cylinder",
        "max_dim": 128,
        "configs": [("re200", "200")],
    },
    "side_by_side": {
        "src": "side_by_side",
        "max_dim": 128,
        "configs": [("re100_sd20", "sd20"), ("re100_sd30", "sd30"), ("re100_sd50", "sd50")],
    },
    "cylinder_near_wall": {
        "src": "cylinder_near_wall",
        "max_dim": 128,
        "configs": [
            ("re100_gap10", "gap10"),
            ("re100_gap20", "gap20"),
            ("re100_gap40", "gap40"),
        ],
    },
    "rotating_cylinder": {
        "src": "rotating_cylinder",
        "max_dim": 128,
        "configs": [("re100_w5", "w5"), ("re100_w10", "w10"), ("re100_w20", "w20")],
    },
    "urban": {
        "src": "urban",
        "max_dim": 128,
        "configs": [
            ("side/2p_ar0.3_re100", "side_a03"),
            ("side/2p_ar0.5_re100", "side_a05"),
            ("side/3p_ar0.6_re100", "side_a06"),
            ("side/2p_ar0.8_re100", "side_a08"),
            ("topdown_v/re100", "topdown"),
            ("topdown_h/re100", "topdown_h"),
            ("downwash/re100", "downwash"),
        ],
    },
    "urban_citygrid": {
        "src": "urban/city_grid",
        "max_dim": 128,
        "configs": [
            ("inlet_east", "east"),
            ("inlet_south", "south"),
            ("inlet_west", "west"),
        ],
    },
}


def bilinear_resize(field, target_nx, target_ny):
    ny, nx = field.shape
    if ny == target_ny and nx == target_nx:
        return np.ascontiguousarray(field, dtype=np.float32)
    fx = target_nx / nx
    fy = target_ny / ny
    out = zoom(field.astype(np.float32), (fy, fx), order=1)
    return np.ascontiguousarray(out, dtype=np.float32)


def compute_target(nx, ny, max_dim):
    if max(nx, ny) <= max_dim:
        return nx, ny
    scale = max_dim / max(nx, ny)
    return max(1, int(round(nx * scale))), max(1, int(round(ny * scale)))


def write_binary(path, frames, nx, ny, n_channels):
    """frames: (n_frames, n_channels, ny, nx) float32; written as float16."""
    arr = np.asarray(frames, dtype=np.float32)
    arr16 = arr.astype(np.float16).view(np.uint16)
    with open(path, "wb") as f:
        f.write(struct.pack("<IIIIII", MAGIC, arr.shape[0], nx, ny, n_channels, DTYPE_FLAG))
        f.write(arr16.tobytes(order="C"))
    raw = os.path.getsize(path)
    with open(path, "rb") as f:
        gz_path = path + ".gz"
        with gzip.open(gz_path, "wb", compresslevel=9) as gz:
            gz.write(f.read())
    gz_size = os.path.getsize(gz_path)
    return raw, gz_size


def _frame_files(frame_dir):
    """List frame files, preferring binary over JSON when both exist."""
    # Collect both JSON and binary frames
    json_files = [f for f in os.listdir(frame_dir)
                  if f.startswith("frame_") and f.endswith(".json")]
    bin_files = [f for f in os.listdir(frame_dir)
                 if f.startswith("frame_") and f.endswith(".bin")]

    # Build a dict: step -> filename (prefer binary)
    frames = {}
    for fn in json_files:
        s = fn[len("frame_"):]
        s = s[: s.index(".")]
        step = int(s)
        frames[step] = fn
    for fn in bin_files:
        s = fn[len("frame_"):]
        s = s[: s.index(".")]
        step = int(s)
        frames[step] = fn  # binary overrides JSON

    result = sorted(frames.values(), key=lambda fn: int(fn[len("frame_"):fn.index(".")]))
    return result


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

        if magic != MAGIC:
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

        return {
            'nx': int(nx), 'ny': int(ny),
            'u': u, 'v': v, 'p': p,
            'omega': omega, 'obstacle': obstacle,
        }


def parse_json_frame(path: str) -> dict:
    """Read a JSON frame file and return field data."""
    with open(path) as f:
        data = json.load(f)
    return data


def export_lbm_case(case_name, cfg):
    src = cfg["src"]
    out_dir = os.path.join(DATA_ROOT, case_name)
    os.makedirs(out_dir, exist_ok=True)
    for subdir, label in cfg["configs"]:
        frame_dir = os.path.join(PROJECT_ROOT, "output", src, subdir, "frames")
        if not os.path.isdir(frame_dir):
            print(f"  SKIP {case_name}/{label}: {frame_dir} not found")
            continue
        files = _frame_files(frame_dir)
        if not files:
            print(f"  SKIP {case_name}/{label}: no frames")
            continue

        # Load frames, preferring binary over JSON
        loaded = []
        for fn in files:
            fpath = os.path.join(frame_dir, fn)
            try:
                if fn.endswith('.bin'):
                    d = parse_bin_frame(fpath)
                else:
                    d = parse_json_frame(fpath)
            except (json.JSONDecodeError, ValueError, struct.error):
                continue

            u = d.get("u")
            v = d.get("v")
            if u is not None and v is not None and len(loaded) > 0:
                arr_u = np.asarray(u, dtype=np.float32)
                arr_v = np.asarray(v, dtype=np.float32)
                if np.max(np.abs(arr_u)) < 1e-12 and np.max(np.abs(arr_v)) < 1e-12:
                    continue  # corrupted zero-velocity frame; drop it
            loaded.append((fn, d))

        if not loaded:
            print(f"  SKIP {case_name}/{label}: no parseable frames")
            continue

        first = loaded[0][1]
        nx0, ny0 = first["nx"], first["ny"]
        tnx, tny = compute_target(nx0, ny0, cfg["max_dim"])

        ch_u, ch_v, ch_p, ch_omega, ch_obs = [], [], [], [], []
        for fn, d in loaded:
            nx_d, ny_d = d["nx"], d["ny"]
            def fld(key):
                val = d.get(key)
                if val is None:
                    return np.zeros((ny_d, nx_d), dtype=np.float32)
                return np.array(val, dtype=np.float32).reshape(ny_d, nx_d)
            ch_u.append(bilinear_resize(fld("u"), tnx, tny))
            ch_v.append(bilinear_resize(fld("v"), tnx, tny))
            ch_p.append(bilinear_resize(fld("p"), tnx, tny))
            ch_omega.append(bilinear_resize(fld("omega"), tnx, tny))
            ch_obs.append(bilinear_resize(fld("obstacle"), tnx, tny))

        obs_stack = np.stack(ch_obs, 0)
        combined = np.stack(
            [np.stack(ch_u, 0), np.stack(ch_v, 0),
             np.stack(ch_p, 0), np.stack(ch_omega, 0),
             obs_stack], axis=1
        )  # (n_frames, 5, ny, nx)
        out_path = os.path.join(out_dir, f"lbm_{label}.bin")
        raw, gz = write_binary(out_path, combined, tnx, tny, 5)
        skipped = len(files) - len(loaded)
        note = f" ({skipped} skipped)" if skipped else ""
        print(f"  {case_name}/lbm_{label}.bin  {combined.shape}  "
              f"raw={raw/1e6:.2f}MB gz={gz/1e6:.2f}MB ({len(loaded)} frames{note})")


# --- PINN exports (cavity only; kept for the trained surrogate) ------------

def export_pinn(re):
    from cases.cavity.export_sweep import export_pinn as _ep  # noqa
    _ep(re)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pinn", action="store_true", help="also export cavity PINN sweep + ONNX")
    ap.add_argument("--case", default=None, help="export a single case only")
    args = ap.parse_args()

    os.makedirs(DATA_ROOT, exist_ok=True)
    print("Exporting LBM frames for all cases...")
    for case_name, cfg in CASES.items():
        if args.case and case_name != args.case:
            continue
        print(f"Case: {case_name}")
        export_lbm_case(case_name, cfg)

    if args.pinn:
        # Reuse the cavity PINN export logic via the helper module.
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
        from cases.cavity.export_sweep import export_cavity_pinn
        export_cavity_pinn()

    print("Done.")


if __name__ == "__main__":
    main()
