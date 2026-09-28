Find the best paper on the topic "{{subject}}" that the Marginalia site does not cover yet, and
decompose it into a paper page.

Use the `paper-scout` skill from the paper-to-guided-learning plugin to find candidates, then
the `paper-decompose` skill to write the page. Read CLAUDE.md in this directory first for the
paths and rules of this environment.

What to do:

1. Run `p2gl catalog` to see which papers already have pages (compare arXiv ids).
2. Scout the topic with one to three focused queries and vet the top candidates as the
   paper-scout skill describes. Pick the single paper that is recognized, theory-heavy, and
   most useful to a robotics/RL reader, and that has no page yet. Say in one or two sentences
   why you chose it over the runners-up.
3. Decompose that paper following the paper-decompose skill and write
   `/data/content/papers/<short-name>-<first-author>-<year>.mdx`.
4. Write at most two missing prerequisite concept pages with the `lesson-author` skill; list any
   others as missing slugs in your report.

Rules:

- Every page you create gets `status: draft`. Never set `status: ready`.
- Never edit a page with `status: ready`, except to add a link to a page you wrote.
- Never delete or rename a page. Do not touch roadmaps in this job.
- Do not run git or any command that pushes, publishes, or installs system packages.
- Stay inside /data/content and this workspace.

Finish: run `p2gl catalog --check` and fix every error on the pages you wrote; finish by listing
the files you wrote.
