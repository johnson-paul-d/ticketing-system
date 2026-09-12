// Builds the frontend for the single-origin deployment, where this backend
// serves the built files itself (see the FRONTEND block in server.js).
//
//   npm run build:frontend        from backend/
//
// VITE_API_URL is forced to "/api" so the app talks to whichever origin served
// it — the tunnel hostname in production, http://localhost:PORT when checking
// locally. Any other VITE_* variables (LinkedIn client id and redirect) are
// read from frontend/.env by Vite as usual. Cross-platform on purpose: the
// equivalent one-liner needs different quoting on PowerShell, cmd and bash.

const { spawnSync } = require('child_process');
const path = require('path');

const frontend = path.resolve(__dirname, '..', '..', 'frontend');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const run = (args) => {
  const result = spawnSync(npx, args, {
    cwd: frontend,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, VITE_API_URL: '/api' },
  });
  if (result.status !== 0) process.exit(result.status || 1);
};

run(['vite', 'build']);
console.log(`\nFrontend built to ${path.join(frontend, 'dist')} with VITE_API_URL=/api`);
