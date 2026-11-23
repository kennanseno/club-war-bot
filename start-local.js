import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['app.js'], { stdio: 'inherit' }),
  spawn(
    'ngrok',
    [
      'http',
      'http://localhost:3000',
      '--url',
      'https://atom-shivering-attention.ngrok-free.dev',
    ],
    { stdio: 'inherit' },
  ),
];

let shuttingDown = false;

function stopChildren(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`Unable to start ${child.spawnfile}:`, error);
    stopChildren(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `${child.spawnfile} exited unexpectedly (${signal ?? `code ${code}`}); stopping the other process.`,
    );
    stopChildren(code || 1);
  });
}

process.on('SIGINT', () => stopChildren(130));
process.on('SIGTERM', () => stopChildren(143));
