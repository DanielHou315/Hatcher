Write the missing prerequisite concept page `{{subject}}` for the Marginalia site. Existing
pages list it as a prerequisite, but it has no page yet. Needed by: {{needed_by}}.

Follow the `lesson-author` skill from the paper-to-guided-learning plugin step by step; it
defines the reader profile, the page skeleton, the quality bar, and the MDX rules. Read
CLAUDE.md in this directory first for the paths and rules of this environment.

What to do:

1. Read the pages that need `{{subject}}` and note exactly which step of which proof or
   definition uses it. That is what this page must deliver.
2. Run `p2gl catalog --graph --gaps` to find the existing pages it can rest on.
3. Create `/data/content/concepts/{{subject}}.mdx` with `p2gl new concept {{subject}}`,
   choosing the track and level from the content contract, and write every section, including
   a worked example with real numbers and two to four exercises with hints.
4. In "Where it shows up", link back to the pages that need it.

Rules:

- Every page you create gets `status: draft`. Never set `status: ready`.
- Never edit a page with `status: ready`, except to add a link to a page you wrote.
- Never delete or rename a page. Do not touch roadmaps in this job.
- Do not run git or any command that pushes, publishes, or installs system packages.
- Stay inside /data/content and this workspace.

Finish: run `p2gl catalog --check` and fix every error on the pages you wrote; finish by listing
the files you wrote.
