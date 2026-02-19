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

    // Region of Interest (ROI) - only extract within this rectangle
    // null means use entire image
    this.roi = null; // { x1, y1, x2, y2 } in pixel coords

    // Exclude regions - areas to skip (e.g., legend boxes)
    this.excludeRegions = []; // array of { x1, y1, x2, y2 }

    // Settings
    this.targetColor = { r: 0, g: 0, b: 255 };
    this.colorTolerance = 50;
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

    // Draw ROI rectangle
    if (this.roi) {
      const r = this.roi;
      const rx = Math.min(r.x1, r.x2);
      const ry = Math.min(r.y1, r.y2);
      const rw = Math.abs(r.x2 - r.x1);
      const rh = Math.abs(r.y2 - r.y1);
      // Dim area outside ROI
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      this.ctx.fillRect(0, 0, this.canvas.width, ry); // top
      this.ctx.fillRect(0, ry + rh, this.canvas.width, this.canvas.height - ry - rh); // bottom
      this.ctx.fillRect(0, ry, rx, rh); // left
      this.ctx.fillRect(rx + rw, ry, this.canvas.width - rx - rw, rh); // right
      // Draw border
      this.ctx.strokeStyle = '#f97316';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 3]);
      this.ctx.strokeRect(rx, ry, rw, rh);
      this.ctx.setLineDash([]);
      // Label
      this.ctx.fillStyle = '#f97316';
      this.ctx.font = 'bold 12px sans-serif';
      this.ctx.fillText('Data Region', rx + 4, ry - 4);
    }

    // Draw exclude regions
    for (let i = 0; i < this.excludeRegions.length; i++) {
      const e = this.excludeRegions[i];
      const ex = Math.min(e.x1, e.x2);
      const ey = Math.min(e.y1, e.y2);
      const ew = Math.abs(e.x2 - e.x1);
      const eh = Math.abs(e.y2 - e.y1);
      // Dim excluded area
      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
      this.ctx.fillRect(ex, ey, ew, eh);
      // Draw border
      this.ctx.strokeStyle = '#e11d48';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 3]);
      this.ctx.strokeRect(ex, ey, ew, eh);
      this.ctx.setLineDash([]);
      // Label
      this.ctx.fillStyle = '#e11d48';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.fillText(`Exclude ${i + 1}`, ex + 3, ey - 3);
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

  setROI(x1, y1, x2, y2) {
    this.roi = {
      x1: Math.min(x1, x2),
      y1: Math.min(y1, y2),
      x2: Math.max(x1, x2),
      y2: Math.max(y1, y2)
    };
    this.drawAll();
  }

  clearROI() {
    this.roi = null;
    this.drawAll();
  }

  addExcludeRegion(x1, y1, x2, y2) {
    this.excludeRegions.push({
      x1: Math.min(x1, x2),
      y1: Math.min(y1, y2),
      x2: Math.max(x1, x2),
      y2: Math.max(y1, y2)
    });
    this.drawAll();
  }

  clearExcludeRegions() {
    this.excludeRegions = [];
    this.drawAll();
  }

  // Check if a pixel is inside any exclude region
  _isExcluded(x, y) {
    for (const e of this.excludeRegions) {
      if (x >= e.x1 && x <= e.x2 && y >= e.y1 && y <= e.y2) return true;
    }
    return false;
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

  // Get ROI bounds or full image bounds
  _getBounds() {
    if (this.roi) {
      return { startX: this.roi.x1, endX: this.roi.x2, startY: this.roi.y1, endY: this.roi.y2 };
    }
    return { startX: 0, endX: this.image.width, startY: 0, endY: this.image.height };
  }

  // Preview which pixels match the current color + tolerance
  previewMatching() {
    if (!this.image) return 0;
    this.drawAll();

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
    const bounds = this._getBounds();

    let matchCount = 0;
    const mainImgData = this.ctx.getImageData(0, 0, w, h);
    const mainPixels = mainImgData.data;

    for (let y = bounds.startY; y < bounds.endY; y++) {
      for (let x = bounds.startX; x < bounds.endX; x++) {
        if (this._isExcluded(x, y)) continue;
        const idx = (y * w + x) * 4;
        const dr = pixels[idx] - tc.r;
        const dg = pixels[idx + 1] - tc.g;
        const db = pixels[idx + 2] - tc.b;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist <= tol) {
          matchCount++;
          mainPixels[idx] = 255;
          mainPixels[idx + 1] = 0;
          mainPixels[idx + 2] = 0;
          mainPixels[idx + 3] = 255;
        }
      }
    }

    this.ctx.putImageData(mainImgData, 0, 0);
    return matchCount;
  }

  // Auto-detect data points by color matching
  // Uses column-scanning instead of BFS to handle lines, dots, and curves
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

    // Scan column by column within ROI bounds
    const bounds = this._getBounds();
    const roiW = bounds.endX - bounds.startX;
    const numSamples = Math.min(200, roiW);
    const step = Math.max(1, Math.floor(roiW / numSamples));

    this.dataPoints = [];

    for (let x = bounds.startX; x < bounds.endX; x += step) {
      // Collect all matching Y positions in a 3-pixel-wide window
      const yPositions = [];
      for (let wx = Math.max(bounds.startX, x - 1); wx <= Math.min(bounds.endX - 1, x + 1); wx++) {
        for (let y = bounds.startY; y < bounds.endY; y++) {
          if (this._isExcluded(wx, y)) continue;
          const idx = (y * w + wx) * 4;
          const dr = pixels[idx] - tc.r;
          const dg = pixels[idx + 1] - tc.g;
          const db = pixels[idx + 2] - tc.b;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist <= tol) {
            yPositions.push(y);
          }
        }
      }

      if (yPositions.length === 0) continue;

      // Group nearby Y values (within 5px) to handle line thickness
      yPositions.sort((a, b) => a - b);
      const groups = [];
      let currentGroup = [yPositions[0]];

      for (let i = 1; i < yPositions.length; i++) {
        if (yPositions[i] - yPositions[i - 1] <= 5) {
          currentGroup.push(yPositions[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [yPositions[i]];
        }
      }
      groups.push(currentGroup);

      // For each group, take the median Y as a data point
      // Use minPointSize=1 for column scanning (thin lines have few pixels per column)
      for (const group of groups) {
        if (group.length < 1) continue;
        const medianY = group[Math.floor(group.length / 2)];
        const { x: rx, y: ry } = this.pixelToData(x, medianY);
        this.dataPoints.push({ px: x, py: medianY, x: rx, y: ry });
      }
    }

    // Sort by x
    this.dataPoints.sort((a, b) => a.x - b.x);
    this.drawAll();
    console.log(`Auto-extract: found ${this.dataPoints.length} data points (tolerance=${tol}, color=rgb(${tc.r},${tc.g},${tc.b}))`);
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
