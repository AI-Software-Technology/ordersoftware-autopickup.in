import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { useAuthStore } from './store/authStore.ts';
import './index.css';
import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;
// Restore the logged-in session ( if any ) before the first screen is shown
useAuthStore.getState().refreshUser();

createRoot(document.getElementById('root')!).render(<App />);
