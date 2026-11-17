// Module « IA de bord » (Alicia ; facultatif : la version escadron est mise en paquet sans lui, modules/index.js).
// Un modèle qui tourne sur ce PC (Ollama) répond aux questions du joueur, avec des outils qui lisent l'app ; la
// réponse s'affiche dans la fenêtre principale et dans la bulle du Copilote (module Compagnon, par son API).
//
// - memoire.js      : mémoire vidéo libre, choix du modèle (grand, léger, aucun), déchargement quand le jeu en manque ;
// - ollama.js       : client d'Ollama (http://127.0.0.1:11434) ;
// - outils.js       : ce que le modèle peut lire de l'app ;
// - actions.js      : ce qu'il peut y faire, comme un clic (boussole, mode, interface, pages) ;
// - conversation.js : consigne, tours avec outils, texte de la bulle ;
// - reglages.js     : réglages (server/data/ia.json) ;
// - parole.js       : voix naturelle (Supertonic, sur le processeur), la voix de Windows en secours.
// Rien ne sort du PC : le modèle tourne ici, l'historique reste dans server/data/ia-historique.json.

import express from 'express';
import { isPlainObject, readJsonFile, writeJsonAtomicSync } from '../../core/atomic.js';
import { dataPath } from '../../core/paths.js';
import { localFetch } from '../../core/net.js';
import { GUARD_HEADER, GUARD_VALUE } from '../../core/localGuard.js';
import { aDecharger, besoinMo, choisirModele, memoireVideo } from './memoire.js';
import { clientOllama } from './ollama.js';
import { pourLaBulle, repondre } from './conversation.js';
import { ficheJoueur } from './fiche.js';
import { MAX_AUDIO_OCTETS, cheminsWhisper, ecoutePrete, estWavAttendu, transcrire } from './ecoute.js';
import { nettoyerReglages, REGLAGES_DEFAUT } from './reglages.js';
import { CONSIGNE_VUE, DemandesVue, estJpegB64 } from './vue.js';
import { OUTILS } from './outils.js';
import { actions, chargerPages } from './actions.js';
import { SonsRecents, VOIX_NATURELLES, cheminsParole, parolePrete, synthetiser, voixNaturelle } from './parole.js';

export const MAX_QUESTION = 1000;
const MAX_HISTORIQUE = 60;
const SURVEILLANCE_MS = 5_000;

export default {
  id: 'ia',
  name: 'IA de bord',

  async register({ router, broadcast, game, overlay, selfUrl = 'http://127.0.0.1:3001' }, {
    fichierReglages = dataPath('ia.json'),
    fichierHistorique = dataPath('ia-historique.json'),
    ollama = clientOllama(),
    lireMemoire = memoireVideo,
    fetchImpl, // vide : celui de la passerelle (core/net.js, localFetch)
    transcrireImpl = transcrire,
    whisperPret = ecoutePrete,
    parlerImpl = synthetiser,
    paroleChemins = cheminsParole,
    paroleOk = parolePrete,
    chargerPagesImpl = chargerPages,
  } = {}) {
    let reglages = nettoyerReglages(readJsonFile(fichierReglages, { fallback: {}, accept: isPlainObject, label: 'IA de bord' })).reglages;
    let historique = readJsonFile(fichierHistorique, { fallback: [], accept: Array.isArray, label: 'IA de bord, historique' })
      .filter((m) => isPlainObject(m) && (m.role === 'user' || m.role === 'assistant') && typeof m.texte === 'string')
      .slice(-MAX_HISTORIQUE);
    let occupe = false;
    let seq = historique.reduce((n, m) => Math.max(n, Number(m.id) || 0), 0);
    let utiliseJusqua = 0; // un modèle peut être chargé jusqu'à cette heure : la surveillance tourne jusque-là
    let alerte = null; // dernier déchargement forcé { at, texte }

    let enCours = null; // modèle de la question en cours { nom, numGpu } : la vue du jeu passe par le même
    const lire = async (chemin, { timeoutMs = 5000 } = {}) => {
      const res = await localFetch(`${selfUrl}${chemin}`, {}, { fetchImpl, timeoutMs });
      return res.ok ? res.json() : null;
    };
    // Écriture sur l'API locale, comme l'interface (actions.js) : la réponse, ou { erreur } lisible pour le modèle
    const agir = async (chemin, { method = 'POST', body } = {}) => {
      try {
        const res = await localFetch(`${selfUrl}${chemin}`, {
          method,
          headers: { 'Content-Type': 'application/json', [GUARD_HEADER]: GUARD_VALUE },
          body: JSON.stringify(body ?? {}),
        }, { fetchImpl, timeoutMs: 5000 });
        const data = await res.json().catch(() => null);
        return res.ok ? (data ?? { ok: true }) : { erreur: data?.error || `refusé (${res.status})` };
      } catch (err) {
        return { erreur: `app injoignable (${err.message})` };
      }
    };
    const ACTIONS = actions({ pages: await chargerPagesImpl() });
    /**
     * Bulle du Compagnon (son avatar, son nom) : sans lui, la réponse reste dans la fenêtre principale. `parler` : la
     * réponse est aussi dite à voix haute, si la voix est allumée.
     */
    async function dire(texte, humeur = 'neutre', { parler = false } = {}) {
      const voix = parler && reglages.voix ? { parler: true, voix: reglages.voixNom || null, vitesse: reglages.voixVitesse, hauteur: reglages.voixHauteur, volume: reglages.voixVolume } : {};
      const sid = voix.parler ? voixNaturelle(reglages.voixNom) : null;
      if (sid != null) {
        // Voix naturelle : le son est prêt avant la bulle (les deux partent ensemble) ; sinon, Windows par défaut
        voix.voix = null;
        const audio = await sonNaturel(texte, sid, reglages.voixVitesse);
        if (audio) voix.audio = audio;
      }
      try {
        await localFetch(`${selfUrl}/api/modules/compagnon/dire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [GUARD_HEADER]: GUARD_VALUE },
          body: JSON.stringify({ texte, humeur, source: 'ia', ...voix }),
        }, { fetchImpl, timeoutMs: 3000 });
      } catch { /* Copilote absent ou coupé */ }
    }
    // --- Voix naturelle (parole.js) : sons gardés en mémoire le temps que la fenêtre en jeu les joue ---
    const sons = new SonsRecents();
    async function sonNaturel(texte, sid, vitesse) {
      const chemins = paroleChemins();
      if (!paroleOk(chemins)) return null;
      try {
        return `/api/modules/ia/voix/${sons.garder(await parlerImpl(texte, { ...chemins, sid, vitesse }))}`;
      } catch (err) {
        console.error(`IA de bord : ${err.message} (voix de Windows à la place)`);
        return null;
      }
    }
    async function nomDuCopilote() {
      try {
        return (await lire('/api/modules/compagnon/state'))?.settings?.name || 'Alicia';
      } catch {
        return 'Alicia';
      }
    }

    const numGpuCharges = new Map(); // modèle → couches sur la carte imposées à son chargement (même valeur : pas de rechargement)
    async function modelesConnus() {
      const [installes, charges] = await Promise.all([ollama.installes(), ollama.charges().catch(() => [])]);
      const fiche = async (role) => {
        const nom = reglages[role];
        const i = installes.find((m) => m.nom === nom);
        const charge = charges.some((c) => c.nom === nom);
        // Le moyen peut être réparti entre la carte et le processeur : il lui faut son nombre de couches
        const couches = role === 'moyen' && i ? await ollama.couches(nom).catch(() => null) : null;
        return {
          role, nom, installe: Boolean(i), besoinMo: i ? besoinMo(i.taille) : null, charge,
          numGpuCharge: charge ? numGpuCharges.get(nom) ?? null : null,
          reparti: couches ? { couches, parCoucheMo: i.taille / couches / 1024 ** 2 } : null,
        };
      };
      return { grand: await fiche('grand'), moyen: await fiche('moyen'), leger: await fiche('leger'), charges };
    }

    async function etat() {
      const memoire = await lireMemoire();
      let modeles = null;
      let ollamaErreur = null;
      // IA coupée (le défaut) : Ollama n'est pas interrogé du tout, même pour la liste des modèles (un membre sans
      // Ollama ne voit pas d'erreur, et rien ne tourne pour rien)
      if (reglages.actif) {
        try {
          modeles = await modelesConnus();
        } catch (err) {
          ollamaErreur = `Ollama ne répond pas (${err.message}). Il se lance avec Windows ; sinon, ouvre « Ollama » depuis le menu Démarrer.`;
        }
      }
      const chemins = cheminsWhisper(reglages);
      return {
        reglages, memoire, modeles, ollamaErreur, occupe, alerte, ecoute: { pret: whisperPret(chemins), ...chemins },
        parole: { pret: paroleOk(paroleChemins()), voix: VOIX_NATURELLES },
        vision: { overlay: Boolean(vueAt && Date.now() - vueAt < 5000) }, // l'overlay est passé il y a moins de 5 s
      };
    }
    const diffuserEtat = async () => broadcast('ia:etat', await etat());

    function ajouter(message) {
      const m = { id: ++seq, at: new Date().toISOString(), ...message };
      historique = [...historique, m].slice(-MAX_HISTORIQUE);
      try {
        writeJsonAtomicSync(fichierHistorique, historique);
      } catch (err) {
        console.error(`IA de bord : historique non enregistré (${err.message})`);
      }
      broadcast('ia:message', m);
      return m;
    }

    async function toutDecharger() {
      const charges = await ollama.charges().catch(() => []);
      const nos = charges.filter((c) => [reglages.grand, reglages.moyen, reglages.leger].includes(c.nom));
      await Promise.all(nos.map((c) => ollama.decharger(c.nom).catch(() => {})));
      for (const c of nos) numGpuCharges.delete(c.nom);
      return nos.map((c) => c.nom);
    }

    // --- Fenêtre en jeu (/hud/ia) : ouverte si le réglage le demande ---
    const FENETRE = 'ia';
    if (reglages.fenetre) overlay?.setExtra?.(FENETRE, true);

    // --- Surveillance : le jeu manque de mémoire vidéo → le modèle chargé est déchargé tout de suite ---
    setInterval(async () => {
      if (Date.now() > utiliseJusqua || occupe) return;
      const memoire = await lireMemoire();
      if (!aDecharger(memoire, reglages.margeMo)) return;
      const noms = await toutDecharger();
      utiliseJusqua = 0;
      if (!noms.length) return;
      alerte = { at: new Date().toISOString(), texte: `Mémoire vidéo presque pleine (${(memoire.libreMo / 1024).toFixed(1)} Go libres) : ${noms.join(', ')} déchargé pour laisser la place au jeu.` };
      diffuserEtat();
    }, SURVEILLANCE_MS).unref();

    // --- API ---
    router.get('/etat', async (req, res) => res.json(await etat()));
    router.get('/historique', (req, res) => res.json(historique));

    router.post('/question', async (req, res) => {
      const texte = typeof req.body?.texte === 'string' ? req.body.texte.trim() : '';
      if (!texte || texte.length > MAX_QUESTION) return res.status(400).json({ error: `Question attendue (1 à ${MAX_QUESTION} caractères).` });
      if (!reglages.actif) return res.status(409).json({ error: 'L’IA est coupée (réglages).' });
      if (occupe) return res.status(409).json({ error: 'Je réponds déjà à une question.' });
      occupe = true;
      const anterieur = historique.map((m) => ({ role: m.role, texte: m.texte }));
      const question = ajouter({ role: 'user', texte });
      diffuserEtat();
      try {
        let modeles;
        try {
          modeles = await modelesConnus();
        } catch {
          const m = ajouter({ role: 'assistant', texte: 'Ollama ne répond pas : je ne peux pas réfléchir sans lui. Il se lance avec Windows ; sinon, ouvre « Ollama » depuis le menu Démarrer.', erreur: true });
          dire(m.texte, 'inquiet');
          return res.status(503).json({ question, reponse: m });
        }
        const choix = choisirModele({
          memoire: await lireMemoire(),
          modeles: [modeles.grand, modeles.moyen, modeles.leger].filter((m) => m.installe),
          margeMo: reglages.margeMo,
          margeJeuMo: reglages.margeJeuMo,
        });
        if (!choix.nom) {
          const m = ajouter({ role: 'assistant', texte: choix.raison, erreur: true });
          dire(m.texte, 'inquiet', { parler: true });
          return res.json({ question, reponse: m });
        }
        dire('Je regarde ça…');
        utiliseJusqua = Date.now() + (reglages.garderSec + 30) * 1000;
        // Un autre modèle des nôtres encore chargé : déchargé avant, pour ne jamais en avoir deux sur la carte
        for (const c of modeles.charges) {
          if (c.nom !== choix.nom && [reglages.grand, reglages.moyen, reglages.leger].includes(c.nom)) {
            await ollama.decharger(c.nom).catch(() => {});
            numGpuCharges.delete(c.nom);
          }
        }
        if (choix.numGpu != null) numGpuCharges.set(choix.nom, choix.numGpu);
        else numGpuCharges.delete(choix.nom);
        const debut = Date.now();
        const [nom, fiche] = await Promise.all([nomDuCopilote(), ficheJoueur(lire).catch(() => null)]);
        enCours = { nom: choix.nom, numGpu: choix.numGpu };
        const r = await repondre({
          fiche,
          personnalite: reglages.personnalite,
          longueur: reglages.longueur,
          question: texte,
          historique: anterieur,
          chat: (messages, tools) => ollama.chat({ modele: choix.nom, messages, tools, garderSec: reglages.garderSec, numGpu: choix.numGpu }),
          lire,
          agir,
          nom,
          cmdr: game?.snapshot?.().commander ?? null,
          // Vue du jeu coupée : l'outil n'est même pas proposé au modèle
          outils: [...(reglages.vision ? OUTILS : OUTILS.filter((o) => o.nom !== 'regarder_ecran')), ...ACTIONS],
        });
        utiliseJusqua = Date.now() + (reglages.garderSec + 30) * 1000;
        const m = ajouter({
          role: 'assistant', texte: r.texte, modele: choix.nom, version: choix.role, leger: choix.role === 'leger',
          ...(choix.numGpu != null && modeles[choix.role]?.reparti ? { carte: Math.round((choix.numGpu / modeles[choix.role].reparti.couches) * 100) } : {}),
          outils: r.appels, sec: Math.round((Date.now() - debut) / 100) / 10,
          ...(r.nonVerifiee ? { nonVerifiee: true } : {}),
        });
        dire(pourLaBulle(r.texte), 'neutre', { parler: true });
        return res.json({ question, reponse: m });
      } catch (err) {
        const m = ajouter({ role: 'assistant', texte: `Je n’ai pas pu répondre (${err.message}).`, erreur: true });
        dire('Je n’ai pas pu répondre, désolé.', 'inquiet');
        return res.status(502).json({ question, reponse: m });
      } finally {
        occupe = false;
        enCours = null;
        diffuserEtat();
      }
    });

    // --- Vue du jeu (vue.js ; overlay/vision.js prend les images) ---
    const demandesVue = new DemandesVue();
    let vueAt = null; // dernier passage de l'overlay (témoin sur la page)
    // L'overlay passe toutes les secondes : la vue est-elle permise, la jauge des boucliers voulue, une photo demandée ?
    router.get('/vision', (req, res) => {
      vueAt = Date.now();
      const actif = reglages.actif && reglages.vision;
      res.json({ actif, bouclier: actif && reglages.visionBouclier, demande: actif ? demandesVue.enAttente() : null });
    });
    // L'image demandée (JPEG en base64), ou la raison pour laquelle il n'y en a pas
    router.post('/vision/image', (req, res) => {
      const b = req.body || {};
      if (typeof b.id !== 'string' || b.id.length > 40) return res.status(400).json({ error: 'Demande invalide.' });
      const reponse = estJpegB64(b.jpeg) ? { jpeg: b.jpeg } : { erreur: typeof b.erreur === 'string' ? b.erreur.slice(0, 200) : 'Image invalide.' };
      if (!demandesVue.rendre(b.id, reponse)) return res.status(404).json({ error: 'Aucune demande en attente sous ce numéro.' });
      return res.json({ ok: true });
    });
    // Outil regarder_ecran : une image du jeu, décrite par le modèle de la question en cours
    router.get('/vision/regarder', async (req, res) => {
      if (!reglages.actif || !reglages.vision) return res.json({ erreur: 'La vue du jeu est coupée (réglage « Lui permettre de regarder le jeu », sur sa page).' });
      if (!enCours) return res.status(409).json({ erreur: 'La vue du jeu ne sert que pendant une question.' });
      const modele = enCours;
      const image = await demandesVue.demander();
      if (image.erreur) return res.json({ erreur: image.erreur });
      try {
        const r = await ollama.chat({ modele: modele.nom, numGpu: modele.numGpu, garderSec: reglages.garderSec, messages: [{ role: 'user', content: CONSIGNE_VUE, images: [image.jpeg] }] });
        return res.json({ vu: r?.message?.content?.trim() || '(rien de lisible)', note: "Image de la fenêtre du jeu prise à l'instant ; les petits textes peuvent être mal lus." });
      } catch (err) {
        return res.json({ erreur: `Lecture de l'image impossible (${err.message}).` });
      }
    });
    // Cadre de la jauge des boucliers (fenêtre en jeu « bouclier ») : ouvert pour le placer et le régler, puis fermé
    router.post('/vision/cadre', (req, res) => {
      const on = req.body?.on === true;
      overlay?.setExtra?.('bouclier', on);
      res.json({ on });
    });

    /**
     * Écoute : un enregistrement WAV (16 kHz, mono) → le texte dit par le joueur (Whisper, sur le processeur). La
     * fenêtre en jeu pose ensuite la question avec ce texte.
     */
    let transcription = false;
    router.post('/ecoute', express.raw({ type: () => true, limit: MAX_AUDIO_OCTETS + 1024 }), async (req, res) => {
      if (!reglages.ecoute) return res.status(409).json({ error: 'L’écoute est coupée (réglages).' });
      const chemins = cheminsWhisper(reglages);
      if (!whisperPret(chemins)) return res.status(503).json({ error: 'Whisper n’est pas installé (voir la page de l’IA).' });
      if (!estWavAttendu(req.body)) return res.status(400).json({ error: 'Enregistrement attendu : WAV 16 kHz mono, 60 s au plus.' });
      if (transcription) return res.status(409).json({ error: 'Je transcris déjà.' });
      transcription = true;
      broadcast('ia:ecoute', { etat: 'transcrit' });
      const debut = Date.now();
      try {
        const texte = await transcrireImpl(req.body, { ...chemins, langue: reglages.langueEcoute });
        return res.json({ texte, sec: Math.round((Date.now() - debut) / 100) / 10 });
      } catch (err) {
        return res.status(502).json({ error: err.message });
      } finally {
        transcription = false;
        broadcast('ia:ecoute', { etat: 'fini' });
      }
    });

    // --- Voix naturelle : le son d'une réponse (joué par la fenêtre en jeu), et l'essai de la page de l'IA ---
    router.get('/voix/:id', (req, res) => {
      const wav = /^s\d{1,9}$/.test(req.params.id) ? sons.lire(req.params.id) : null;
      if (!wav) return res.status(404).json({ error: 'Son introuvable (déjà ancien).' });
      return res.type('audio/wav').set('Cache-Control', 'no-store').send(wav);
    });
    router.post('/voix/essai', async (req, res) => {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const sid = voixNaturelle(b.voixNom);
      const texte = typeof b.texte === 'string' ? b.texte.trim() : '';
      if (sid == null || !texte || texte.length > 300) return res.status(400).json({ error: 'Voix naturelle (naturelle:0 à 9) et texte de 300 caractères au plus.' });
      const vitesse = typeof b.vitesse === 'number' && b.vitesse >= 0.6 && b.vitesse <= 1.6 ? b.vitesse : 1;
      const chemins = paroleChemins();
      if (!paroleOk(chemins)) return res.status(503).json({ error: 'La voix naturelle n’est pas installée (sherpa-onnx et Supertonic, voir le README).' });
      try {
        return res.json({ audio: `/api/modules/ia/voix/${sons.garder(await parlerImpl(texte, { ...chemins, sid, vitesse }))}` });
      } catch (err) {
        return res.status(502).json({ error: err.message });
      }
    });

    /** Oublie la conversation (le modèle repart de zéro). */
    router.post('/oublier', (req, res) => {
      historique = [];
      try {
        writeJsonAtomicSync(fichierHistorique, historique);
      } catch { /* rien à garder */ }
      broadcast('ia:oubli', {});
      res.json({ ok: true });
    });

    /** Rend la mémoire vidéo tout de suite. */
    router.post('/decharger', async (req, res) => {
      const noms = await toutDecharger();
      utiliseJusqua = 0;
      diffuserEtat();
      res.json({ decharges: noms });
    });

    router.put('/reglages', async (req, res) => {
      const { reglages: apres, erreurs } = nettoyerReglages(req.body, reglages);
      if (erreurs.length) return res.status(400).json({ error: erreurs.join(' ') });
      const avant = reglages;
      reglages = apres;
      try {
        writeJsonAtomicSync(fichierReglages, reglages);
      } catch (err) {
        console.error(`IA de bord : réglages non enregistrés (${err.message})`);
      }
      // Coupé, ou modèles changés : ceux d'avant rendent leur place
      if (!apres.actif || ['grand', 'moyen', 'leger'].some((k) => apres[k] !== avant[k])) {
        const charges = await ollama.charges().catch(() => []);
        const anciens = [avant.grand, avant.moyen, avant.leger];
        await Promise.all(charges.filter((c) => anciens.includes(c.nom)).map((c) => ollama.decharger(c.nom).catch(() => {})));
        for (const n of anciens) numGpuCharges.delete(n);
      }
      if (apres.fenetre !== avant.fenetre) overlay?.setExtra?.(FENETRE, apres.fenetre);
      diffuserEtat();
      return res.json(reglages);
    });
  },
};

export { REGLAGES_DEFAUT };
