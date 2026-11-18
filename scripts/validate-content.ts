// Parse and compile every content file; print problems; exit 1 on any error.
// Usage: npm run validate:content [-- <content dir>]
import { buildSite, contentDir, loadEntries } from '../src/lib/content';
import { siteWarnings, validateEntry } from '../src/lib/validate';

const dir = process.argv[2] ?? contentDir();
const entries = loadEntries(dir);
const errors: string[] = [];
const warnings: string[] = siteWarnings(buildSite(entries));

for (const entry of entries) {
  const problems = await validateEntry(entry);
  errors.push(...problems.errors);
  warnings.push(...problems.warnings);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`${entries.length} files checked in ${dir}: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
