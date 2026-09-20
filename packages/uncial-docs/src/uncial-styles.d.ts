// `uncial/styles/chrome.css` is a stylesheet EditorPage imports for its effect.
// Vite resolves it through the workspace-source alias; TypeScript, which
// type-checks that component from source here rather than from the package's
// dist, needs telling it exists.
declare module 'uncial/styles/chrome.css';
