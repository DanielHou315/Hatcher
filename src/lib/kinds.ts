// Page kinds, their content directories, and reading-progress states.
export const KINDS = ['concept', 'paper', 'roadmap'] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_DIRS: Record<Kind, string> = {
  concept: 'concepts',
  paper: 'papers',
  roadmap: 'roadmaps',
};

export function entryHref(kind: Kind, slug: string): string {
  return `/${KIND_DIRS[kind]}/${slug}`;
}

export const PROGRESS_STATUSES = ['not-started', 'in-progress', 'done'] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

/** Pages show at most this many tags; docs/content-format.md asks for one to three. */
export const MAX_TAGS = 3;
