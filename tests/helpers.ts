/** A minimal valid concept page. */
export function page(title: string, status: 'draft' | 'ready' = 'draft', body = '## Idea\n\nText with $x^2$.\n') {
  return `---\ntitle: "${title}"\nkind: concept\nsummary: "S"\ntags: [t]\ntrack: foundations\nlevel: 1\nprerequisites: []\nestimated_minutes: 10\nstatus: ${status}\n---\n\n${body}`;
}
