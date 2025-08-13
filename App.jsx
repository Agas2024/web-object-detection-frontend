import React, { useEffect, useRef, useState, useMemo } from "react";
import axios from "axios";

const API_BASE = "http://localhost:5000";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // used to capture frames
  const [running, setRunning] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [classes, setClasses] = useState([]);
  const [selected, setSelected] = useState(["person", "car", "dog"]); // default demo
  const [annotatedSrc, setAnnotatedSrc] = useState(null);
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const loopRef = useRef(null);

  // Load class list from backend
  useEffect(() => {
    axios.get(`${API_BASE}/classes`).then(res => {
      setClasses(res.data.classes || []);
    }).catch(() => setClasses([]));
  }, []);

  const startWebcam = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 } }, audio: false });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const grabFrameDataURL = () => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return null;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  };

  const pushHistory = (det) => {
    const tally = {};
    det.forEach(d => { tally[d.class] = (tally[d.class] || 0) + 1; });
    const summary = Object.entries(tally).map(([k, v]) => `${k}:${v}`).join(", ");
    setHistory(h => [{ time: new Date().toLocaleTimeString(), summary, count: det.length }, ...h].slice(0, 25));
  };

  const tick = async () => {
    if (sending) { loopRef.current = setTimeout(tick, 120); return; }
    const dataURL = grabFrameDataURL();
    if (!dataURL) { loopRef.current = setTimeout(tick, 120); return; }
    setSending(true);
    try {
      const res = await axios.post(`${API_BASE}/detect_frame`, {
        image_base64: dataURL,
        threshold: threshold,
        classes: selected.length ? selected : null,
      });
      setAnnotatedSrc(res.data.image);
      pushHistory(res.data.detections || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
      loopRef.current = setTimeout(tick, 120); // ~8 FPS roundtrip target
    }
  };

  const start = async () => {
    await startWebcam();
    setRunning(true);
    tick();
  };

  const stop = () => {
    setRunning(false);
    clearTimeout(loopRef.current);
    stopWebcam();
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await axios.post(`${API_BASE}/detect?threshold=${threshold}`, form);
      setAnnotatedSrc(res.data.image);
      pushHistory(res.data.detections || []);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleClass = (cls) => {
    setSelected(prev => prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]);
  };

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui', minHeight: '100vh', background: '#fafafa' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>YOLOv8 Object Detection</h1>
        <p style={{ color: '#555', marginBottom: 16 }}>Webcam realtime + image upload · Confidence filter · Class filter · History</p>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <div style={{ position: 'relative', width: '100%', background: 'black', borderRadius: 12, overflow: 'hidden' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', display: 'block' }}></video>
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {!running ? (
                <button onClick={start} style={btn()}>Start Webcam</button>
              ) : (
                <button onClick={stop} style={btn('secondary')}>Stop Webcam</button>
              )}
              <label style={btn('outline')}>Upload Image
                <input type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />
              </label>
              <button style={btn('outline')} onClick={() => { if (annotatedSrc) downloadDataURL(annotatedSrc); }}>Download Snapshot</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#555' }}>Confidence:</span>
                <input type="range" min={0.1} max={0.9} step={0.05} value={threshold}
                       onChange={e => setThreshold(parseFloat(e.target.value))} style={{ flex: 1 }} />
                <strong>{Math.round(threshold*100)}%</strong>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <span style={{ color: '#555' }}>Class filter:</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 8, maxHeight: 160, overflow: 'auto', border: '1px solid #eee', padding: 8, borderRadius: 8 }}>
                {classes.map((c) => (
                  <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                    <input type="checkbox" checked={selected.includes(c)} onChange={() => toggleClass(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <h3 style={{ margin: 0, marginBottom: 8, fontSize: 18 }}>Annotated Output</h3>
              <div style={{ aspectRatio: '16 / 9', background: '#111', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {annotatedSrc ? (
                  <img src={annotatedSrc} alt="annotated" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ color: '#aaa' }}>Run detection to see results…</span>
                )}
              </div>
              <p style={{ color: '#888', marginTop: 8, fontSize: 12 }}>Tip: Lower confidence for more boxes; use class filter to focus.</p>
            </div>

            <div style={{ background: 'white', borderRadius: 16, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', maxHeight: 260, overflow: 'auto' }}>
              <h3 style={{ margin: 0, marginBottom: 8, fontSize: 18 }}>Detection History</h3>
              {history.length === 0 && <div style={{ color: '#777' }}>No detections yet.</div>}
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f2f2f2' }}>
                  <span style={{ color: '#666' }}>{h.time}</span>
                  <span style={{ fontWeight: 600 }}>{h.count} objs</span>
                  <span style={{ color: '#333' }}>{h.summary}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function btn(variant = 'primary') {
  const base = { padding: '8px 12px', borderRadius: 10, border: '1px solid transparent', cursor: 'pointer', fontWeight: 600 };
  if (variant === 'secondary') return { ...base, background: '#f3f4f6', color: '#111827', borderColor: '#e5e7eb' };
  if (variant === 'outline') return { ...base, background: 'white', color: '#111827', borderColor: '#e5e7eb' };
  return { ...base, background: '#111827', color: 'white' };
}

function downloadDataURL(dataURL) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `yolo_snapshot_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}