// Demo helpers are OFF unless VITE_DEMO_MODE=true is set at build time.
// When off, the demo accounts (and their passwords) are not included in the production bundle at all.
export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE === 'true';
