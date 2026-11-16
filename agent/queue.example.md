# Agent queue

One job per line. Each scheduled run takes the first unchecked line and marks it `- [x]` when
it succeeds or `- [!]` when it fails (see the log named on the line). Blank lines and headings
are ignored. When no unchecked line is left, the run writes the first missing prerequisite page
reported by `p2gl catalog --gaps`.

Job kinds:

- `- [ ] paper <arxiv-id>`: decompose that paper into a paper page.
- `- [ ] concept <slug>`: write that concept page.
- `- [ ] topic <words>`: scout the topic and decompose the best paper not yet on the site.
- `- [ ] roadmap`: place unplaced pages on the roadmaps and report gaps.

## Queue

Starter entries: Diffusion Schrödinger Bridge Matching (Shi et al. 2023), Rectified Flow
(Liu et al. 2022), Riemannian Flow Matching (Chen & Lipman 2023), the HJB equation behind
continuous-time control and RL, convergence theory for diffusion policies, and a roadmap pass.
Everything after the kind is the subject, so keep notes off the job lines.

- [ ] paper 2303.16852
- [ ] paper 2209.03003
- [ ] paper 2302.03660
- [ ] concept hamilton-jacobi-bellman
- [ ] topic diffusion policy theory convergence
- [ ] roadmap
