import { z } from 'zod';
import { KINDS } from './kinds';

/** Normalize a YAML date or a date string to an ISO string (date-only stays date-only). */
function toIsoDate(value: Date | string, ctx: z.RefinementCtx): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'invalid date' });
      return z.NEVER;
    }
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: 'custom', message: `invalid date "${s}"` });
    return z.NEVER;
  }
  return d.toISOString();
}

const dateField = z.union([z.date(), z.string()]).transform(toIsoDate);

const stringList = z.array(z.coerce.string()).default([]);

export const sourceSchema = z.looseObject({
  type: z.enum(['book', 'arxiv', 'lecture', 'x', 'web']),
  title: z.string().min(1),
  id: z.coerce.string().optional(),
  author: z.string().optional(),
  where: z.string().optional(),
  url: z.string().optional(),
});

export const paperSchema = z.looseObject({
  arxiv_id: z.coerce.string().optional(),
  authors: z.array(z.string()).default([]),
  year: z.number().int().optional(),
  venue: z.string().optional(),
  recognition: stringList,
  why_it_matters: z.string().optional(),
  theorems: z.number().int().nonnegative().optional(),
});

export const stageSchema = z.looseObject({
  title: z.string().min(1),
  goal: z.string().optional(),
  items: z.array(z.string()).default([]),
});

export const frontmatterSchema = z
  .looseObject({
    title: z.string().min(1),
    kind: z.enum(KINDS),
    summary: z.string().min(1),
    tags: stringList,
    level: z.number().int().min(1).max(5).optional(),
    prerequisites: stringList,
    estimated_minutes: z.number().int().positive().optional(),
    status: z.enum(['draft', 'ready']).default('ready'),
    created: dateField.optional(),
    updated: dateField.optional(),
    sources: z.array(sourceSchema).default([]),
    paper: paperSchema.optional(),
    stages: z.array(stageSchema).min(1).optional(),
    primary: z.boolean().default(false),
  })
  .superRefine((fm, ctx) => {
    if (fm.kind === 'paper' && !fm.paper) {
      ctx.addIssue({ code: 'custom', path: ['paper'], message: 'required when kind is paper' });
    }
    if (fm.kind === 'roadmap' && !fm.stages) {
      ctx.addIssue({ code: 'custom', path: ['stages'], message: 'required when kind is roadmap' });
    }
    if (fm.kind !== 'roadmap' && fm.level === undefined) {
      ctx.addIssue({ code: 'custom', path: ['level'], message: 'required for concept and paper pages' });
    }
  });

export type Frontmatter = z.output<typeof frontmatterSchema>;
export type Source = z.output<typeof sourceSchema>;
export type PaperMeta = z.output<typeof paperSchema>;
export type Stage = z.output<typeof stageSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : 'frontmatter'}: ${issue.message}`)
    .join('; ');
}
