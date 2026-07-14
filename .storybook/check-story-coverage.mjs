// Story-coverage gate (GW-D20 — "a story per component, no story no merge",
// advisory pre-1.0; SPEC §9). Runs as `npm run build-storybook` in CI.
//
// The full Storybook toolchain is intentionally still not installed: pre-1.0 the
// rule is advisory and the heavy `@storybook/*` build stack earns its keep only
// once the dashboard consumes a hosted Storybook. What the rule actually needs
// enforced now is coverage — that every *visual* canvas component carries a
// story — and that the stories keep compiling (the `stories/` tree is in
// tsconfig, so `npm run typecheck` already type-checks every story against the
// live source). This checker supplies the missing half: it enumerates the canvas
// component directories and fails CI if a component that should be documented has
// no story, or if a story points at a component that no longer exists.
//
// When the real Storybook config lands, it replaces this script (its CSF stories
// render unchanged) and this coverage check moves into the Storybook build.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The canvas components and how each is documented. A *visual* component (renders
 * or drives DOM) must name the story file + `title` that documents it; a
 * *headless* helper under src/canvas (no DOM UI of its own) is exempt with a
 * stated reason. Adding a new visual component directory without listing it here
 * fails the gate — that is the "no story, no merge" enforcement.
 */
const COMPONENTS = [
  { dir: 'PageCanvas', story: 'page-canvas.stories.ts', title: 'Canvas/PageCanvas' },
  { dir: 'boundary', story: 'widget-boundary.stories.ts', title: 'Canvas/WidgetBoundary' },
  { dir: 'edit-mode', story: 'edit-mode.stories.ts', title: 'Canvas/EditMode' },
  // The keyboard/a11y layer lives under edit-mode/a11y but is documented on its own.
  { dir: 'edit-mode/a11y', story: 'a11y.stories.ts', title: 'Canvas/KeyboardA11y' },
  { dir: 'virtualization', story: 'virtualization.stories.ts', title: 'Canvas/Virtualization' },
  { dir: 'persistence', headless: 'debounced-write persistence decorator — no DOM UI of its own' },
  { dir: 'perf', headless: 'canvas-interactive perf marks — headless instrumentation' },
];

const errors = [];

/** Directory entries directly under src/canvas that are components (dirs, not files). */
const canvasDirs = readdirSync(resolve(root, 'src/canvas'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const listed = new Set(COMPONENTS.map((c) => c.dir.split('/')[0]));
for (const dir of canvasDirs) {
  if (!listed.has(dir)) {
    errors.push(
      `src/canvas/${dir} is a canvas component with no entry in the story-coverage map. ` +
        `Add a story (Canvas/…) and list it in .storybook/check-story-coverage.mjs, ` +
        `or mark it headless with a reason (GW-D20 "no story, no merge").`,
    );
  }
}

/** Every story file present, so we can flag any that no longer maps to a component. */
const storyFiles = new Set(readdirSync(resolve(root, 'stories')).filter((f) => f.endsWith('.stories.ts')));
const claimed = new Set();

for (const c of COMPONENTS) {
  // The component source must still exist (catch a rename that orphans the map).
  try {
    readdirSync(resolve(root, 'src/canvas', c.dir));
  } catch {
    errors.push(`story-coverage map lists src/canvas/${c.dir}, which does not exist.`);
    continue;
  }
  if (c.headless) continue;

  claimed.add(c.story);
  if (!storyFiles.has(c.story)) {
    errors.push(`component ${c.dir} requires stories/${c.story}, which is missing (no story, no merge — GW-D20).`);
    continue;
  }
  const source = readFileSync(resolve(root, 'stories', c.story), 'utf8');
  if (!source.includes(`title: '${c.title}'`)) {
    errors.push(`stories/${c.story} must declare \`title: '${c.title}'\` for component ${c.dir}.`);
  }
}

for (const file of storyFiles) {
  if (!claimed.has(file)) {
    errors.push(`stories/${file} maps to no canvas component in the coverage map — remove it or add its component.`);
  }
}

const documented = COMPONENTS.filter((c) => !c.headless);
if (errors.length > 0) {
  console.error('[storybook] story-coverage gate FAILED (GW-D20 — no story, no merge):');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `[storybook] story-coverage gate OK — ${documented.length} canvas components each carry a story ` +
    `(${documented.map((c) => c.title).join(', ')}); ` +
    `${COMPONENTS.length - documented.length} headless helper(s) exempt. ` +
    'Stories type-check via `npm run typecheck` (stories/ is in tsconfig).',
);
