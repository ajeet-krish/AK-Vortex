#!/usr/bin/env python3
"""
Restructure case pages to the cavity vf-split format.

Usage:
    python3 scripts/restructure_pages.py [--dry-run] [--page PAGE]

Converts each case page from vertical layout to side-by-side (vf-split)
with the steady-state comparison slider and flow evolution canvas.
"""

import re
import sys
import os
import argparse

# Page configurations: (page_file, param_label, image_case, data_dir, lbm_configs, extra_opts)
PAGES = [
    {
        'file': 'step.html',
        'paramLabel': 'Re',
        'imageCase': 'step',
        'dataDir': 'assets/data/step',
        'lbmConfigs': [
            {'label': '100', 'file': '100'},
            {'label': '200', 'file': '200'},
            {'label': '400', 'file': '400'},
        ],
    },
    {
        'file': 'flat_plate.html',
        'paramLabel': 'AoA',
        'imageCase': 'flatplate',
        'dataDir': 'assets/data/flatplate',
        'lbmConfigs': [
            {'label': 'AoA=0', 'file': 'aoa0'},
            {'label': 'AoA=5', 'file': 'aoa5'},
            {'label': 'AoA=10', 'file': 'aoa10'},
            {'label': 'Re500', 'file': 're500'},
            {'label': 'Re2000', 'file': 're2000'},
        ],
        'imageSuffix': lambda c: c['file'],
    },
    {
        'file': 'orifice_plate.html',
        'paramLabel': 'Config',
        'imageCase': 'orifice_plate',
        'dataDir': 'assets/data/orifice_plate',
        'lbmConfigs': [
            {'label': '1p1h', 'file': '1p1h'},
            {'label': '1p3h', 'file': '1p3h'},
            {'label': '2p', 'file': '2p'},
            {'label': '3p', 'file': '3p'},
        ],
    },
    {
        'file': 'periodic_hills.html',
        'paramLabel': 'Re',
        'imageCase': 'periodic_hills',
        'dataDir': 'assets/data/periodic_hills',
        'lbmConfigs': [
            {'label': '100', 'file': '100'},
            {'label': '1000', 'file': '1000'},
            {'label': '2800', 'file': '2800'},
        ],
    },
    {
        'file': 'square_cylinder.html',
        'paramLabel': 'Re',
        'imageCase': 'square_cylinder',
        'dataDir': 'assets/data/square_cylinder',
        'lbmConfigs': [
            {'label': '200', 'file': '200'},
        ],
    },
    {
        'file': 'cylinder_near_wall.html',
        'paramLabel': 'Gap',
        'imageCase': 'cylinder_near_wall',
        'dataDir': 'assets/data/cylinder_near_wall',
        'lbmConfigs': [
            {'label': 'Gap=10', 'file': 'gap10'},
            {'label': 'Gap=20', 'file': 'gap20'},
            {'label': 'Gap=40', 'file': 'gap40'},
        ],
    },
    {
        'file': 'side_by_side.html',
        'paramLabel': 'S/D',
        'imageCase': 'side_by_side',
        'dataDir': 'assets/data/side_by_side',
        'lbmConfigs': [
            {'label': 'S/D=2', 'file': 'sd20'},
            {'label': 'S/D=3', 'file': 'sd30'},
            {'label': 'S/D=5', 'file': 'sd50'},
        ],
    },
    {
        'file': 'rotating_cylinder.html',
        'paramLabel': 'Omega',
        'imageCase': 'rotating_cylinder',
        'dataDir': 'assets/data/rotating_cylinder',
        'lbmConfigs': [
            {'label': 'w=0.5', 'file': 'w5'},
            {'label': 'w=1.0', 'file': 'w10'},
            {'label': 'w=2.0', 'file': 'w20'},
        ],
    },
]

VF_SPLIT_TEMPLATE = '''
    <div class="vf-split">
      <div class="vf-col">
        <h4>Steady-State Comparison</h4>
        <div class="comparison-slider" id="fieldSlider">
          <img id="sliderImgBefore" src="" alt="Contour">
          <img id="sliderImgAfter" class="img-after" src="" alt="Streamlines">
          <div class="slider-handle">
            <div class="slider-btn"></div>
          </div>
          <div class="slider-label left">Contour</div>
          <div class="slider-label right">Streamlines</div>
        </div>
        <p class="fv-note">Drag the handle to wipe between the velocity-magnitude contour and the streamline plot.</p>
      </div>

      <div class="vf-col">
        <h4>Flow Evolution</h4>
        <div class="fv-stage">
          <canvas id="lbmCanvas" class="fv-canvas" width="100" height="38"></canvas>
        </div>
        <div class="fv-controls">
          <button class="fv-btn" id="lbmPlay">&#9654; Play</button>
          <input type="range" id="lbmScrubber" min="0" max="50" value="0" class="fv-slider">
          <span class="fv-frame" id="lbmFrameLabel">Frame 0 / 50</span>
        </div>
      </div>
    </div>

    <p class="fv-note" id="fvStatus"></p>'''


def build_lbm_configs_js(configs):
    lines = []
    for c in configs:
        lines.append(f"          {{ label: '{c['label']}', file: '{c['file']}' }}")
    return ',\n'.join(lines)


def build_script_tag(config):
    configs_js = build_lbm_configs_js(config['lbmConfigs'])
    image_suffix = config.get('imageSuffix')
    suffix_line = ''
    if image_suffix:
        suffix_line = f"""
        imageSuffix: function(c) {{ return c.file; }},"""

    return f'''  <script src="assets/js/slider.js"></script>
  <script>
    document.getElementById('sidebarToggle')?.addEventListener('click', function () {{
      document.querySelector('.sidebar').classList.toggle('open');
      document.body.classList.toggle('sidebar-open');
    }});
  </script>

    <script src="assets/js/colormaps.js"></script>
    <script src="assets/js/flow-viewer.js"></script>
    <script src="assets/js/viewer-common-v2.js"></script>
    <script>
      initVFSplitSections({{
        dataDir: '{config["dataDir"]}',
        paramLabel: '{config["paramLabel"]}',
        imageCase: '{config["imageCase"]}',
        cmap: 'jet',{suffix_line}
        lbmConfigs: [
{configs_js}
        ]
      }});
    </script>'''


def restructure_page(html_content, config):
    """Replace the vertical Velocity Field section + Interactive Flow Evolution
    with the vf-split layout."""

    # Find and replace the Velocity Field section
    # Pattern: from <h2>Velocity Field</h2> to the next <h2> or </div> (end of main-content)
    vf_pattern = r'(<h2>Velocity Field</h2>.*?)(<h2>Validation</h2>)'
    vf_match = re.search(vf_pattern, html_content, re.DOTALL)
    if not vf_match:
        print(f"  WARNING: Could not find Velocity Field section")
        return html_content

    # Build the new Velocity Field section
    old_vf = vf_match.group(0)
    new_vf = f'''    <h2>Velocity Field</h2>

    <p class="section-intro">
      Use the tabs below to select a parameter variant.
      The left side shows the steady-state velocity contour with streamlines;
      the right side shows the flow evolution from rest to steady state.
    </p>

    <div style="display:flex;gap:4px;flex-wrap:wrap;margin:1rem 0;" id="reTabs"></div>
{VF_SPLIT_TEMPLATE}

    <h2>Validation</h2>'''

    html_content = html_content.replace(old_vf, new_vf)

    # Remove the Interactive Flow Evolution section
    # Pattern: from <h2>Interactive Flow Evolution</h2> to <footer
    ife_pattern = r'\s*<h2>Interactive Flow Evolution</h2>.*?(?=\s*<footer)'
    html_content = re.sub(ife_pattern, '', html_content, flags=re.DOTALL)

    # Replace the script section
    # Pattern: from <script src="assets/js/slider.js"> to </html>
    script_pattern = r'  <script src="assets/js/slider\.js">.*</html>'
    new_script = build_script_tag(config) + '''

</body>

</html>'''
    html_content = re.sub(script_pattern, new_script, html_content, flags=re.DOTALL)

    return html_content


def main():
    parser = argparse.ArgumentParser(description='Restructure case pages to vf-split format')
    parser.add_argument('--dry-run', action='store_true', help='Print changes without writing')
    parser.add_argument('--page', type=str, help='Process only this page file')
    args = parser.parse_args()

    docs_dir = os.path.join(os.path.dirname(__file__), '..', 'docs')

    for config in PAGES:
        if args.page and config['file'] != args.page:
            continue

        filepath = os.path.join(docs_dir, config['file'])
        if not os.path.exists(filepath):
            print(f"SKIP: {config['file']} not found")
            continue

        print(f"Processing {config['file']}...")

        with open(filepath, 'r') as f:
            html = f.read()

        new_html = restructure_page(html, config)

        if new_html == html:
            print(f"  No changes needed")
            continue

        if args.dry_run:
            print(f"  Would modify {config['file']}")
        else:
            with open(filepath, 'w') as f:
                f.write(new_html)
            print(f"  Updated {config['file']}")


if __name__ == '__main__':
    main()
