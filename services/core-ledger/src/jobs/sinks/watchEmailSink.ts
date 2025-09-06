// src/jobs/sinks/watchEmailSink.ts
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';

const minutes =
  Math.max(1, Number(process.env.EMAIL_SINK_INTERVAL_MIN || 10)) | 0;

const CWD = process.cwd(); // should already be services/core-ledger
const CMD = process.platform === 'win32'
  ? 'npm run sink:email:once --silent'
  : 'npm run sink:email:once --silent';

let running = false;
let lastExitCode: number | null = null;

function now() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function runOnce(): Promise<number> {
  return new Promise((resolve) => {
    // Use shell:true so Windows launches via cmd.exe (avoids EINVAL)
    const child = spawn(CMD, {
      cwd: CWD,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    child.stdout.on('data', (b) =>
      process.stdout.write(`[sink] ${b.toString()}`)
    );
    child.stderr.on('data', (b) =>
      process.stderr.write(`[sink] ${b.toString()}`)
    );

    child.on('close', (code) => resolve(code ?? 0));
  });
}

async function tick() {
  if (running) {
    console.log(
      `[watchEmailSink] ${now()} — previous run still in progress, skipping this tick.`
    );
    return;
  }
  running = true;
  console.log(`[watchEmailSink] ${now()} — starting scan…`);
  try {
    lastExitCode = await runOnce();
    const status = lastExitCode === 0 ? 'OK' : `EXIT ${lastExitCode}`;
    console.log(`[watchEmailSink] ${now()} — finished scan (${status}).`);
  } catch (err: any) {
    console.error(`[watchEmailSink] ${now()} — error:`, err?.message || err);
  } finally {
    running = false;
  }
}

console.log(
  `[watchEmailSink] starting — interval ${minutes} minute(s). ` +
    `Override with EMAIL_SINK_INTERVAL_MIN in .env`
);

// kick off immediately, then every N minutes
tick();
setInterval(tick, minutes * 60 * 1000);
