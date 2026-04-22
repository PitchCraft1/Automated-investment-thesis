import { useEffect, useRef, useState } from "react";
import api from "./api/client";

const initialForm = { name: "", email: "", password: "" };
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const authBaseUrl = apiBaseUrl.replace(/\/api\/?$/, "");

const statusLabels = {
  queued: "Queued for analysis",
  extracting: "Extracting slide text and metadata",
  analyzing: "Analyzing with Groq AI and scoring engine",
  generating_pdf: "Generating PDF report",
  completed: "Completed",
  failed: "Failed"
};

const defaultSuggestions = [
  "Include traction, customer proof, and go-to-market data for stronger investor confidence.",
  "Use the preview popup to review strengths, weaknesses, and category feedback before downloading the PDF.",
  "If you want to upload the same deck again, the file picker now resets automatically after each run."
];

export default function App() {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState(initialForm);
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready for upload");
  const [isUploading, setIsUploading] = useState(false);
  const [activeReportId, setActiveReportId] = useState(null);
  const [activeUploadName, setActiveUploadName] = useState("");
  const [oauthProviders, setOauthProviders] = useState({ google: false, linkedin: false });
  const [previewReport, setPreviewReport] = useState(null);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("token");
    const oauthName = params.get("name");
    const oauthEmail = params.get("email");
    const oauthError = params.get("oauth_error");

    if (oauthToken) {
      localStorage.setItem("investment_token", oauthToken);
      setUser({
        id: "oauth",
        name: oauthName || "OAuth User",
        email: oauthEmail || ""
      });
      pushToast("success", "Logged in successfully with OAuth.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (oauthError) {
      pushToast("error", "OAuth login failed. Please try again.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = localStorage.getItem("investment_token");
    fetchAuthProviders();
    if (token) {
      fetchProfile();
      fetchReports();
    }
  }, []);

  useEffect(() => {
    if (!activeReportId) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const { data } = await api.get(`/reports/${activeReportId}`);
        const report = data.report;
        setProgress(report.progress || 0);
        setStatus(statusLabels[report.status] || report.status || "Processing");
        syncReport(report);

        if (report.status === "completed") {
          setIsUploading(false);
          setProgress(100);
          setStatus("Completed");
          setActiveReportId(null);
          setPreviewReport(report);
          setActiveUploadName("");
          pushToast("success", "Investment thesis generated successfully.");
          fetchReports();
        } else if (report.status === "failed") {
          setIsUploading(false);
          setProgress(0);
          setStatus("Failed");
          setActiveReportId(null);
          setActiveUploadName("");
          pushToast("error", report.errorMessage || "Analysis failed.");
          fetchReports();
        }
      } catch (error) {
        setIsUploading(false);
        setActiveReportId(null);
        setActiveUploadName("");
        setStatus("Failed");
        setProgress(0);
        pushToast("error", error.response?.data?.message || "Unable to fetch report status from the backend.");
      }
    }, 2500);

    return () => window.clearInterval(interval);
  }, [activeReportId]);

  function pushToast(type, text) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, type, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }

  function syncReport(report) {
    setReports((current) => [report, ...current.filter((item) => item.id !== report.id)]);
  }

  function resetComposer({ keepStatus = false } = {}) {
    setSelectedFile(null);
    setSelectedFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (!keepStatus) {
      setProgress(0);
      setStatus("Ready for upload");
    }
  }

  async function fetchProfile() {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
    } catch {
      localStorage.removeItem("investment_token");
    }
  }

  async function fetchAuthProviders() {
    try {
      const { data } = await api.get("/auth/providers");
      setOauthProviders(data);
    } catch {
      setOauthProviders({ google: false, linkedin: false });
    }
  }

  async function fetchReports() {
    try {
      const { data } = await api.get("/reports");
      setReports(data.reports || []);
    } catch {
      setReports([]);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();

    try {
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const payload = mode === "register" ? form : { email: form.email, password: form.password };
      const { data } = await api.post(endpoint, payload);
      localStorage.setItem("investment_token", data.token);
      setUser(data.user);
      setForm(initialForm);
      setMode("login");
      pushToast("success", `Welcome, ${data.user.name}.`);
      fetchReports();
    } catch (error) {
      pushToast("error", error.response?.data?.message || "Authentication failed.");
    }
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] || null;
    setSelectedFile(nextFile);
    setSelectedFileName(nextFile?.name || "");

    if (!isUploading) {
      setProgress(0);
      setStatus(nextFile ? "Ready to analyze" : "Ready for upload");
    }

    if (nextFile) {
      pushToast("info", `${nextFile.name} selected.`);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!selectedFile) {
      pushToast("error", "Please choose a pitch deck file first.");
      return;
    }

    if (!/\.(ppt|pptx)$/i.test(selectedFile.name)) {
      pushToast("error", "Only PPT or PPTX files are allowed.");
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      pushToast("error", "File exceeds the 50 MB limit.");
      return;
    }

    const formData = new FormData();
    formData.append("pitchDeck", selectedFile);
    setIsUploading(true);
    setStatus("Uploading pitch deck");
    setProgress(10);
    setActiveUploadName(selectedFile.name);

    try {
      const { data } = await api.post("/reports/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      setProgress(data.report?.progress || 5);
      setStatus(statusLabels[data.report?.status] || "Queued for analysis");
      setActiveReportId(data.report.id);
      syncReport(data.report);
      resetComposer({ keepStatus: true });
      pushToast("success", data.message || "Pitch deck accepted. Analysis has started.");
    } catch (error) {
      setProgress(0);
      setStatus("Failed");
      setIsUploading(false);
      setActiveUploadName("");
      pushToast("error", error.response?.data?.message || "Upload failed.");
    }
  }

  function logout() {
    localStorage.removeItem("investment_token");
    setUser(null);
    setReports([]);
    setActiveReportId(null);
    setPreviewReport(null);
    setIsUploading(false);
    setActiveUploadName("");
    resetComposer();
    pushToast("success", "Logged out successfully.");
  }

  async function handleDownload(reportId, startupName) {
    try {
      const response = await api.get(`/reports/${reportId}/download`, {
        responseType: "blob"
      });

      const fileUrl = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `${startupName || "Investment_Thesis"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(fileUrl);
      pushToast("success", "PDF download started.");
    } catch {
      pushToast("error", "Unable to download the PDF report. Please log in again and retry.");
    }
  }

  async function openReportPreview(reportId) {
    try {
      const { data } = await api.get(`/reports/${reportId}`);
      setPreviewReport(data.report);
    } catch (error) {
      pushToast("error", error.response?.data?.message || "Unable to open report preview.");
    }
  }

  async function handleClearHistory() {
    try {
      const { data } = await api.delete("/reports");
      setReports([]);
      setPreviewReport(null);
      setShowClearHistoryModal(false);
      setActiveReportId(null);
      setIsUploading(false);
      setActiveUploadName("");
      resetComposer();
      pushToast("success", data.message || "Analysis history cleared.");
    } catch (error) {
      pushToast("error", error.response?.data?.message || "Unable to clear report history.");
    }
  }

  const displayFileName = selectedFileName || activeUploadName || "No file selected yet";
  const tips = reports.length > 0
    ? [
        `You currently have ${reports.length} report${reports.length > 1 ? "s" : ""} in history.`,
        reports[0]?.status === "completed"
          ? `Latest completed thesis: ${reports[0].startupName || reports[0].fileName}.`
          : "Your latest report is still processing."
      ]
    : defaultSuggestions;

  return (
    <div className="app-shell">
      <aside className="hero-panel">
        <p className="eyebrow">Pitch deck analyzer</p>
        <h1>Automated Investment Thesis Generator</h1>
        <p className="hero-copy">
          Upload a startup pitch deck and get a richer investor-style thesis with weighted scoring,
          expanded strengths and weaknesses, detailed category feedback, and downloadable PDF output.
        </p>

        <div className="hero-metrics">
          <StatCard value="9" label="Evaluation categories" />
          <StatCard value="50MB" label="Deck size supported" />
          <StatCard value="PDF" label="Export-ready output" />
        </div>

        <div className="feature-grid">
          <Feature title="Interactive review" text="Preview the full analysis in a popup before downloading the report." />
          <Feature title="Smarter feedback" text="Expanded strengths, weaknesses, and category commentary for better investor context." />
          <Feature title="Cleaner workflow" text="Reliable re-uploads, clearer status states, and one-click history cleanup." />
        </div>

        <div className="suggestion-panel">
          <div className="section-heading">
            <p className="eyebrow">Suggestions</p>
            <h2>What improves a thesis</h2>
          </div>
          <div className="suggestion-list">
            {tips.map((tip) => (
              <div key={tip} className="suggestion-card">
                <span className="suggestion-dot" />
                <p>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="workspace-panel">
        {!user ? (
          <div className="card auth-card">
            <div className="mode-toggle">
              <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Register</button>
              <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            </div>

            <form onSubmit={handleAuth} className="stack">
              {mode === "register" && (
                <label>
                  Full Name
                  <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                </label>
              )}

              <label>
                Email
                <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </label>

              <label>
                Password
                <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
              </label>

              <button type="submit" className="primary">{mode === "register" ? "Create Account" : "Login"}</button>

              <div className="oauth-grid">
                <button
                  type="button"
                  className="ghost oauth-button"
                  disabled={!oauthProviders.google}
                  onClick={() => oauthProviders.google && (window.location.href = `${authBaseUrl}/api/auth/google`)}
                >
                  {oauthProviders.google ? "Continue with Google" : "Google unavailable"}
                </button>

                <button
                  type="button"
                  className="ghost oauth-button"
                  disabled={!oauthProviders.linkedin}
                  onClick={() => oauthProviders.linkedin && (window.location.href = `${authBaseUrl}/api/auth/linkedin`)}
                >
                  {oauthProviders.linkedin ? "Continue with LinkedIn" : "LinkedIn unavailable"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className="card workspace-card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Analyst Workspace</p>
                  <h2>{user.name}</h2>
                  <p className="muted inline-copy">{user.email}</p>
                </div>
                <button className="ghost" onClick={logout}>Logout</button>
              </div>

              <form onSubmit={handleUpload} className="stack">
                <label className={`upload-box ${isUploading ? "is-busy" : ""}`}>
                  <span>Choose `.ppt` or `.pptx` pitch deck</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ppt,.pptx"
                    disabled={isUploading}
                    onClick={(event) => {
                      event.target.value = "";
                    }}
                    onChange={handleFileChange}
                  />
                  <strong>{displayFileName}</strong>
                  <small>
                    {isUploading
                      ? "Analysis is running. Your current file stays locked in view until processing finishes."
                      : "Selecting a new file resets the uploader state automatically."}
                  </small>
                </label>

                <div className="progress-copy">
                  <div className="progress-meta">
                    <span>{status}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <div className="action-row">
                  <button type="submit" className="primary" disabled={isUploading}>
                    {isUploading ? "Analyzing..." : "Generate Investment Thesis"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={isUploading && !selectedFileName}
                    onClick={() => {
                      resetComposer({ keepStatus: isUploading });
                      if (!isUploading) {
                        pushToast("info", "Uploader reset.");
                      }
                    }}
                  >
                    Reset Selection
                  </button>
                </div>
              </form>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <p className="eyebrow">Report Dashboard</p>
                  <h2>Analysis History</h2>
                </div>
                <div className="card-actions">
                  <button className="ghost" onClick={fetchReports}>Refresh</button>
                  <button className="ghost danger" disabled={reports.length === 0} onClick={() => setShowClearHistoryModal(true)}>
                    Clear History
                  </button>
                </div>
              </div>

              <div className="report-list">
                {reports.length === 0 ? (
                  <p className="muted empty-state">No reports yet. Upload your first pitch deck to generate a professional investment thesis.</p>
                ) : (
                  reports.map((report) => (
                    <article key={report.id} className={`report-card status-${report.status}`}>
                      <div className="report-copy">
                        <div className="report-topline">
                          <h3>{report.startupName || report.fileName}</h3>
                          <span className={`status-pill status-pill-${report.status}`}>{statusLabels[report.status] || report.status}</span>
                        </div>

                        <p>
                          {report.status === "completed"
                            ? `${report.recommendation} • ${report.overallScore}/100 • Confidence ${report.confidenceScore}/100`
                            : `${statusLabels[report.status] || report.status} • ${report.progress || 0}%`}
                        </p>
                        {report.status === "failed" && report.errorMessage ? <p className="muted">{report.errorMessage}</p> : null}
                        <p className="muted">{report.processingDateUtc || report.createdAt}</p>
                      </div>

                      <div className="report-actions">
                        <button
                          type="button"
                          className="ghost"
                          disabled={report.status !== "completed"}
                          onClick={() => openReportPreview(report.id)}
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          className="primary link-button"
                          disabled={report.status !== "completed"}
                          onClick={() => handleDownload(report.id, report.startupName)}
                        >
                          Download PDF
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {previewReport && (
        <Modal title={previewReport.startupName || previewReport.fileName} onClose={() => setPreviewReport(null)}>
          <div className="modal-grid">
            <div className="summary-band">
              <SummaryChip label="Recommendation" value={previewReport.recommendation || "Pending"} />
              <SummaryChip label="Overall Score" value={previewReport.overallScore ? `${previewReport.overallScore}/100` : "Pending"} />
              <SummaryChip label="Confidence" value={previewReport.confidenceScore ? `${previewReport.confidenceScore}/100` : "Pending"} />
            </div>

            {previewReport.executiveSummary ? (
              <SectionCard title="Executive Summary">
                <p>{previewReport.executiveSummary}</p>
              </SectionCard>
            ) : null}

            <div className="split-grid">
              <SectionCard title="Strengths">
                <ul className="bullet-list">
                  {(previewReport.strengths || []).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </SectionCard>

              <SectionCard title="Weaknesses">
                <ul className="bullet-list">
                  {(previewReport.weaknesses || []).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </SectionCard>
            </div>

            {previewReport.recommendations ? (
              <SectionCard title="Investor Recommendations">
                <p>{previewReport.recommendations}</p>
              </SectionCard>
            ) : null}

            {(previewReport.categories || []).length > 0 ? (
              <SectionCard title="Category Feedback">
                <div className="category-grid">
                  {previewReport.categories.map((category) => (
                    <div key={category.key || category.title} className="category-card">
                      <div className="category-header">
                        <h4>{category.title}</h4>
                        <span>{category.score}/10</span>
                      </div>
                      <p className="muted category-weight">Weight {category.weight}%</p>
                      <p>{category.feedback}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}
          </div>
        </Modal>
      )}

      {showClearHistoryModal && (
        <Modal title="Clear analysis history?" onClose={() => setShowClearHistoryModal(false)}>
          <p className="modal-copy">
            This removes your saved reports and generated PDFs from the app. Ongoing analysis will also be cleared from the dashboard.
          </p>
          <div className="action-row">
            <button className="ghost" onClick={() => setShowClearHistoryModal(false)}>Cancel</button>
            <button className="primary danger-fill" onClick={handleClearHistory}>Clear History</button>
          </div>
        </Modal>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <strong>{toast.type === "error" ? "Error" : toast.type === "success" ? "Success" : "Notice"}</strong>
            <p>{toast.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Feature({ title, text }) {
  return (
    <div className="feature-card">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SummaryChip({ label, value }) {
  return (
    <div className="summary-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="section-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="card-header">
          <h2>{title}</h2>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
