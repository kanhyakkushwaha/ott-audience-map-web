// frontend/js/upload.js
async function uploadAndRun(){
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) { alert('Please choose CSV file'); return; }

  const status = document.getElementById('status');
  status.innerText = 'Uploading...';

  const fd = new FormData();
  fd.append('file', file);

  try {
    const up = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!up.ok) {
      const err = await up.json();
      alert('Upload error: ' + (err.error || 'unknown'));
      return;
    }
    const upj = await up.json();
    const run_id = upj.run_id;
    status.innerText = 'Starting clustering...';

    const k = document.getElementById('kValue').value;
    const scale = document.getElementById('scaleToggle').checked;

    const run = await fetch(`/api/run/${run_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ k: Number(k), scale: Boolean(scale) })
    });

    if (!run.ok) {
      const re = await run.json();
      alert('Run error: ' + (re.error || 'Processing failed'));
      status.innerText = '';
      return;
    }
    const res = await run.json();
    // save to localStorage for frontend pages
    localStorage.setItem('results', JSON.stringify(res));
    status.innerText = 'Completed. Redirecting to results...';
    window.location.href = 'results.html';
  } catch (err) {
    console.error(err);
    alert('Something went wrong: ' + err.message);
    status.innerText = '';
  }
}
