const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const serverOnly = args.includes('--server-only');
const clientOnly = args.includes('--client-only');
const watchClient = args.includes('--watch-client');

const distDir = path.join(__dirname, 'dist');
const webDistDir = path.join(distDir, 'web');

// Ensure dist directories exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
if (!fs.existsSync(webDistDir)) {
  fs.mkdirSync(webDistDir, { recursive: true });
}

// Copy static files (HTML, CSS)
function copyStaticFiles() {
  // Copy index.html
  const htmlSrc = path.join(__dirname, 'src', 'web', 'index.html');
  const htmlDest = path.join(webDistDir, 'index.html');
  if (fs.existsSync(htmlSrc)) {
    fs.copyFileSync(htmlSrc, htmlDest);
  }

  // Copy styles directory
  const stylesSrcDir = path.join(__dirname, 'src', 'web', 'styles');
  const stylesDestDir = path.join(webDistDir, 'styles');
  if (fs.existsSync(stylesSrcDir)) {
    if (!fs.existsSync(stylesDestDir)) {
      fs.mkdirSync(stylesDestDir, { recursive: true });
    }
    const styleFiles = fs.readdirSync(stylesSrcDir);
    for (const file of styleFiles) {
      fs.copyFileSync(
        path.join(stylesSrcDir, file),
        path.join(stylesDestDir, file)
      );
    }
  }

  // Copy identity folder
  const identitySrcDir = path.join(__dirname, 'identity');
  const identityDistDir = path.join(distDir, 'identity');
  if (fs.existsSync(identitySrcDir)) {
    if (!fs.existsSync(identityDistDir)) {
      fs.mkdirSync(identityDistDir, { recursive: true });
    }
    const identityFiles = fs.readdirSync(identitySrcDir);
    for (const file of identityFiles) {
      fs.copyFileSync(
        path.join(identitySrcDir, file),
        path.join(identityDistDir, file)
      );
    }
  }
}

// Build server
async function buildServer() {
  console.log('Building server...');
  await esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/dangerousbot.js',
    external: ['better-sqlite3'],
    minify: false,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': '"production"'
    }
  });
  console.log('Server build complete: dist/dangerousbot.js');
}

// Build client (React)
async function buildClient(watch = false) {
  console.log('Building client...');

  const buildOptions = {
    entryPoints: ['src/web/index.tsx'],
    bundle: true,
    platform: 'browser',
    target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
    outfile: 'dist/web/bundle.js',
    minify: !watch,
    sourcemap: watch,
    define: {
      'process.env.NODE_ENV': watch ? '"development"' : '"production"'
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts'
    },
    jsx: 'automatic'
  };

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching client for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Client build complete: dist/web/bundle.js');
  }
}

// Main build
async function build() {
  try {
    copyStaticFiles();

    if (watchClient) {
      await buildClient(true);
    } else if (clientOnly) {
      await buildClient();
    } else if (serverOnly) {
      await buildServer();
    } else {
      // Build both
      await Promise.all([
        buildServer(),
        buildClient()
      ]);
    }

    if (!watchClient) {
      console.log('Build complete!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
