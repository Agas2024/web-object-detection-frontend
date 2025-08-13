import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

const API_BASE = "https://obj-backend-3xr4.onrender.com";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [threshold, setThreshold] = useState(0.5);
  const [annotatedSrc, setAnnotatedSrc] = useState(null);
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const loopRef = useRef(null);

  const startWebcam = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 } },
      audio: false,
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
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
    det.forEach((d) => {
      tally[d.class] = (tally[d.class] || 0) + 1;
    });
    const summary = Object.entries(tally)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ");
    setHistory((h) =>
      [{ time: new Date().toLocaleTimeString(), summary, count: det.length }, ...h].slice(0, 25)
    );
  };

  const tick = async () => {
    if (sending) {
      loopRef.current = setTimeout(tick, 120);
      return;
    }
    const dataURL = grabFrameDataURL();
    if (!dataURL) {
      loopRef.current = setTimeout(tick, 120);
      return;
    }
    setSending(true);
    try {
      const res = await axios.post(`${API_BASE}/detect_frame`, {
        image_base64: dataURL,
        threshold: threshold,
      });
      setAnnotatedSrc(res.data.image);
      pushHistory(res.data.detections || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
      loopRef.current = setTimeout(tick, 120);
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

  return (
    <div style={{ fontFamily: "Inter, sans-serif", minHeight: "100vh", background: "#edf2f7", padding: 30 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, marginBottom: 10, color: "#1a202c", textAlign: "center" }}>
          🚀 YOLO Object Detection
        </h1>
        <p style={{ color: "#4a5568", textAlign: "center", marginBottom: 30 }}>
          Real-time detection via webcam or image upload
        </p>

        {/* Controls Panel */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24, marginBottom: 24 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 6px 20px rgba(0,0,0,0.08)" }}>
            <div style={{ borderRadius: 16, overflow: "hidden", background: "#000", position: "relative" }}>
              <video ref={videoRef} muted playsInline style={{ width: "100%", display: "block", borderRadius: 16 }}></video>
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 18 }}>
              {!running ? (
                <button onClick={start} style={btn()}>
                  ▶ Start Webcam
                </button>
              ) : (
                <button onClick={stop} style={btn("secondary")}>
                  ⏹ Stop Webcam
                </button>
              )}
              <label style={btn("outline")}>
                📁 Upload Image
                <input type="file" accept="image/*" onChange={onFileChange} style={{ display: "none" }} />
              </label>
              <button
                style={btn("outline")}
                onClick={() => {
                  if (annotatedSrc) downloadDataURL(annotatedSrc);
                }}
              >
                💾 Save Snapshot
              </button>
            </div>

            {/* Confidence Slider */}
            <div style={{ marginTop: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#4a5568", fontSize: 14 }}>Confidence:</span>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: "#3b82f6" }}
                />
                <strong style={{ minWidth: 35 }}>{Math.round(threshold * 100)}%</strong>
              </label>
            </div>
          </div>
        </div>

        {/* Annotated Output */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 6px 20px rgba(0,0,0,0.08)", marginBottom: 24 }}>
          <h3 style={{ fontSize: 20, marginBottom: 12, fontWeight: 700 }}>📷 Annotated Output</h3>
          <div
            style={{
              width: "100%",
              height: 600,
              background: "#111",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {annotatedSrc ? (
              <img src={annotatedSrc} alt="annotated" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 12 }} />
            ) : (
              <span style={{ color: "#aaa", fontSize: 18 }}>Run detection to see results…</span>
            )}
          </div>
        </div>

        {/* Detection History */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 6px 20px rgba(0,0,0,0.08)", marginBottom: 24 }}>
          <h3 style={{ fontSize: 20, marginBottom: 12, fontWeight: 700 }}>📜 Detection History</h3>
          {history.length === 0 && <div style={{ color: "#718096" }}>No detections yet.</div>}
          <div style={{ maxHeight: 250, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((h, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(203,213,225,0.15)",
                  fontSize: 14,
                  gap: 6,
                }}
              >
                <span style={{ color: "#4a5568", minWidth: 70 }}>{h.time}</span>
                <span style={{ fontWeight: 600, color: "#2d3748" }}>{h.count} objs</span>
                <span style={{ color: "#1a202c", flex: 1, textAlign: "right" }}>{h.summary}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function btn(variant = "primary") {
  const base = {
    padding: "10px 18px",
    borderRadius: 10,
    border: "1px solid transparent",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    transition: "0.25s",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  if (variant === "secondary") return { ...base, background: "#edf2f7", color: "#1a202c", borderColor: "#cbd5e0" };
  if (variant === "outline") return { ...base, background: "#fff", color: "#1a202c", borderColor: "#cbd5e0" };
  return { ...base, background: "#3b82f6", color: "#fff" };
}

function downloadDataURL(dataURL) {
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = `yolo_snapshot_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
