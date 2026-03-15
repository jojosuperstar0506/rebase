// TODO: Define proper request/response types once backend schemas are finalized

interface IntakeData {
  [key: string]: unknown;
}

interface SessionResponse {
  session_id: string;
  [key: string]: unknown;
}

interface DashboardResponse {
  [key: string]: unknown;
}

interface UploadResponse {
  [key: string]: unknown;
}

interface ReportResponse {
  [key: string]: unknown;
}

// TODO: Add error handling, auth headers, and response validation

export async function createSession(intakeData: IntakeData): Promise<SessionResponse> {
  // TODO: Wire up to actual backend endpoint
  const res = await fetch("/api/diagnostics/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intakeData),
  });
  return res.json();
}

export async function getDashboard(sessionId: string): Promise<DashboardResponse> {
  // TODO: Wire up to actual backend endpoint
  const res = await fetch(`/api/diagnostics/sessions/${sessionId}/dashboard`);
  return res.json();
}

export async function uploadDocuments(sessionId: string, files: File[]): Promise<UploadResponse> {
  // TODO: Wire up to actual backend endpoint
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const res = await fetch(`/api/diagnostics/sessions/${sessionId}/documents`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function getReport(engagementId: string): Promise<ReportResponse> {
  // TODO: Wire up to actual backend endpoint
  const res = await fetch(`/api/diagnostics/engagements/${engagementId}/report`);
  return res.json();
}
