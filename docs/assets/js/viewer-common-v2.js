// ==========================================================================
// AK-Vortex: Shared Flow Viewer Init v2
// Wires the vf-grid layout (1 column: static slider | animated canvas | CP static | CP canvas | vorticity static | vorticity canvas)
// on each case page. Each page calls initVFSplitSections() with its own config.
//
// Layout expected (cavity format):
//   <div id="reTabs"></div>
//   <div class="vf-split">
//     <div class="vf-col">
//       <h4>Steady-State Comparison</h4>
//       <div class="comparison-slider" id="fieldSlider">
//         <img id="sliderImgBefore"> <img id="sliderImgAfter" class="img-after">
//         <div class="slider-handle"><div class="slider-btn"></div></div>
//         <div class="slider-label left">Contour</div>
//         <div class="slider-label right">Streamlines</div>
//       </div>
//       <p class="fv-note">Drag the handle...</p>
//     </div>
//     <div class="vf-col">
//       <h4>Flow Evolution</h4>
//       <div class="fv-stage"><canvas id="lbmCanvas"></canvas></div>
//       <div class="fv-controls">
//         <button id="lbmPlay">&#9654; Play</button>
//         <input id="lbmScrubber" type="range" min="0" max="50" value="0" class="fv-slider">
//         <span id="lbmFrameLabel">Frame 0 / 50</span>
//       </div>
//     </div>
//   </div>
// ==========================================================================

function initVFSplitSections(opts) {
    opts = opts || {};
    var dataDir = opts.dataDir || 'assets/data/cavity';
    var paramLabel = opts.paramLabel || 'Re';
    var lbmConfigs = opts.lbmConfigs || [{ label: '100', file: '100' }];
    var cmap = opts.cmap || 'jet';

    var reTabs = document.getElementById('reTabs');
    var lbmCanvas = document.getElementById('lbmCanvas');
    if (!lbmCanvas || !reTabs) return;

    var viewer = new FlowViewer(lbmCanvas, dataDir, { cmap: cmap });

    // State
    var currentConfig = lbmConfigs[0];
    var statusEl = document.getElementById('fvStatus');
    viewer.onStatus = function (m) { if (statusEl) statusEl.textContent = m; };

    viewer.onFrameChange = function (f) {
        var lbl = document.getElementById('lbmFrameLabel');
        if (lbl && viewer.cache[viewer.re]) {
            lbl.textContent = 'Frame ' + f + ' / ' + (viewer.cache[viewer.re].lbm.n_frames - 1);
            var scr = document.getElementById('lbmScrubber');
            if (scr) { scr.max = viewer.cache[viewer.re].lbm.n_frames - 1; scr.value = f; }
        }
        // Animate pressure and vorticity canvases in sync with velocity
        renderStaticFields(f);
    };

    // --- Static slider image helpers ---
    // imageBasePath: full base path within assets/images/ (e.g. 'cylinder/simulations/re100')
    // imageSuffix: function(config) returns filename prefix (e.g. 're100')
    // If imageBasePath is set, it is used directly. Otherwise falls back to legacy pattern.
    function imageUrl(config, type) {
        if (opts.imageBasePath) {
            // New pattern: imageBasePath is a function(config) returning the full subpath
            var basePath = typeof opts.imageBasePath === 'function' ? opts.imageBasePath(config) : opts.imageBasePath;
            var suffix = opts.imageSuffix ? opts.imageSuffix(config) : config.file;
            return 'assets/images/' + basePath + '/' + suffix + '_' + type + '.png';
        }
        // Legacy pattern: assets/images/{imageCase}/re{suffix}_{type}.png
        var suffix = opts.imageSuffix ? opts.imageSuffix(config) : config.file;
        return 'assets/images/' + (opts.imageCase || 'cylinder') + '/re' + suffix + '_' + type + '.png';
    }

    function makePlaceholder(config, type) {
        var label = paramLabel + '=' + config.label;
        return 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300">' +
            '<rect width="800" height="300" fill="#0d1117"/>' +
            '<text x="400" y="140" fill="#484f58" font-family="monospace" font-size="14" text-anchor="middle">' +
            label + ' ' + type + '</text>' +
            '<text x="400" y="160" fill="#30363d" font-family="monospace" font-size="11" text-anchor="middle">' +
            '(simulation data)</text></svg>'
        );
    }

    function updateImages(config) {
        var before = document.getElementById('sliderImgBefore');
        var after = document.getElementById('sliderImgAfter');
        if (before) {
            before.onerror = function () { this.src = makePlaceholder(config, 'contour'); };
            before.src = imageUrl(config, 'contour');
        }
        if (after) {
            after.onerror = function () { this.src = makePlaceholder(config, 'streamlines'); };
            after.src = imageUrl(config, 'streamlines');
        }
        var cpImg = document.getElementById('cpImg');
        if (cpImg) {
            cpImg.onerror = function () { this.src = makePlaceholder(config, 'cp'); };
            cpImg.src = imageUrl(config, 'cp');
        }
        var vortImg = document.getElementById('vortImg');
        if (vortImg) {
            vortImg.onerror = function () { this.src = makePlaceholder(config, 'vorticity'); };
            vortImg.src = imageUrl(config, 'vorticity');
        }
    }

    function resetSlider() {
        setTimeout(function () {
            var c = document.getElementById('fieldSlider');
            if (!c) return;
            var h = c.querySelector('.slider-handle');
            var a = c.querySelector('.img-after');
            if (h) h.style.left = '50%';
            if (a) a.style.clipPath = 'inset(0 50% 0 0)';
        }, 200);
    }

    // --- Build Re/config tabs ---
    function switchConfig(config) {
        currentConfig = config;
        // Update tab active state
        reTabs.querySelectorAll('.teaser-link').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-file') === config.file);
        });
        updateImages(config);
        resetSlider();
        // Drive FlowViewer
        viewer.setRe(config.file).then(function () {
            if (!viewer.playing) viewer.play();
            var pb = document.getElementById('lbmPlay');
            if (pb) pb.innerHTML = '&#10074;&#10074; Pause';
            renderStaticFields();
        });
    }

    lbmConfigs.forEach(function (config) {
        var btn = document.createElement('button');
        btn.className = 'teaser-link' + (config === currentConfig ? ' active' : '');
        btn.setAttribute('data-file', config.file);
        btn.textContent = paramLabel + ' = ' + config.label;
        btn.style.fontSize = '0.7em';
        btn.onclick = function () { switchConfig(config); };
        reTabs.appendChild(btn);
    });

    // --- Field selector tabs (Velocity | Pressure | Vorticity) ---
    var fieldTabs = document.getElementById('fieldTabs');
    if (fieldTabs) {
        var fields = [
            { id: 'velocity', label: 'Velocity' },
            { id: 'pressure', label: 'Pressure' },
            { id: 'vorticity', label: 'Vorticity' }
        ];
        fields.forEach(function (f, i) {
            var btn = document.createElement('button');
            btn.className = 'teaser-link' + (i === 0 ? ' active' : '');
            btn.setAttribute('data-field', f.id);
            btn.textContent = f.label;
            btn.style.fontSize = '0.7em';
            btn.onclick = function () {
                fieldTabs.querySelectorAll('.teaser-link').forEach(function (b) {
                    b.classList.toggle('active', b.getAttribute('data-field') === f.id);
                });
                viewer.setField(f.id);
            };
            fieldTabs.appendChild(btn);
        });
    }

    // --- Play / Pause ---
    var playBtn = document.getElementById('lbmPlay');
    if (playBtn) {
        playBtn.addEventListener('click', function () {
            var playing = viewer.togglePlay();
            this.innerHTML = playing ? '&#10074;&#10074; Pause' : '&#9654; Play';
        });
    }

    // --- Scrubber ---
    var scrubber = document.getElementById('lbmScrubber');
    if (scrubber) {
        scrubber.addEventListener('input', function () {
            viewer.pause();
            if (playBtn) playBtn.innerHTML = '&#9654; Play';
            viewer.setFrame(parseInt(this.value, 10));
        });
    }

    // --- Boot ---
    updateImages(currentConfig);
    viewer.init(currentConfig.file).then(function () {
        viewer.play();
        if (playBtn) playBtn.innerHTML = '&#10074;&#10074; Pause';
        // Render static pressure + vorticity canvases (2x2 grid)
        renderStaticFields();
        // Preload remaining configs in background
        lbmConfigs.slice(1).forEach(function (c) { viewer.load(c.file); });
    });

    // --- Render animated pressure + vorticity fields ---
    function renderStaticFields(frame) {
        var entry = viewer.cache[viewer.re];
        if (!entry) return;
        var f = (frame !== undefined) ? frame : entry.lbm.n_frames - 1;
        var cpCanvas = document.getElementById('cpCanvas');
        var oCanvas = document.getElementById('vorticityCanvas');
        if (cpCanvas && entry.pmin !== undefined) {
            viewer.renderStatic(cpCanvas, 2, 'jet', entry.pmin, entry.pmax, f);
        }
        if (oCanvas && entry.omegaMax !== undefined) {
            viewer.renderStatic(oCanvas, 3, 'rdbu', -entry.omegaMax, entry.omegaMax, f);
        }
    }
}

if (typeof window !== 'undefined') {
    window.initVFSplitSections = initVFSplitSections;
}
