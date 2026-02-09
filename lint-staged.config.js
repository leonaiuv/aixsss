import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  'apps/web/**/*.{ts,tsx}': (files) => {
    const cwd = path.join(__dirname, 'apps/web');
    const relativePaths = files.map((f) => path.relative(cwd, f));
    return `npx eslint --max-warnings=0 -c ${cwd}/eslint.config.js ${relativePaths.map(p => path.join(cwd, p)).join(' ')}`;
  },
  'apps/api/**/*.ts': (files) => {
    const cwd = path.join(__dirname, 'apps/api');
    const relativePaths = files.map((f) => path.relative(cwd, f));
    return `npx eslint --max-warnings=0 -c ${cwd}/eslint.config.js ${relativePaths.map(p => path.join(cwd, p)).join(' ')}`;
  },
  'apps/worker/**/*.ts': (files) => {
    const cwd = path.join(__dirname, 'apps/worker');
    const relativePaths = files.map((f) => path.relative(cwd, f));
    return `npx eslint --max-warnings=0 -c ${cwd}/eslint.config.js ${relativePaths.map(p => path.join(cwd, p)).join(' ')}`;
  },
  'packages/shared/**/*.ts': (files) => {
    const cwd = path.join(__dirname, 'packages/shared');
    const relativePaths = files.map((f) => path.relative(cwd, f));
    return `npx eslint --max-warnings=0 -c ${cwd}/eslint.config.js ${relativePaths.map(p => path.join(cwd, p)).join(' ')}`;
  },
  '**/*.{json,md}': (files) => {
    const filtered = files.filter(
      (f) => !(f === '.trae' || f.startsWith('.trae/') || f.startsWith('.trae\\') || f.startsWith('.qoder/') || f.startsWith('.qoder\\')),
    );
    if (filtered.length === 0) return [];
    return `prettier --write ${filtered.map((f) => JSON.stringify(f)).join(' ')}`;
  },
};
