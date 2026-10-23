export async function closeResources(operations: readonly (() => void | Promise<void>)[]): Promise<boolean> {
  // Start every close before waiting; one stalled or rejected resource must not skip the others.
  const results = await Promise.allSettled(operations.map(async operation => { await operation(); }));
  return results.every(result => result.status === 'fulfilled');
}
