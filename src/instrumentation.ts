// Runs once when the server starts. The runtime check must wrap the import so the edge build
// drops it (Next compiles this file for both runtimes). The public site has no accounts to migrate.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.HATCHER_MODE === 'studio') {
    const { migrateAuth } = await import('./lib/auth-migrate');
    await migrateAuth();
  }
}
