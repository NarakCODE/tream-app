export function createsDependencyCycle(
  source: string,
  target: string,
  edges: ReadonlyArray<{ sourceIssueId: string; targetIssueId: string }>,
) {
  const pending = [target];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of edges)
      if (edge.sourceIssueId === current) pending.push(edge.targetIssueId);
  }
  return false;
}
