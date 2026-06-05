// Ambient declaration so tsc / svelte-check accept side-effect CSS imports
// (e.g. `import './tokens.css'`). Vite resolves the actual module at build time.
declare module '*.css';
