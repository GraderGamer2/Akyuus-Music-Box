// Minifies the renderer into renderer-min/ (smaller download, faster parse). Run by `npm run dist`.
const fs = require('fs'), path = require('path'), esbuild = require('esbuild');
const src = path.join(__dirname, '..', 'renderer'), out = path.join(__dirname, '..', 'renderer-min');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src)) {
  const from = path.join(src, f), to = path.join(out, f);
  if (f.endsWith('.js')) fs.writeFileSync(to, esbuild.transformSync(fs.readFileSync(from, 'utf8'), { minify: true, target: 'chrome140', legalComments: 'none' }).code);
  else if (f.endsWith('.css')) fs.writeFileSync(to, esbuild.transformSync(fs.readFileSync(from, 'utf8'), { loader: 'css', minify: true, target: 'chrome140' }).code);
  else if (f.endsWith('.html')) fs.writeFileSync(to, fs.readFileSync(from, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' '));
  else fs.copyFileSync(from, to);
}
console.log('renderer minified:', fs.readdirSync(out).join(', '));
