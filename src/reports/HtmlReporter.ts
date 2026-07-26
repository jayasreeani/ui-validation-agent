import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../config/index.js';
import type { ValidationRunResult } from '../types/index.js';
import { ensureDir, logger } from '../utils/index.js';

function severityBadge(severity: string): string {
  const colors: Record<string, string> = {
    critical: '#b91c1c',
    major: '#c2410c',
    minor: '#a16207',
    info: '#1d4ed8',
  };
  const bg = colors[severity] ?? '#525252';
  return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;text-transform:uppercase;">${severity}</span>`;
}

function relPath(fromDir: string, absolute?: string): string {
  if (!absolute) return '';
  // Prefer paths relative to report folder for portability
  try {
    const path = absolute.replace(/\\/g, '/');
    const base = fromDir.replace(/\\/g, '/');
    if (path.startsWith(base)) {
      return path.slice(base.length).replace(/^\//, '');
    }
    // Fall back to going up from reports/ to output/
    const parts = path.split('/');
    const outIdx = parts.lastIndexOf('output');
    if (outIdx >= 0) {
      return '../' + parts.slice(outIdx + 1).join('/');
    }
    return path;
  } catch {
    return absolute;
  }
}

export class HtmlReporter {
  constructor(private readonly config: AppConfig) {}

  async generate(result: ValidationRunResult, outputDir: string): Promise<string> {
    await ensureDir(outputDir);
    const outPath = join(outputDir, 'report.html');
    const s = result.summary;

    const issueRows = result.issues
      .map(
        (issue) => `
      <tr>
        <td>${severityBadge(issue.severity)}</td>
        <td>${escapeHtml(issue.category)}</td>
        <td>
          <strong>${escapeHtml(issue.title)}</strong>
          <div class="desc">${escapeHtml(issue.description)}</div>
          ${issue.expected ? `<div class="meta"><b>Expected:</b> ${escapeHtml(issue.expected)}</div>` : ''}
          ${issue.actual ? `<div class="meta"><b>Actual:</b> ${escapeHtml(issue.actual)}</div>` : ''}
          ${issue.rootCause ? `<div class="meta"><b>Root cause:</b> ${escapeHtml(issue.rootCause)}</div>` : ''}
          ${issue.suggestedFix ? `<div class="meta fix"><b>Fix:</b> ${escapeHtml(issue.suggestedFix)}</div>` : ''}
        </td>
        <td>${escapeHtml(issue.element ?? issue.viewport ?? '—')}</td>
      </tr>`,
      )
      .join('\n');

    const screenshots = result.screenshots
      .map((p) => {
        const src = relPath(outputDir, p);
        return `<figure><img src="${src}" alt="screenshot"/><figcaption>${escapeHtml(src)}</figcaption></figure>`;
      })
      .join('\n');

    const heatmap =
      result.pixelDiff?.heatmapPath
        ? `<figure><img src="${relPath(outputDir, result.pixelDiff.heatmapPath)}" alt="heatmap"/><figcaption>Diff heatmap</figcaption></figure>`
        : '';

    const pixelBlock = result.pixelDiff
      ? `<section class="card">
          <h2>Pixel comparison</h2>
          <p>${result.pixelDiff.passed ? '✅ Passed' : '❌ Failed'} — ${result.pixelDiff.diffPercent}% differing (${result.pixelDiff.diffPixels} / ${result.pixelDiff.totalPixels} pixels)</p>
          <figure><img src="${relPath(outputDir, result.pixelDiff.diffImagePath)}" alt="pixel diff"/></figure>
          ${heatmap}
        </section>`
      : '';

    const visionBlock = result.visionDiff
      ? `<section class="card">
          <h2>AI Vision</h2>
          <p>${escapeHtml(result.visionDiff.summary)}</p>
        </section>`
      : '';

    const responsiveBlock =
      result.responsiveResults.length > 0
        ? `<section class="card">
            <h2>Responsive</h2>
            <div class="grid">
              ${result.responsiveResults
                .map(
                  (r) => `
                <figure>
                  <img src="${relPath(outputDir, r.screenshotPath)}" alt="${r.viewport.name}"/>
                  <figcaption>${r.viewport.width}×${r.viewport.height} — ${r.issues.length} issue(s)</figcaption>
                </figure>`,
                )
                .join('')}
            </div>
          </section>`
        : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(this.config.reportTitle)}</title>
  <style>
    :root {
      --bg: #0f1419;
      --surface: #1a2332;
      --text: #e8eef7;
      --muted: #9db0c7;
      --accent: #3d9cf0;
      --border: #2a3a4f;
      --pass: #22c55e;
      --fail: #ef4444;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "IBM Plex Sans", system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 10% -10%, #1e3a5f 0%, transparent 50%),
                  radial-gradient(900px 500px at 100% 0%, #1a2f28 0%, transparent 45%),
                  var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    header {
      padding: 2.5rem 2rem 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    header h1 { margin: 0 0 0.35rem; font-size: 1.75rem; letter-spacing: -0.02em; }
    header p { margin: 0; color: #9db0c7; }
    main { padding: 1.5rem 2rem 3rem; max-width: 1200px; margin: 0 auto; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }
    .stat {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem;
      text-align: center;
    }
    .stat .n { font-size: 1.75rem; font-weight: 700; }
    .stat .l { color: #9db0c7; font-size: 0.85rem; }
    .pass { color: var(--pass); }
    .fail { color: var(--fail); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.25rem;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { text-align: left; padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: #9db0c7; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .desc { color: #c5d4e8; margin-top: 0.25rem; }
    .meta { margin-top: 0.35rem; font-size: 0.85rem; color: #9db0c7; }
    .fix { color: #86efac; }
    figure { margin: 0.75rem 0; }
    img { max-width: 100%; border-radius: 8px; border: 1px solid var(--border); background: #000; }
    figcaption { font-size: 0.8rem; color: #9db0c7; margin-top: 0.35rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(this.config.reportTitle)}</h1>
    <p>Run <code>${escapeHtml(result.runId)}</code> · ${escapeHtml(result.startedAt)} → ${escapeHtml(result.finishedAt)}</p>
    <p>App: ${escapeHtml(result.appUrl)}${result.screen ? ` · Screen: ${escapeHtml(result.screen)}` : ''}${result.figmaUrl ? ` · Figma: ${escapeHtml(result.figmaUrl)}` : ''}</p>
  </header>
  <main>
    <section class="summary">
      <div class="stat"><div class="n ${s.passed ? 'pass' : 'fail'}">${s.passed ? 'PASS' : 'FAIL'}</div><div class="l">Status</div></div>
      <div class="stat"><div class="n">${s.totalIssues}</div><div class="l">Total issues</div></div>
      <div class="stat"><div class="n">${s.critical}</div><div class="l">Critical</div></div>
      <div class="stat"><div class="n">${s.major}</div><div class="l">Major</div></div>
      <div class="stat"><div class="n">${s.minor}</div><div class="l">Minor</div></div>
      <div class="stat"><div class="n">${s.info}</div><div class="l">Info</div></div>
    </section>

    ${pixelBlock}
    ${visionBlock}
    ${responsiveBlock}

    <section class="card">
      <h2>Issues</h2>
      ${
        result.issues.length === 0
          ? '<p>No issues detected.</p>'
          : `<table>
              <thead><tr><th>Severity</th><th>Category</th><th>Details</th><th>Element</th></tr></thead>
              <tbody>${issueRows}</tbody>
            </table>`
      }
    </section>

    <section class="card">
      <h2>Screenshots</h2>
      <div class="grid">${screenshots || '<p>None</p>'}</div>
    </section>
  </main>
</body>
</html>`;

    await writeFile(outPath, html, 'utf8');
    logger.info('HTML report written', { outPath });
    return outPath;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
