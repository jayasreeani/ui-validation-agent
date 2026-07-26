import { useEffect, useMemo, useState } from 'react';

interface Issue {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  suggestedFix?: string;
}

interface Report {
  runId: string;
  appUrl: string;
  startedAt: string;
  finishedAt: string;
  summary: {
    totalIssues: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
    passed: boolean;
  };
  issues: Issue[];
}

const STORAGE_KEY = 'ui-validation-agent-urls';

function loadSavedUrls(): { figmaUrl: string; appUrl: string; screen: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { figmaUrl: '', appUrl: '', screen: '' };
    return { figmaUrl: '', appUrl: '', screen: '', ...JSON.parse(raw) };
  } catch {
    return { figmaUrl: '', appUrl: '', screen: '' };
  }
}

export function App() {
  const saved = loadSavedUrls();
  const [figmaUrl, setFigmaUrl] = useState(saved.figmaUrl);
  const [appUrl, setAppUrl] = useState(saved.appUrl);
  const [screen, setScreen] = useState(saved.screen);
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState('');

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ figmaUrl, appUrl, screen }),
    );
  }, [figmaUrl, appUrl, screen]);

  useEffect(() => {
    fetch('/api-report.json')
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json() as Promise<Report>;
      })
      .then((data) => {
        // Ignore placeholder sample so the form is the primary UI
        if (data && data.runId && data.runId !== 'sample') {
          setReport(data);
        }
      })
      .catch(() => undefined);
  }, []);

  const cliCommand = useMemo(() => {
    const parts = ['npm run validate --'];
    if (figmaUrl.trim()) {
      parts.push(`--figma-url "${figmaUrl.trim()}"`);
    }
    const target = screen.trim() || appUrl.trim();
    if (target) {
      parts.push(`--screen "${target}"`);
    }
    return parts.join(' ');
  }, [figmaUrl, appUrl, screen]);

  const canCopy = Boolean(figmaUrl.trim() && (appUrl.trim() || screen.trim()));

  async function copyCommand() {
    if (!canCopy) {
      setError('Enter both a Figma URL and an Application URL (or screen path).');
      return;
    }
    setError(null);
    await navigator.clipboard.writeText(cliCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function loadPasted() {
    try {
      setReport(JSON.parse(raw) as Report);
      setError(null);
    } catch {
      setError('Invalid JSON — paste the contents of output/reports/report.json');
    }
  }

  function clearReport() {
    setReport(null);
    setRaw('');
  }

  return (
    <div className="page">
      <header>
        <p className="brand">UI Validation Agent</p>
        <h1>Validate UI vs Figma</h1>
        <p className="sub">
          Enter your Figma design and application URL, then run the agent on your
          machine (Playwright cannot run in the browser).
        </p>
      </header>

      <section className="panel form-panel">
        <label className="field">
          <span>Figma URL</span>
          <input
            type="url"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/design/XXXX/Name?node-id=12-34"
          />
        </label>

        <label className="field">
          <span>Application URL</span>
          <input
            type="url"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder="https://your-app.com"
          />
        </label>

        <label className="field">
          <span>Screen / path (optional)</span>
          <input
            type="text"
            value={screen}
            onChange={(e) => setScreen(e.target.value)}
            placeholder="/login  or  https://your-app.com/dashboard"
          />
        </label>

        <div className="actions">
          <button type="button" onClick={copyCommand} disabled={!canCopy}>
            {copied ? 'Copied!' : 'Copy run command'}
          </button>
        </div>

        <div className="command-box">
          <p className="hint">
            1. In a terminal, open the project folder
            <br />
            2. Set <code>FIGMA_TOKEN</code> and <code>OPENAI_API_KEY</code> in{' '}
            <code>.env</code>
            <br />
            3. Paste and run this command:
          </p>
          <pre>{cliCommand}</pre>
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h2 className="section-title">Load validation report</h2>
        <p className="hint">
          After a local run, open <code>output/reports/report.json</code> and paste
          it here to view results on this page.
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste report.json contents here"
          rows={8}
        />
        <div className="actions">
          <button type="button" onClick={loadPasted}>
            Load report
          </button>
          {report && (
            <button type="button" className="secondary" onClick={clearReport}>
              Clear report
            </button>
          )}
        </div>
      </section>

      {report && (
        <>
          <section className="stats">
            <div className={`stat ${report.summary.passed ? 'ok' : 'bad'}`}>
              <strong>{report.summary.passed ? 'PASS' : 'FAIL'}</strong>
              <span>Status</span>
            </div>
            <div className="stat">
              <strong>{report.summary.totalIssues}</strong>
              <span>Issues</span>
            </div>
            <div className="stat">
              <strong>{report.summary.critical}</strong>
              <span>Critical</span>
            </div>
            <div className="stat">
              <strong>{report.summary.major}</strong>
              <span>Major</span>
            </div>
          </section>

          <p className="meta">
            Run {report.runId} · {report.appUrl}
            <br />
            {report.startedAt} → {report.finishedAt}
          </p>

          {report.issues.length === 0 ? (
            <p className="hint">No issues in this report.</p>
          ) : (
            <ul className="issues">
              {report.issues.map((issue) => (
                <li key={issue.id}>
                  <div className="row">
                    <span className={`sev sev-${issue.severity}`}>
                      {issue.severity}
                    </span>
                    <span className="cat">{issue.category}</span>
                  </div>
                  <h2>{issue.title}</h2>
                  <p>{issue.description}</p>
                  {issue.suggestedFix && (
                    <p className="fix">Fix: {issue.suggestedFix}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
