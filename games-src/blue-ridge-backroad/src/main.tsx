import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// StrictMode is deliberately off: its double-mount would build the world twice
// on every load. `Game.dispose()` is a real teardown, so HMR and unmounts are
// still handled properly — see DECISIONS D0.17.
const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);
