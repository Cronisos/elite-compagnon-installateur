// Lance l'overlay. Depuis un terminal de VS Code, ELECTRON_RUN_AS_NODE est défini et ferait
// tourner Electron comme un simple Node : on le retire.
//
// Lancé par le serveur de l'app (sans terminal : core/overlay.js, sortie ignorée), Electron part détaché et ce Node
// s'arrête aussitôt, au lieu de rester en mémoire tout le temps de l'overlay pour relayer un code de sortie que personne
// n'attend. Depuis un terminal (npm run overlay), ou avec --attendre : il attend Electron et montre sa sortie, comme avant.

const { spawn } = require('node:child_process');
const electron = require('electron'); // chemin de l'exécutable

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv.slice(2).filter((a) => a !== '--attendre');
const detache = !process.stdout.isTTY && !process.argv.includes('--attendre');
const child = spawn(electron, ['.', ...args], { cwd: __dirname, env, stdio: detache ? 'ignore' : 'inherit', detached: detache });
if (detache) {
  child.on('error', () => process.exit(1));
  child.unref();
  process.exit(0);
} else {
  child.on('exit', (code) => process.exit(code ?? 0));
}
