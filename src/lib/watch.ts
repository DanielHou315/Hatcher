import 'server-only';
import path from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { contentDir } from './content';

export interface ChangeEvent {
  path: string;
  type: string;
}

type Listener = (event: ChangeEvent) => void;

interface Hub {
  dir: string;
  watcher: FSWatcher;
  listeners: Set<Listener>;
}

const g = globalThis as unknown as { __hatcherWatchHub?: Hub };

function hub(): Hub {
  const dir = contentDir();
  if (g.__hatcherWatchHub && g.__hatcherWatchHub.dir === dir) return g.__hatcherWatchHub;
  if (g.__hatcherWatchHub) void g.__hatcherWatchHub.watcher.close();
  const listeners = new Set<Listener>();
  const watcher = watch(dir, {
    ignoreInitial: true,
    // Agent writes are staged here and only become pages when renamed into place.
    ignored: (file: string) => file.split(path.sep).includes('.staging'),
    usePolling: process.env.CHOKIDAR_USEPOLLING === '1',
    interval: 1000,
    awaitWriteFinish: { stabilityThreshold: 300 },
  });
  watcher.on('all', (type, file) => {
    const event = { path: path.relative(dir, file), type };
    for (const listener of listeners) listener(event);
  });
  watcher.on('error', (err) => console.error('[watch]', err));
  g.__hatcherWatchHub = { dir, watcher, listeners };
  return g.__hatcherWatchHub;
}

/** Subscribe to content changes; returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  const h = hub();
  h.listeners.add(listener);
  return () => {
    h.listeners.delete(listener);
  };
}
