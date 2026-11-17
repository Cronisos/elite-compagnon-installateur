import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import './styles.css';

// Signature de l'app, dans la console de chaque fenêtre (rien d'affiché)
console.info('%cElite Compagnon%c · créé par Cronisos Lysiris · gratuit, non affilié à Frontier Developments', 'font-weight:bold', '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
