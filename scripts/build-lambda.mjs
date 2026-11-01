import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const outRoot = 'lambda/dist';
const catalog = 'dist/catalog.json';

if (!existsSync(catalog)) {
  console.error(`${catalog} is missing. Run "astro build" first.`);
  process.exit(1);
}

rmSync(outRoot, { recursive: true, force: true });

// Each Lambda gets its own folder, which Terraform zips separately.
const lambdas = {
  api: 'lambda/api.ts',
  webhook: 'lambda/webhook-handler.ts',
};

for (const [name, entry] of Object.entries(lambdas)) {
  mkdirSync(`${outRoot}/${name}`, { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: `${outRoot}/${name}/index.mjs`,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external: ['@aws-sdk/*'],
    // Bundled CommonJS dependencies (Stripe) call require() for Node built-ins.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'info',
  });
}

// The API Lambda prices orders from the built catalog.
copyFileSync(catalog, `${outRoot}/api/catalog.json`);
console.log(`Lambda bundles ready in ${outRoot}/`);
