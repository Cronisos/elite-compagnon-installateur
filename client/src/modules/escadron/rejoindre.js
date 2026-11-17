// « Rejoindre » avec le code de l'escadron, partagé par la page Escadron et la page Rejoindre l'escadron : un aperçu
// d'abord (rien n'est envoyé), puis, si le code mène à un autre serveur que celui où l'on est inscrit, une confirmation
// qui nomme cet hôte. Renvoie la vue du capteur, ou null si le joueur a renoncé.

import { api } from '../../core/api.js';

const base = '/modules/escadron';

export async function rejoindreAvecCode(code, cmdr, confirmer = (texte) => window.confirm(texte)) {
  const apercu = await api(`${base}/rejoindre/apercu`, { method: 'POST', body: { code } });
  let confirmerServeur;
  if (apercu.confirmer) {
    const ok = confirmer(`Ce code mène à un autre serveur d’escadron (${apercu.hote}) que celui où tu es inscrit. Changer d’escadron ? Ton inscription actuelle n’est remplacée que si la nouvelle réussit.`);
    if (!ok) return null;
    confirmerServeur = apercu.hote;
  }
  return api(`${base}/rejoindre`, {
    method: 'POST',
    body: { code, ...(cmdr ? { cmdr } : {}), ...(confirmerServeur ? { confirmerServeur } : {}) },
  });
}
