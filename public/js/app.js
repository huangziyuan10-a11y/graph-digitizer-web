/**
 * Main Application - wires UI to the digitizer engine
 * Works as a pure static site using localStorage for stats
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('graph-canvas');
  const digitizer = new GraphDigitizer(canvas);

  // Stats: tracked by GitHub Traffic Analytics (repo owner only)
  // Go to: github.com/huangziyuan10-a11y/graph-digitizer-web > Insights > Traffic

  // --- Section refs ---
  const stepCalibrate = document.getElementById('step-calibrate');
  const stepExtract = document.getElementById('step-extract');
  const stepData = document.getElementById('step-data');

  // --- File Upload ---
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');

  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      digitizer.loadImage(e.target.result).then(() => {
        uploadArea.querySelector('.upload-content').innerHTML =
          `<p style="color:var(--accent);font-weight:600;">Loaded: ${file.name}</p>
           <p class="upload-hint">Click or drop to replace image</p>`;
        stepCalibrate.classList.remove('hidden');
        stepExtract.classList.remove('hidden');
        stepData.classList.remove('hidden');
        stepCalibrate.scrollIntoView({ behavior: 'smooth' });
      });
    };
    reader.readAsDataURL(file);
  }

  // --- ROI and Exclude Regions ---
  let drawMode = null; // 'roi' or 'exclude'
  let drawStart = null;

  document.getElementById('btn-set-roi').addEventListener('click', () => {
    drawMode = 'roi';
    drawStart = null;
    canvas.classList.add('roi-mode');
    document.getElementById('roi-status').textContent = 'Draw a rectangle around the data area...';
  });

  document.getElementById('btn-exclude-roi').addEventListener('click', () => {
    drawMode = 'exclude';
    drawStart = null;
    canvas.classList.add('roi-mode');
    document.getElementById('roi-status').textContent = 'Draw a rectangle over the legend/area to exclude...';
  });

  document.getElementById('btn-clear-roi').addEventListener('click', () => {
    digitizer.clearROI();
    digitizer.clearExcludeRegions();
    document.getElementById('roi-status').textContent = 'No region set (will scan entire image)';
    document.getElementById('roi-status').style.color = '';
  });

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY)
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    if (!drawMode) return;
    drawStart = getCanvasCoords(e);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!drawMode || !drawStart) return;
    const cur = getCanvasCoords(e);
    if (drawMode === 'roi') {
      digitizer.roi = { x1: drawStart.x, y1: drawStart.y, x2: cur.x, y2: cur.y };
    } else if (drawMode === 'exclude') {
      // Show preview of current exclude region being drawn
      const previewExclude = { x1: drawStart.x, y1: drawStart.y, x2: cur.x, y2: cur.y };
      // Temporarily add for drawing, will be replaced on mouseup
      const tempLen = digitizer.excludeRegions.length;
      digitizer.excludeRegions[tempLen] = previewExclude;
      digitizer.drawAll();
      digitizer.excludeRegions.length = tempLen; // remove temp
      return;
    }
    digitizer.drawAll();
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!drawMode || !drawStart) return;
    const end = getCanvasCoords(e);
    const big = Math.abs(end.x - drawStart.x) > 10 && Math.abs(end.y - drawStart.y) > 10;

    if (drawMode === 'roi' && big) {
      digitizer.setROI(drawStart.x, drawStart.y, end.x, end.y);
      updateROIStatus();
    } else if (drawMode === 'exclude' && big) {
      digitizer.addExcludeRegion(drawStart.x, drawStart.y, end.x, end.y);
      updateROIStatus();
    } else {
      document.getElementById('roi-status').textContent = 'Rectangle too small. Try again.';
    }

    drawMode = null;
    drawStart = null;
    canvas.classList.remove('roi-mode');
  });

  function updateROIStatus() {
    const parts = [];
    if (digitizer.roi) parts.push('Data region set');
    if (digitizer.excludeRegions.length > 0) {
      parts.push(`${digitizer.excludeRegions.length} area(s) excluded`);
    }
    if (parts.length === 0) {
      document.getElementById('roi-status').textContent = 'No region set (will scan entire image)';
      document.getElementById('roi-status').style.color = '';
    } else {
      document.getElementById('roi-status').textContent = parts.join(', ') + '.';
      document.getElementById('roi-status').style.color = '#10b981';
    }
  }

  // --- Calibration ---
  let currentCalPoint = 'x1';
  let isColorPickMode = false;
  const calButtons = document.querySelectorAll('.btn-cal');

  calButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isColorPickMode) return;
      currentCalPoint = btn.dataset.point;
      calButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  ['x1', 'x2', 'y1', 'y2'].forEach(key => {
    document.getElementById(`val-${key}`).addEventListener('change', (e) => {
      digitizer.setCalibrationValue(key, e.target.value);
      updateCalStatus();
    });
  });

  // Canvas click handler
  canvas.addEventListener('click', (e) => {
    if (drawMode) return; // ROI/exclude uses mousedown/mouseup instead

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = Math.round((e.clientX - rect.left) * scaleX);
    const py = Math.round((e.clientY - rect.top) * scaleY);

    if (isColorPickMode) {
      const color = digitizer.getPixelColor(px, py);
      if (color) {
        const hex = '#' + [color.r, color.g, color.b].map(c => c.toString(16).padStart(2, '0')).join('');
        document.getElementById('target-color').value = hex;
        digitizer.setTargetColor(color.r, color.g, color.b);
      }
      isColorPickMode = false;
      canvas.classList.remove('color-pick-mode');
      return;
    }

    if (extractMode === 'manual' && digitizer.calibrated) {
      digitizer.addManualPoint(px, py);
      updateDataTable();
      return;
    }

    // Calibration mode
    digitizer.setCalibrationPoint(currentCalPoint, px, py);
    const btn = document.getElementById(`btn-cal-${currentCalPoint}`);
    btn.classList.add('done');

    const order = ['x1', 'x2', 'y1', 'y2'];
    const nextIdx = order.indexOf(currentCalPoint) + 1;
    if (nextIdx < order.length && !digitizer.calPoints[order[nextIdx]]) {
      currentCalPoint = order[nextIdx];
      calButtons.forEach(b => b.classList.remove('active'));
      document.getElementById(`btn-cal-${currentCalPoint}`).classList.add('active');
    }
    updateCalStatus();
  });

  function updateCalStatus() {
    const status = document.getElementById('cal-status');
    if (digitizer.calibrated) {
      status.textContent = 'Calibration complete! You can now extract data.';
      status.classList.add('ready');
    } else {
      const missing = ['x1', 'x2', 'y1', 'y2'].filter(k => !digitizer.calPoints[k]);
      status.textContent = `Set ${missing.length} more calibration point(s): ${missing.join(', ')}`;
      status.classList.remove('ready');
    }
  }

  // --- Extract Mode ---
  let extractMode = 'auto';
  document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      extractMode = btn.dataset.mode;
      document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('auto-settings').style.display = extractMode === 'auto' ? 'flex' : 'none';
    });
  });

  document.getElementById('target-color').addEventListener('input', (e) => {
    digitizer.setTargetColorHex(e.target.value);
  });

  document.getElementById('btn-pick-color').addEventListener('click', () => {
    isColorPickMode = true;
    canvas.classList.add('color-pick-mode');
  });

  document.getElementById('color-tolerance').addEventListener('input', (e) => {
    digitizer.colorTolerance = parseInt(e.target.value);
    document.getElementById('tolerance-value').textContent = e.target.value;
  });

  document.getElementById('min-point-size').addEventListener('input', (e) => {
    digitizer.minPointSize = parseInt(e.target.value);
    document.getElementById('point-size-value').textContent = e.target.value;
  });

  document.getElementById('btn-preview').addEventListener('click', () => {
    const count = digitizer.previewMatching();
    const info = document.getElementById('preview-info');
    info.classList.remove('hidden');
    document.getElementById('match-count').textContent = count.toLocaleString();
    if (count < 100) {
      info.style.color = '#e11d48';
      info.querySelector('span').textContent = count.toLocaleString();
    } else {
      info.style.color = '#10b981';
    }
  });

  document.getElementById('btn-extract').addEventListener('click', () => {
    if (!digitizer.calibrated) {
      alert('Please complete axis calibration first (Step 2).');
      return;
    }
    const points = digitizer.autoExtract();
    updateDataTable();
    stepData.scrollIntoView({ behavior: 'smooth' });

    if (points.length <= 5) {
      alert(
        `Only ${points.length} point(s) found!\n\n` +
        'Tips to get more points:\n' +
        '1. Click "Pick from image" and click directly on the line/curve in your graph\n' +
        '2. Increase the Color Tolerance slider (try 80-120)\n' +
        '3. Click "Preview Matching Pixels" to see what matches before extracting\n' +
        '4. Make sure the target color matches the data line color'
      );
    }
  });

  document.getElementById('btn-clear-points').addEventListener('click', () => {
    digitizer.clearPoints();
    updateDataTable();
  });
  document.getElementById('btn-undo').addEventListener('click', () => {
    digitizer.removeLastPoint();
    updateDataTable();
  });

  // --- Data Table ---
  function updateDataTable() {
    const points = digitizer.getDataPoints();
    const tbody = document.getElementById('data-tbody');
    tbody.innerHTML = '';

    for (const pt of points) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${pt.index + 1}</td>
        <td><input type="number" step="any" value="${pt.x}" data-idx="${pt.index}" data-axis="x"></td>
        <td><input type="number" step="any" value="${pt.y}" data-idx="${pt.index}" data-axis="y"></td>
        <td><button class="btn btn-danger btn-del" data-idx="${pt.index}">&times;</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const axis = e.target.dataset.axis;
        const val = parseFloat(e.target.value);
        const pt = digitizer.dataPoints[idx];
        if (axis === 'x') digitizer.updateDataPoint(idx, val, pt.y);
        else digitizer.updateDataPoint(idx, pt.x, val);
      });
    });

    tbody.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        digitizer.deleteDataPoint(idx);
        updateDataTable();
      });
    });

    document.getElementById('point-count').textContent = `${points.length} points`;
  }

  document.getElementById('btn-sort-x').addEventListener('click', () => {
    digitizer.sortByX();
    updateDataTable();
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const data = digitizer.getDataPoints();
    if (data.length === 0) { alert('No data to export.'); return; }
    exportCSV(data);
  });

  document.getElementById('btn-export-excel').addEventListener('click', () => {
    const data = digitizer.getDataPoints();
    if (data.length === 0) { alert('No data to export.'); return; }
    exportExcel(data);
  });
});
