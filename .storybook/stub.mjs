// Storybook harness STUB (issue #6 scaffold).
//
// The full Storybook toolchain is intentionally NOT installed yet: pre-1.0 the
// "story per component, no story no merge" rule is advisory (GW-D20), and there
// are no canvas components to document until the C-E2 epic. Installing the
// storybook build stack now would add a heavy dependency tree the scaffold has
// no use for. This placeholder keeps the `storybook` / `build-storybook` npm
// scripts (and the CI step that calls them) green so the C-E2/C-E3 issues can
// swap in the real config without re-plumbing the pipeline.
//
// Replace this file (and add `@storybook/*` devDeps + a real `.storybook/main`)
// when the first canvas component lands.
console.log(
  '[storybook:stub] No stories yet — Storybook is an advisory pre-1.0 harness ' +
    '(GW-D20). Real config lands with the C-E2 canvas epic. Exiting 0.',
);
process.exit(0);
