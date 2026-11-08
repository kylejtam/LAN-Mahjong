import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { unlockAudioOnFirstTouch } from './celebrate';

// Phones only play sound after a tap: the first tap anywhere switches it on.
unlockAudioOnFirstTouch();

createRoot(document.getElementById('root')!).render(<App />);
