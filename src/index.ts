// Public barrel for @gridmason/core. Each layer is also a package export (see
// package.json "exports"): ./engine (headless), ./canvas (gridstack binding),
// ./adapters (host-implemented interfaces). Subtrees are placeholders until the
// C-E1..C-E4 epics land (docs/SPEC.md §2).
export * from './engine/index.js';
export * from './canvas/index.js';
export * from './adapters/index.js';
