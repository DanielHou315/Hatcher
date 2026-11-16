Decompose the arXiv paper {{subject}} into a paper page for the Hatcher site.

Follow the `paper-decompose` skill from the paper-to-guided-learning plugin step by step; it
defines the procedure, the page skeleton, and the checklist. Read CLAUDE.md in this directory
first for the paths and rules of this environment.

What to do:

1. Run `p2gl catalog` and check whether the paper already has a page (search for its arXiv id
   in /data/content/papers). If a page exists and is `status: ready`, stop and report that. If a
   draft exists, improve it instead of creating a second page.
2. Fetch and extract the paper, read the LaTeX source, and decide its two to five main results.
3. Write `/data/content/papers/<short-name>-<first-author>-<year>.mdx` with `p2gl new paper`
   and fill every section. Use existing concept slugs for prerequisites wherever one fits.
4. For each prerequisite concept that has no page, write it with the `lesson-author` skill if
   there are at most two such pages; otherwise list the missing slugs in your final report and
   keep them as planned prerequisites on the draft.

Rules:

- Every page you create gets `status: draft`. Never set `status: ready`.
- Never edit a page with `status: ready`, except to add a link to a page you wrote.
- Never delete or rename a page. Do not touch roadmaps in this job.
- Do not run git or any command that pushes, publishes, or installs system packages.
- Stay inside /data/content and this workspace.

Finish: run `p2gl catalog --check` and fix every error on the pages you wrote; finish by listing
the files you wrote.
