# UI Validation Agent

Enterprise-grade **AI-powered UI Validation Agent** that compares a live web application against Figma design specs using Playwright, pixel-diff, design-token checks, and GPT-4o Vision.

## What it does

1. Reads design specs from the **Figma API** → structured JSON design model + PNG export  
2. Opens/navigates the app with **Playwright** (Chromium / Firefox / WebKit), optional login, screenshots  
3. **Pixel comparison** (`pixelmatch` + `pngjs`) with diff images and heatmaps  
4. **GPT-4o Vision** (or Azure OpenAI) for semantic UI diffs + root-cause / fix suggestions  
5. **Design token validation** against DOM computed styles (colors, typography, radius, spacing, dimensions, alignment)  
6. **Responsive checks** at `1920×1080`, `1366×768`, `768×1024`, `390×844`  
7. Reports: **`report.html`**, **`report.json`**, **`report.pdf`**  
8. Optional **Jira** defect creation for critical/major issues  

## Project structure

```
/src
  /agents          ValidationAgent orchestrator
  /services        Token, responsive, root-cause analyzers
  /playwright      BrowserAgent (nav, login, screenshots, DOM styles)
  /figma           Figma client + parser → DesignModel
  /vision          PixelComparer + VisionComparer (OpenAI/Azure)
  /reports         HTML / JSON / PDF reporters
  /jira            Jira client (+ MFA / Azure DevOps stubs)
  /utils           Logger, retry, colors, filesystem
  /types           Shared domain types
  cli.ts           Commander CLI
/config            Typed Zod config loader
/tests             Vitest unit tests
/output            Screenshots, diffs, reports (gitignored)
/dashboard         Minimal React report viewer (optional)
```

## Quick start

```bash
cd C:\Users\JayasreeK\Projects\ui-validation-agent
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env with APP_URL, FIGMA_TOKEN, OPENAI_API_KEY, etc.
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run validate` | Full validation run |
| `npm run validate:figma` | Figma parse/export only |
| `npm run validate:responsive` | Responsive viewport suite |
| `npm run report` | Regenerate reports from `output/reports/report.json` |
| `npm test` | Unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Compile to `dist/` |

### CLI examples

```bash
# Full run with Figma URL + specific screen
npm run validate -- --figma-url "https://www.figma.com/design/KEY/Name?node-id=1-2" --screen /login

# Visual + token modes
npx tsx src/cli.ts validate --mode visual --screen /dashboard
npx tsx src/cli.ts validate --mode tokens --figma-url "https://www.figma.com/file/KEY/App"

# Headed browser + Jira
npx tsx src/cli.ts validate --headed --create-jira

# Regenerate reports
npm run report
```

## Configuration

Copy `.env.example` → `.env`. Key variables:

| Variable | Purpose |
|----------|---------|
| `APP_URL` | Application under test |
| `APP_USERNAME` / `APP_PASSWORD` | Optional login (avoid bare `USERNAME` on Windows) |
| `FIGMA_TOKEN` / `FIGMA_FILE_KEY` / `FIGMA_NODE_ID` | Figma access |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | GPT-4o Vision |
| `AI_PROVIDER=azure` + `AZURE_OPENAI_*` | Azure OpenAI |
| `PIXEL_DIFF_*` / `COLOR_TOLERANCE` / `SPACING_TOLERANCE_PX` | Thresholds |
| `VIEWPORTS` | Comma-separated `WxH` list |
| `JIRA_ENABLED` + `JIRA_*` | Optional defect creation |
| `BROWSER` / `HEADLESS` | Playwright settings |

Typed loading lives in `config/` (`zod` schema + `loadConfig()`).

## Example workflow

1. Set credentials in `.env`  
2. `npm run validate -- --figma-url "<figma>" --screen /home`  
3. Open `output/reports/report.html`  
4. (Optional) open the React viewer: `cd dashboard && npm install && npm run dev`  
5. (Optional) enable Jira and re-run with `--create-jira`  

## Architecture

```
CLI (commander)
   └─ ValidationAgent
         ├─ FigmaService → DesignModel + baseline PNG
         ├─ BrowserAgent → navigate / login / screenshots / DOM styles
         ├─ PixelComparer + VisionComparer
         ├─ DesignTokenValidator
         ├─ ResponsiveValidator
         ├─ RootCauseAnalyzer
         ├─ ReportGenerator (HTML/JSON/PDF)
         └─ JiraClient (optional)
```

Modules follow a SOLID-ish layout: parsers, I/O clients, and validators are separate; the agent only orchestrates. Logging, retries, and typed config are shared via `utils` / `config`.

## Optional stubs

- **MFA**: implement `MfaLoginHandler` (`src/jira/index.ts`) and wire into `BrowserAgent.login`  
- **Azure DevOps**: `AzureDevOpsClient` interface ready for a real work-item client  

## Playwright browsers

```bash
npx playwright install chromium
# or: npm run prepare:browsers
```

If download fails with TLS/`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` (common on corporate proxies), install browsers on a network that trusts the Playwright CDN, or set `NODE_EXTRA_CA_CERTS` to your corp root CA.

## Dashboard (nice-to-have)

A minimal Vite + React viewer under `/dashboard` loads `../output/reports/report.json` (or a pasted JSON payload) to browse issues.

## License

MIT
