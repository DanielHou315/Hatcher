// Track ids and display names, in the order given by docs/content-format.md.
export const TRACKS = [
  { id: 'foundations', name: 'Foundations', description: 'Analysis, linear algebra, and probability refreshers' },
  { id: 'stochastic-analysis', name: 'Stochastic analysis', description: 'Brownian motion, Itô calculus, SDEs, Fokker–Planck' },
  { id: 'optimal-transport', name: 'Optimal transport', description: 'Wasserstein geometry, entropic OT, Schrödinger bridges' },
  { id: 'generative-modeling', name: 'Generative modeling', description: 'Score matching, diffusion, flow matching' },
  { id: 'reinforcement-learning', name: 'Reinforcement learning', description: 'MDPs, Bellman operators, policy gradients, regularized RL' },
  { id: 'statistical-learning', name: 'Statistical learning', description: 'Concentration, generalization, estimation' },
  { id: 'geometry-and-robotics', name: 'Geometry and robotics', description: 'Lie groups, manifolds, kinematics' },
  { id: 'papers', name: 'Papers', description: 'Paper decompositions' },
] as const;

export type TrackId = (typeof TRACKS)[number]['id'];

export const TRACK_IDS = TRACKS.map((t) => t.id) as [TrackId, ...TrackId[]];

export function trackName(id: string | undefined): string {
  return TRACKS.find((t) => t.id === id)?.name ?? id ?? '';
}

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
