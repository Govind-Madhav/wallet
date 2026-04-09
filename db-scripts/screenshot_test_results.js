require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'report-screenshots');
const MAX_LINES = 35;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeOutput = (text) => String(text || '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .split('\n')
  .filter((line) => line.trim().length > 0);

const extractTestCaseLines = (output) => normalizeOutput(output)
  .filter((line) => /^(PASS|FAIL)\s+/i.test(line))
  .slice(0, 10);

const getSummaryLine = (output) => {
  const lines = normalizeOutput(output);
  const summaryCandidates = lines.filter((line) => /pass|fail|test(s)?|snapshot|time/i.test(line));
  return summaryCandidates.slice(-6);
};

const createHtml = ({ status, command, code, output, stderr, durationMs }) => {
  const combined = [...getSummaryLine(output), ...getSummaryLine(stderr)];
  const lines = combined.length ? combined : normalizeOutput(output + '\n' + stderr);
  const visibleLines = lines.slice(-MAX_LINES);
  const testCases = extractTestCaseLines(`${output}\n${stderr}`);
  const casesHtml = testCases.length
    ? testCases.map((line) => `<div class="case">${escapeHtml(line)}</div>`).join('')
    : '<div class="line muted">No test case lines captured.</div>';
  const logHtml = visibleLines.length
    ? visibleLines.map((line) => `<div class="line">${escapeHtml(line)}</div>`).join('')
    : '<div class="line muted">No terminal output captured.</div>';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        padding: 24px;
        background: #f8fafc;
        color: #0f172a;
        font-family: Inter, Segoe UI, Arial, sans-serif;
      }
      .card {
        width: fit-content;
        min-width: 980px;
        background: #fff;
        border: 1px solid #dbe3ef;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        padding: 18px;
      }
      h1 {
        margin: 0 0 6px 0;
        font-size: 26px;
      }
      .meta {
        margin: 0 0 12px 0;
        color: #64748b;
        font-size: 14px;
      }
      .status {
        display: inline-block;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 12px;
      }
      .status.pass { background: #dcfce7; color: #166534; }
      .status.fail { background: #fee2e2; color: #991b1b; }
      .status.run { background: #dbeafe; color: #1d4ed8; }
      .info {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 14px;
      }
      .pill {
        background: #f8fafc;
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 13px;
      }
      .pill strong {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .section {
        margin-top: 12px;
      }
      .section-title {
        margin: 0 0 8px 0;
        color: #334155;
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .cases {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 14px;
      }
      .case {
        background: #ecfeff;
        color: #155e75;
        border: 1px solid #a5f3fc;
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 14px;
        font-family: Consolas, Monaco, monospace;
      }
      .log {
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 12px;
        padding: 14px 16px;
        min-width: 940px;
        font-family: Consolas, Monaco, monospace;
        font-size: 15px;
        line-height: 1.5;
        border: 1px solid rgba(255,255,255,0.08);
      }
      .line { white-space: pre-wrap; }
      .line.muted { color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Test Results</h1>
      <p class="meta">Generated from the terminal test run for the report.</p>
      <div class="status ${status}">${status.toUpperCase()}</div>
      <div class="info">
        <div class="pill"><strong>Command</strong>${escapeHtml(command)}</div>
        <div class="pill"><strong>Exit Code</strong>${escapeHtml(code)}</div>
        <div class="pill"><strong>Duration</strong>${escapeHtml(durationMs)} ms</div>
        <div class="pill"><strong>Output Lines</strong>${escapeHtml(visibleLines.length)}</div>
      </div>
      <div class="section">
        <div class="section-title">Test Cases</div>
        <div class="cases">${casesHtml}</div>
      </div>
      <div class="section">
        <div class="section-title">Terminal Output</div>
        <div class="log">${logHtml}</div>
      </div>
    </div>
  </body>
</html>`;
};

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const testDir = path.resolve(__dirname, '..', 'backend', 'src', 'auth-engine');
  const npmCmd = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm test'] : ['test'];
  const command = 'npm test';
  const start = Date.now();
  const result = spawnSync(npmCmd, npmArgs, {
    cwd: testDir,
    encoding: 'utf8',
    shell: false,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  const durationMs = Date.now() - start;

  const status = result.status === 0 ? 'pass' : 'fail';
  const output = result.stdout || '';
  const stderr = result.stderr || '';
  const runnerError = result.error ? `${result.error.name || 'Error'}: ${result.error.message || String(result.error)}` : '';

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });

  await page.setContent(createHtml({
    status,
    command,
    code: result.status,
    output,
    stderr: `${stderr}\n${runnerError}`.trim(),
    durationMs
  }), { waitUntil: 'load' });

  await page.locator('.card').screenshot({
    path: path.join(OUTPUT_DIR, 'test-results.png'),
    type: 'png'
  });

  await browser.close();

  console.log(`Saved screenshot: ${path.join('report-screenshots', 'test-results.png')}`);
  if (result.status !== 0) {
    console.log('\n--- TEST STDOUT ---\n');
    process.stdout.write(output);
    console.log('\n--- TEST STDERR ---\n');
    process.stderr.write(`${stderr}\n${runnerError}`.trim());
    process.exit(result.status || 1);
  }
}

main().catch((error) => {
  console.error('Screenshot generation failed:', error);
  process.exit(1);
});
