// Runs once when the server starts. The runtime check must wrap the import so the edge build
// drops it (Next compiles this file for both runtimes).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startup } = await import('./lib/startup');
    await startup();
  }
}
