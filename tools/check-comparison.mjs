// Compare like-for-like scenarios. Extra seeds expand safety coverage without changing a baseline's population.
export function compareBaseline(runs, baseline, seeds, tolerances) {
  const matching = runs.filter(r => r.seed <= seeds);
  const comparable = matching.length === seeds;
  const regressions = [];
  if (comparable) for (const [key, tolerance] of Object.entries(tolerances)) {
    const values = matching.map(r => r.scores[key]).filter(value => typeof value === 'number');
    if (!values.length || baseline[key] == null) continue;
    const value = +(values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(1);
    const slack = Math.max(baseline[key] * tolerance, ['stuckS', 'goArounds', 'bumps'].includes(key) ? 1 : 0);
    if (value > baseline[key] + slack) regressions.push(`worse ${key}: ${baseline[key]} -> ${value} (matching ${seeds} seeds)`);
  }
  return { comparable, regressions };
}
