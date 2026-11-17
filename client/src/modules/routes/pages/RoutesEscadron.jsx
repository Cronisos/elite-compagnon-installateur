// Routes commerciales reçues de l'escadron : à part des tiennes. Une route se suit depuis tes propres journaux : tu
// lis celle-ci, tu la fais une fois en jeu, puis tu la crées dans « Nouvelle route ».

import { Link } from 'react-router';
import { RecusEscadron } from '../../../core/PartageEscadron.jsx';
import { dateTime } from '../../../core/format.js';
import { bilanRoute, etapesRoute } from '../ficheRecue.js';

export default function RoutesEscadron() {
  return (
    <>
      <RecusEscadron
        kinds={['route-commerce']}
        vide="Aucune route commerciale partagée pour l’instant. Pour partager l’une des tiennes : ouvre-la, puis « Partager à l’escadron »."
        detail={(s) => (
          <>
            {bilanRoute(s.data) && <div><b>{bilanRoute(s.data)}</b></div>}
            <ol className="partage-etapes">
              {etapesRoute(s.data).map((e, i) => (
                <li key={i}>
                  {e.trajet && <span className="muted">{e.trajet} → </span>}
                  <b>{e.lieu}</b>
                  {e.faire.map((f) => <div key={f}>{f}</div>)}
                </li>
              ))}
            </ol>
            {s.data.releveLe && <div className="muted">Prix relevés le {dateTime(s.data.releveLe)} : ils bougent, vérifie avant de charger.</div>}
          </>
        )}
      />
      <p className="small muted" data-tuto="commerce-escadron-suivre">
        Pour suivre une de ces routes : fais-la une fois en jeu, puis crée-la dans <Link to="/routes/nouvelle">Nouvelle route</Link>.
        L’app la retrouve dans tes journaux et mesure tes propres boucles.
      </p>
    </>
  );
}
