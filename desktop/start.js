// Lance l'app de bureau depuis un terminal (npm run bureau). Depuis un terminal de VS Code, ELECTRON_RUN_AS_NODE est
// défini et ferait tourner Electron comme un simple Node : on le retire. Electron vient de l'overlay (même version).

const { spawn } = require('node:child_process');
const electron = require('electron'); // chemin de l'exécutable

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', ...process.argv.slice(2)], { cwd: __dirname, env, stdio: 'inherit', detached: process.argv.includes('--detache') });
if (process.argv.includes('--detache')) {
  child.unref();
  process.exit(0);
}
child.on('exit', (code) => process.exit(code ?? 0));
