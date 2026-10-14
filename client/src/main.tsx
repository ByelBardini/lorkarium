import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="grid min-h-screen place-items-center">
      <h1 className="text-2xl font-semibold">Lorkarium</h1>
    </main>
  </StrictMode>,
);
