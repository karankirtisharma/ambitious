import { createRoot } from 'react-dom/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import { useGSAP } from '@gsap/react';

import '@fontsource/ibm-plex-mono/200.css';
import '@fontsource/ibm-plex-mono/300.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource-variable/archivo';

import './styles/tokens.css';
import './styles/base.css';
import './styles/hud.css';
import './styles/dossier.css';
import './styles/sync.css';
import './styles/manifesto.css';

import App from './App';
import CinematicScene from './cinematic/CinematicScene';

gsap.registerPlugin(useGSAP, ScrollTrigger, CustomEase);
// The protocol runs on wall-clock time: if the visitor tabs away mid-ceremony,
// the synchronization keeps running — like a real protocol would.
gsap.ticker.lagSmoothing(0);

// ?scene=cinematic renders the standalone background module for review.
const cinematic = new URLSearchParams(window.location.search).get('scene') === 'cinematic';

createRoot(document.getElementById('root')!).render(cinematic ? <CinematicScene /> : <App />);
