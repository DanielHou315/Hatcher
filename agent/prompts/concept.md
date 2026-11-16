Write the concept page `{{subject}}` for the Hatcher site.

Follow the `lesson-author` skill from the paper-to-guided-learning plugin step by step; it
defines the reader profile, the page skeleton, the quality bar, and the MDX rules. Read
CLAUDE.md in this directory first for the paths and rules of this environment.

What to do:

1. Run `p2gl catalog --graph --gaps` to see which pages list `{{subject}}` as a prerequisite
   (they say what this page must deliver) and which existing pages it can rest on.
2. If `/data/content/concepts/{{subject}}.mdx` exists with `status: ready`, stop and report that.
   If it exists as a draft, improve it instead of recreating it.
3. Otherwise create it with `p2gl new concept {{subject}}`, choosing the track and level from the
   content contract, and write every section, including a worked example with real numbers and
   two to four exercises with hints.
4. List only existing concept slugs as prerequisites. Name any missing ones in your report.

Rules:

- Every page you create gets `status: draft`. Never set `status: ready`.
- Never edit a page with `status: ready`, except to add a link to a page you wrote.
- Never delete or rename a page. Do not touch roadmaps in this job.
- Do not run git or any command that pushes, publishes, or installs system packages.
- Stay inside /data/content and this workspace.

Finish: run `p2gl catalog --check` and fix every error on the pages you wrote; finish by listing
the files you wrote.
