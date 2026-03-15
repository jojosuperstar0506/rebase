// Owner: William — self-serve intake + instant dashboard

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e0e0e0",
  borderRadius: "8px",
  padding: "1.5rem",
  marginBottom: "1rem",
  backgroundColor: "#fafafa",
};

const placeholderStyle: React.CSSProperties = {
  color: "#999",
  fontStyle: "italic",
};

export default function DiagnosticDashboard() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "960px", margin: "0 auto" }}>
      <h1>Self-Serve Diagnostics</h1>

      <div style={sectionStyle}>
        <h2>AI Readiness Score</h2>
        <p style={placeholderStyle}>Coming soon</p>
      </div>

      <div style={sectionStyle}>
        <h2>Waste Estimates</h2>
        <p style={placeholderStyle}>Coming soon</p>
      </div>

      <div style={sectionStyle}>
        <h2>Department Health Cards</h2>
        <p style={placeholderStyle}>Coming soon</p>
      </div>

      <div style={sectionStyle}>
        <h2>ROI Preview</h2>
        <p style={placeholderStyle}>Coming soon</p>
      </div>
    </div>
  );
}
