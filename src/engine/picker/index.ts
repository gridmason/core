/**
 * Add-widget picker gating (docs/SPEC.md §6): a widget shows only when all four
 * hold — requiresContext ⊆ page context, supportsPages glob matches, gate on,
 * permission granted. Core implements the two typed checks and orchestrates the
 * two adapter calls; the same four run again at layout resolution. Glob matching
 * uses a safe matcher, never `new RegExp(userInput)` (SPEC §8).
 *
 * Placeholder — no picker logic yet; populated by the C-E1 epic.
 */
export {};
