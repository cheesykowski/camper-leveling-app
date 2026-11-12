* {
  box-sizing: border-box;
}

:root {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #e2e8f0;
  background: #020817;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: dark;
}

html, body, #root {
  margin: 0;
  min-height: 100%;
  height: 100%;
}

body {
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.2), transparent 35%),
    linear-gradient(180deg, #020817 0%, #0f172a 100%);
}

button, input {
  font: inherit;
}

button {
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  font-weight: 600;
  padding: 0.8rem 1rem;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

button:hover {
  transform: translateY(-1px);
}

button.ghost {
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

button.secondary {
  background: rgba(148, 163, 184, 0.1);
  color: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.app-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #93c5fd;
  font-size: 0.75rem;
}

h1, h2, h3, p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0;
  font-size: clamp(2rem, 3vw, 2.75rem);
}

.layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}

.panel {
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 24px;
  box-shadow: 0 24px 50px rgba(2, 6, 23, 0.28);
  padding: 1.25rem;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.status.good {
  background: rgba(34, 197, 94, 0.12);
  color: #86efac;
}

.status.bad {
  background: rgba(248, 113, 113, 0.12);
  color: #fca5a5;
}

.tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.14);
  color: #bfdbfe;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.metric-card {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 16px;
  padding: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.metric-card span {
  color: #cbd5e1;
  font-size: 0.8rem;
}

.metric-card strong {
  font-size: 1.3rem;
}

.sensor-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.input-group {
  display: grid;
  gap: 0.9rem;
}

label {
  display: grid;
  gap: 0.38rem;
  color: #dbeafe;
  font-size: 0.9rem;
}

input[type='number'], input[type='text'] {
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(15, 23, 42, 0.9);
  color: #f8fafc;
  padding: 0.7rem 0.8rem;
}

input[type='range'] {
  width: 100%;
  accent-color: #60a5fa;
}

.demo-panel {
  margin-top: 1rem;
  padding: 0.9rem;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(96, 165, 250, 0.2);
  border-radius: 16px;
  display: grid;
  gap: 1rem;
}

.recommendation-panel h3 {
  font-size: 1.5rem;
  margin-bottom: 0.4rem;
}

.recommendation-panel p {
  color: #cbd5e1;
}

.recommendation-box {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(74, 222, 128, 0.25);
  border-radius: 16px;
  padding: 0.8rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 1rem 0;
}

.recommendation-box.neutral {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(96, 165, 250, 0.2);
}

.wheel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.wheel-card {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 90px;
  opacity: 0.8;
}

.wheel-card.active {
  border-color: rgba(96, 165, 250, 0.55);
  background: rgba(59, 130, 246, 0.12);
  opacity: 1;
}

.wheel-card span {
  color: #cbd5e1;
}

.wheel-card strong {
  font-size: 1.2rem;
}

@media (max-width: 640px) {
  .app-shell {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
