import { useEffect, useState } from 'react';

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

export function App() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState('');

  useEffect(() => {
    fetch('/api-report.json')
      .then(async (r) => {
        if (!r.ok) throw new Error('No bundled report — paste JSON below or copy report.json into dashboard/public');
        return r.json() as Promise<Report>;
      })
      .then(setReport)
      .catch((e: Error) => setError(e.message));
  }, []);

  function loadPasted() {
    try {
      setReport(JSON.parse(raw) as Report);
      setError(null);
    } catch {
      setError('Invalid JSON');
    }
  }

  return (
    <div className="page">
      <header>
        <p className="brand">UI Validation Agent</p>
        <h1>Report viewer</h1>
        <p className="sub">Browse issues from `output/reports/report.json`</p>
      </header>

      {!report && (
        <section className="panel">
          <p>{error ?? 'Loading…'}</p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste report.json contents here"
            rows={10}
          />
          <button type="button" onClick={loadPasted}>
            Load JSON
          </button>
        </section>
      )}

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

          <ul className="issues">
            {report.issues.map((issue) => (
              <li key={issue.id}>
                <div className="row">
                  <span className={`sev sev-${issue.severity}`}>{issue.severity}</span>
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
        </>
      )}
    </div>
  );
}
