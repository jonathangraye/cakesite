import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const outDir = 'lambda/dist';
const catalog = 'dist/catalog.json';

if (!existsSync(catalog)) {
  console.error(`${catalog} is missing. Run "astro build" first.`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: ['lambda/checkout.ts'],
  outfile: `${outDir}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  external: ['@aws-sdk/*'],
  // Bundled CommonJS dependencies (Stripe) call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});

copyFileSync(catalog, `${outDir}/catalog.json`);
console.log(`Lambda bundle ready in ${outDir}/`);
