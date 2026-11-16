Curate the Hatcher roadmaps against the current catalog.

Follow the `roadmap-curator` skill from the paper-to-guided-learning plugin step by step; it
defines the placement rules and the checks. Read CLAUDE.md in this directory first for the
paths and rules of this environment.

What to do:

1. Run `p2gl catalog --graph --gaps` and read every roadmap in /data/content/roadmaps.
2. Place each page that is on no roadmap: concept and paper pages go after all of their
   prerequisites, in the stage whose goal they serve. Fix any ordering violation you find.
3. If a group of three or more pages fits no existing stage, add a stage with a title and a
   one-sentence goal rather than overloading a stage past six items.
4. Report the remaining gaps (missing pages and the pages that need them) and the next three
   pages to write, in the order that unblocks the most items.

Rules:

- Change only `stages` and `updated` in roadmap files; do not rewrite their bodies. Keep the
  inline `items: [a, b, c]` style and exactly one `primary: true` roadmap.
- A roadmap with `status: ready` may only list pages that exist; placing a draft page on it is
  fine, placing a planned slug is not.
- Do not create or edit concept or paper pages in this job. Never delete or rename a page.
- Do not run git or any command that pushes, publishes, or installs system packages.
- Stay inside /data/content and this workspace.

Finish: run `p2gl catalog --check` and fix every error on the pages you wrote; finish by listing
the files you wrote.
