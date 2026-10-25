import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
// Fonts load through the bundler, so their file URLs resolve in the build. Inter is the body face; Barlow Condensed the display face.
import '@fontsource-variable/inter';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow-condensed/900.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
