const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: isProduction,
    sourcemap: !isProduction,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info'
  });

  if (isWatch) {
    console.log('[esbuild] Watching for extension host changes...');
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[esbuild] Extension host build complete.');
  }
}

main().catch((err) => {
  console.error('[esbuild] Build failed:', err);
  process.exit(1);
});

