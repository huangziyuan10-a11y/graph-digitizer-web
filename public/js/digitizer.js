/**
 * Graph Digitizer Engine
 * Handles calibration, auto-detection, manual point picking, and coordinate mapping.
 */

class GraphDigitizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.image = null;
    this.imageData = null;

    // Calibration: 4 pixel points + their real values
    this.calPoints = { x1: null, x2: null, y1: null, y2: null };
    this.calValues = { x1: 0, x2: 10, y1: 0, y2: 10 };
    this.calibrated = false;

    // Extracted data points (pixel coords + real coords)
    this.dataPoints = [];

    // Settings
    this.targetColor = { r: 0, g: 0, b: 255 };
    this.colorTolerance = 30;
    this.minPointSize = 3;
  }

  loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.drawAll();
        resolve();
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  drawAll() {
    if (!this.image) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.image, 0, 0);

    // Draw calibration points
    const calColors = { x1: '#e11d48', x2: '#f97316', y1: '#2563eb', y2: '#10b981' };
    const calLabels = { x1: 'X₁', x2: 'X₂', y1: 'Y₁', y2: 'Y₂' };
    for (const key of ['x1', 'x2', 'y1', 'y2']) {
      const pt = this.calPoints[key];
      if (pt) {
        this.drawMarker(pt.x, pt.y, calColors[key], calLabels[key]);
      }
    }

    // Draw data points
    for (let i = 0; i < this.dataPoints.length; i++) {
      const pt = this.dataPoints[i];
      this.ctx.beginPath();
      this.ctx.arc(pt.px, pt.py, 4, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'white';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }

  drawMarker(x, y, color, label) {
    const ctx = this.ctx;
    // Crosshair
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
    ctx.stroke();
    // Circle
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.stroke();
    // Label
    ctx.fillStyle = color;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(label, x + 10, y - 8);
  }

  setCalibrationPoint(key, px, py) {
    this.calPoints[key] = { x: px, y: py };
    this.checkCalibration();
    this.drawAll();
  }

  setCalibrationValue(key, value) {
    this.calValues[key] = parseFloat(value) || 0;
    this.checkCalibration();
  }

  checkCalibration() {
    const { x1, x2, y1, y2 } = this.calPoints;
    this.calibrated = !!(x1 && x2 && y1 && y2);
    return this.calibrated;
  }

  // Convert pixel coordinates to real data coordinates
  pixelToData(px, py) {
    if (!this.calibrated) return { x: px, y: py };

    const { x1, x2, y1, y2 } = this.calPoints;
    const vx1 = this.calValues.x1, vx2 = this.calValues.x2;
    const vy1 = this.calValues.y1, vy2 = this.calValues.y2;

    // Linear interpolation
    const realX = vx1 + (px - x1.x) / (x2.x - x1.x) * (vx2 - vx1);
    const realY = vy1 + (py - y1.y) / (y2.y - y1.y) * (vy2 - vy1);

    return { x: realX, y: realY };
  }

  addManualPoint(px, py) {
    const { x, y } = this.pixelToData(px, py);
    this.dataPoints.push({ px, py, x, y });
    this.drawAll();
    return { x, y };
  }

  removeLastPoint() {
    if (this.dataPoints.length > 0) {
      this.dataPoints.pop();
      this.drawAll();
    }
  }

  clearPoints() {
    this.dataPoints = [];
    this.drawAll();
  }

  sortByX() {
    this.dataPoints.sort((a, b) => a.x - b.x);
  }

  // Get color at pixel
  getPixelColor(x, y) {
    if (!this.image) return null;
    // Draw clean image to read pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.image.width;
    tempCanvas.height = this.image.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCtx.drawImage(this.image, 0, 0);
    const data = tempCtx.getImageData(x, y, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2] };
  }

  setTargetColor(r, g, b) {
    this.targetColor = { r, g, b };
  }

  setTargetColorHex(hex) {
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    this.targetColor = { r, g, b };
  }

  // Auto-detect data points by color matching
  autoExtract() {
    if (!this.image || !this.calibrated) return [];

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.image.width;
    tempCanvas.height = this.image.height;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCtx.drawImage(this.image, 0, 0);
    const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const pixels = imgData.data;
    const w = tempCanvas.width;
    const h = tempCanvas.height;

    const tol = this.colorTolerance;
    const tc = this.targetColor;

    // Find all matching pixels
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const dr = pixels[idx] - tc.r;
        const dg = pixels[idx + 1] - tc.g;
        const db = pixels[idx + 2] - tc.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist <= tol) {
          mask[y * w + x] = 1;
        }
      }
    }

    // Connected component labeling (find clusters)
    const visited = new Uint8Array(w * h);
    const clusters = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x] && !visited[y * w + x]) {
          // BFS to find cluster, storing all pixels
          const queue = [{ x, y }];
          visited[y * w + x] = 1;
          const clusterPixels = [];

          while (queue.length > 0) {
            const p = queue.shift();
            clusterPixels.push(p);

            // Check 8 neighbors
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = p.x + dx, ny = p.y + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const ni = ny * w + nx;
                  if (mask[ni] && !visited[ni]) {
                    visited[ni] = 1;
                    queue.push({ x: nx, y: ny });
                  }
                }
              }
            }
          }

          if (clusterPixels.length >= this.minPointSize) {
            clusters.push(clusterPixels);
          }
        }
      }
    }

    // Process each cluster: detect if it's a dot or a line
    this.dataPoints = [];
    for (const pixels of clusters) {
      // Find bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pixels) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const spanX = maxX - minX + 1;
      const spanY = maxY - minY + 1;
      const maxSpan = Math.max(spanX, spanY);

      // If the cluster is small (a dot/marker), use centroid
      if (maxSpan <= 20) {
        let sumX = 0, sumY = 0;
        for (const p of pixels) { sumX += p.x; sumY += p.y; }
        const cx = Math.round(sumX / pixels.length);
        const cy = Math.round(sumY / pixels.length);
        const { x, y } = this.pixelToData(cx, cy);
        this.dataPoints.push({ px: cx, py: cy, x, y });
      } else {
        // It's a line/curve — sample at regular X intervals
        // Group pixels by X coordinate
        const columnMap = new Map();
        for (const p of pixels) {
          if (!columnMap.has(p.x)) columnMap.set(p.x, []);
          columnMap.get(p.x).push(p.y);
        }

        // Determine sampling interval (aim for ~50-100 points per line)
        const numSamples = Math.min(100, Math.max(20, Math.floor(spanX / 3)));
        const step = Math.max(1, Math.floor(spanX / numSamples));

        // Sample at regular X intervals
        for (let sx = minX; sx <= maxX; sx += step) {
          // Collect Y values in a small window around sx
          const yValues = [];
          for (let wx = sx - 1; wx <= sx + 1; wx++) {
            if (columnMap.has(wx)) {
              yValues.push(...columnMap.get(wx));
            }
          }
          if (yValues.length > 0) {
            // Use median Y for robustness
            yValues.sort((a, b) => a - b);
            const medianY = yValues[Math.floor(yValues.length / 2)];
            const { x, y } = this.pixelToData(sx, medianY);
            this.dataPoints.push({ px: sx, py: medianY, x, y });
          }
        }
      }
    }

    // Sort by x
    this.dataPoints.sort((a, b) => a.x - b.x);
    this.drawAll();
    return this.dataPoints;
  }

  getDataPoints() {
    return this.dataPoints.map((p, i) => ({
      index: i,
      x: parseFloat(p.x.toFixed(6)),
      y: parseFloat(p.y.toFixed(6)),
      px: p.px,
      py: p.py
    }));
  }

  updateDataPoint(index, newX, newY) {
    if (index >= 0 && index < this.dataPoints.length) {
      this.dataPoints[index].x = newX;
      this.dataPoints[index].y = newY;
    }
  }

  deleteDataPoint(index) {
    if (index >= 0 && index < this.dataPoints.length) {
      this.dataPoints.splice(index, 1);
      this.drawAll();
    }
  }
}
