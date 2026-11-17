import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { SECURITY_HEADERS, allowedFsDirs, guardPlugin } from './viteGuard.js';

const CLIENT_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Port du serveur : ELITE_PORT (app de bureau : un port libre si 3001 est pris), sinon 3001 ; 127.0.0.1 seulement. */
const portServeur = (() => {
  const v = String(process.env.ELITE_PORT ?? '').trim();
  const p = /^\d{4,5}$/.test(v) ? Number(v) : NaN;
  return p >= 1024 && p <= 65535 ? p : 3001;
})();

// Le front appelle /api/... : Vite redirige vers le serveur Express (port 3001, ou ELITE_PORT).
// changeOrigin : le serveur reçoit Host 127.0.0.1:3001 (seuls localhost:3001 et 127.0.0.1:3001 y sont
// acceptés) ; l'en-tête Origin du navigateur, lui, passe tel quel (http://127.0.0.1:5173 attendu).
export default defineConfig({
  // Garde de l'interface (viteGuard.js), avant tout le reste : /__open-in-editor coupé, cadres, images et scripts
  // demandés par un autre site refusés, aucune page encadrable
  plugins: [guardPlugin(), react()],
  server: {
    // 127.0.0.1 seulement, et pas « localhost » : Vite n'écoutait alors que sur [::1]:5173, et un autre programme
    // pouvait prendre 127.0.0.1:5173 sans que strictPort le voie ; le navigateur et l'overlay tombaient chez lui dès que
    // Vite ne répondait pas. Désormais, si 127.0.0.1:5173 est pris, Vite s'arrête.
    host: '127.0.0.1',
    port: 5173,
    // Jamais d'autre port : le serveur n'accepte que l'origine http://127.0.0.1:5173 (ou localhost:5173),
    // et l'overlay ouvre ses fenêtres sur ce port. Si 5173 est pris, Vite s'arrête au lieu de changer.
    strictPort: true,
    // Aucun en-tête CORS : la page et l'API sont servies par la même origine, aucune autre n'a à les lire. Par défaut,
    // Vite autoriserait toute page « localhost » ou « *.localhost » d'un autre port (un autre programme de ce PC, un
    // site qui se ferait servir là) à lire ses réponses, y compris celles du proxy /api. Vaut aussi pour vite preview.
    cors: false,
    headers: SECURITY_HEADERS,
    // Fichiers servis par /@fs/ : le client et les paquets seulement. Par défaut, toute la racine du dépôt l'était,
    // server/data compris (jeton d'escadron en clair, base, captures) et .git.
    fs: { strict: true, allow: allowedFsDirs(CLIENT_DIR) },
    proxy: {
      '/api': { target: `http://127.0.0.1:${portServeur}`, changeOrigin: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    headers: SECURITY_HEADERS,
  },
});
