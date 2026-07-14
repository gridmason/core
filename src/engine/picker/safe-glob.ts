/**
 * Safe glob matcher for picker/resolution gating (docs/SPEC.md §6, §8).
 *
 * `supportsPages` globs (and the migration `pages` escape hatch) are widget- and
 * host-authored strings matched against a page-type id. SPEC §8 forbids compiling
 * such input to a RegExp — `new RegExp(userInput)` is a ReDoS and injection
 * surface. This matcher constructs **no RegExp at all**: it walks the pattern and
 * value character by character in linear time, so a hostile pattern cannot induce
 * catastrophic backtracking.
 *
 * Glob grammar (deliberately minimal):
 * - `*` matches any run of characters, including none and including any
 *   separator (page-type ids are dot-delimited, e.g. `crm.customer-detail`; `*`
 *   spans the dots — `dashboards.*` matches `dashboards.sales.regional`).
 * - `?` matches exactly one character.
 * - every other character — including regex metacharacters like `.`, `+`, `(`,
 *   `[`, `\` — is matched **literally**. A glob has no regex semantics, so
 *   `crm.customer` matches only `crm.customer`, never `crmXcustomer`.
 */

/**
 * Whether `value` matches the glob `pattern` under the grammar above. Total and
 * deterministic; never throws and never constructs a RegExp.
 *
 * The two saved indices (`starPattern`/`starValue`) implement single-`*`
 * backtracking iteratively: on a mismatch we rewind the pattern to just after the
 * most recent `*` and advance the value by one, so the `*` absorbs one more
 * character. This is O(pattern × value) in the worst case with no recursion.
 */
export function matchGlob(pattern: string, value: string): boolean {
  let p = 0;
  let v = 0;
  let starPattern = -1;
  let starValue = 0;

  while (v < value.length) {
    const pc = pattern[p];
    if (pc === '?' || (pc !== undefined && pc === value[v])) {
      // A literal or single-character match: consume one of each.
      p++;
      v++;
    } else if (pc === '*') {
      // Record the wildcard's position; tentatively let it match nothing.
      starPattern = p;
      starValue = v;
      p++;
    } else if (starPattern !== -1) {
      // Mismatch, but a prior `*` can absorb this value character instead.
      p = starPattern + 1;
      starValue++;
      v = starValue;
    } else {
      return false;
    }
  }

  // Value exhausted: any pattern tail must be all `*` to match.
  while (pattern[p] === '*') {
    p++;
  }
  return p === pattern.length;
}

/**
 * Whether `value` matches **any** of the `patterns` (logical OR). An empty
 * iterable matches nothing and returns `false` — an explicit, empty allowlist
 * admits no page type.
 */
export function matchAnyGlob(patterns: Iterable<string>, value: string): boolean {
  for (const pattern of patterns) {
    if (matchGlob(pattern, value)) return true;
  }
  return false;
}
