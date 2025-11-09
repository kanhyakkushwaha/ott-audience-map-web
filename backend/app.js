// backend/app.js
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Directory to store runs and outputs
const RUNS_DIR = path.join(__dirname, 'runs');
if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });

// Multer setup (temporary storage then rename to uuid)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RUNS_DIR),
  filename: (req, file, cb) => cb(null, `tmp-${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Helper to read CSV header (simple)
function readCSVHeader(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0].trim();
    const cols = firstLine.split(',').map(s => s.trim()).filter(Boolean);
    return cols;
  } catch (err) {
    return [];
  }
}

// POST /api/upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const tmpPath = req.file.path;
    const runId = uuidv4();
    const runCsvPath = path.join(RUNS_DIR, `${runId}.csv`);

    // rename uploaded temp file to run-id based file
    fs.renameSync(tmpPath, runCsvPath);

    // validate header & row count
    const columns = readCSVHeader(runCsvPath);
    if (!columns || columns.length < 2) {
      try { fs.unlinkSync(runCsvPath); } catch (e) {}
      return res.status(400).json({ error: 'Invalid CSV format or not enough columns' });
    }
    const n_rows = Math.max(0, fs.readFileSync(runCsvPath, 'utf8').split('\n').filter(Boolean).length - 1);
    return res.json({ run_id: runId, columns, n_rows });
  } catch (err) {
    console.error('[UPLOAD ERROR]', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /api/run/:run_id
app.post('/api/run/:run_id', async (req, res) => {
  try {
    const runId = req.params.run_id;
    const { k = 3, scale = true } = req.body || {};
    const csvPath = path.join(RUNS_DIR, `${runId}.csv`);
    if (!fs.existsSync(csvPath)) return res.status(404).json({ error: 'Run ID not found' });

    // <-- EDIT THIS PATH TO MATCH YOUR CONDA ENV IF DIFFERENT -->
    const PYTHON_PATH = "C:/Users/Kanhaiya/miniconda3/envs/ott/python.exe";
    const scriptPath = path.join(__dirname, '..', 'python', 'run_cluster.py');

    console.log('[RUN] Using Python:', PYTHON_PATH);
    console.log('[RUN] Script:', scriptPath, 'runId:', runId, 'k:', k, 'scale:', scale);

    // spawn python (cwd set to project root so relative paths in script work)
    const py = spawn(PYTHON_PATH, [scriptPath, runId, String(k), String(scale)], { cwd: path.join(__dirname, '..') });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', data => {
      const s = data.toString();
      stdout += s;
      console.log('[PYOUT]', s.trim());
    });

    py.stderr.on('data', data => {
      const s = data.toString();
      stderr += s;
      console.error('[PYERR]', s.trim());
    });

    // safety timeout to avoid forever-hanging processes
    const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
    const killTimer = setTimeout(() => {
      try { py.kill('SIGKILL'); } catch (e) {}
      console.error('[PYTIMEOUT] Killed python for run', runId);
    }, TIMEOUT_MS);

    py.on('error', (err) => {
      clearTimeout(killTimer);
      console.error('[PY SPAWN ERROR]', err);
      return res.status(500).json({ error: 'Failed to start Python process', details: String(err) });
    });

    py.on('close', code => {
      clearTimeout(killTimer);

      if (code !== 0) {
        console.error('[PYTHON EXIT CODE]', code, 'stderr:', stderr);
        return res.status(500).json({ error: 'Processing failed', details: stderr || 'Python error' });
      }

      const resultFile = path.join(RUNS_DIR, `${runId}_results.json`);
      if (!fs.existsSync(resultFile)) {
        console.error('Result file missing for run', runId);
        return res.status(500).json({ error: 'Result file missing' });
      }

      try {
        const resultRaw = fs.readFileSync(resultFile, 'utf8');
        const result = JSON.parse(resultRaw);
        result.run_id = runId;
        return res.json(result);
      } catch (e) {
        console.error('Failed to read/parse result JSON', e);
        return res.status(500).json({ error: 'Invalid result JSON' });
      }
    });

  } catch (err) {
    console.error('[SERVER ERROR]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/results/:run_id
app.get('/api/results/:run_id', (req, res) => {
  const runId = req.params.run_id;
  const resultFile = path.join(RUNS_DIR, `${runId}_results.json`);
  if (!fs.existsSync(resultFile)) return res.status(404).json({ status: 'running' });
  try {
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    result.run_id = runId;
    return res.json(result);
  } catch (e) {
    console.error('[RESULTS READ ERROR]', e);
    return res.status(500).json({ error: 'Failed to parse results' });
  }
});

// GET /api/download/:run_id
app.get('/api/download/:run_id', (req, res) => {
  const runId = req.params.run_id;
  const filePath = path.join(RUNS_DIR, `${runId}_with_clusters.csv`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  return res.download(filePath);
});

// GET /sample
app.get('/sample', (req, res) => {
  const samplePath = path.join(__dirname, '..', 'data', 'sample.csv');
  if (!fs.existsSync(samplePath)) return res.status(404).json({ error: 'Sample not found' });
  return res.download(samplePath, 'sample.csv');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started at http://localhost:${PORT}`));
