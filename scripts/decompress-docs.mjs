/**
 * Static-hosting staging step (run after `cp -R views/dist/. dist/`).
 *
 * The production build writes every HTML document to disk gzip-compressed
 * (disguiseFiles), because the Node server streams those bytes with a
 * Content-Encoding header. Static hosts cannot do that: they gzip-compress
 * the file a second time, so a browser would render raw gzip bytes.
 *
 * This script walks dist/ and replaces each gzip-compressed .html file with
 * its plain-HTML form (already-plain documents are left untouched), so the
 * host's own compression delivers exactly one, correct encoding layer.
 *
 * It also materializes every in-site page route as a directory-index file
 * (dist/<alias>/index.html) and relocates the Scramjet/transport directories
 * to their obfuscated alias names (dist/<alias>/ for scram, epoxy, libcurl).
 * The Node server maps routes such as `documentation -> docs.html` and asset
 * prefixes such as `scram -> <alias>` through the obfuscated alias map that
 * the same build persisted to dist/.obfuscation.json; a static host has no
 * router, so without these copies every route and proxy asset would fall
 * through to the home page. The originals are moved (not copied) so the
 * deploy stays under the hosting size limit; nothing served by a static host
 * references the unaliased paths.
 */
import {
	copyFileSync,
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	renameSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = join(process.cwd(), 'dist');
let decompressed = 0;
let plain = 0;

function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const file = join(dir, entry);
		if (statSync(file).isDirectory()) {
			walk(file);
			continue;
		}
		if (!entry.endsWith('.html')) continue;
		const data = readFileSync(file);
		if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
			writeFileSync(file, gunzipSync(data));
			decompressed++;
		} else {
			plain++;
		}
	}
}

walk(root);
console.log(
	`[decompress-docs] ${decompressed} gzip documents decompressed, ${plain} already plain`
);

// Materialize page routes so static hosting serves the right document for
// every obfuscated link instead of falling back to index.html.
const state = JSON.parse(readFileSync(join(root, '.obfuscation.json'), 'utf8'));
const aliases = state.aliases ?? {};
let prefixesMaterialized = 0;
for (const [key, alias] of Object.entries(aliases)) {
	if (!key.startsWith('prefixes/')) continue;
	const prefix = key.slice('prefixes/'.length);
	const source = join(root, prefix);
	const target = join(root, alias);
	if (alias === prefix || !existsSync(source)) continue;
	if (!existsSync(target)) {
		renameSync(source, target);
	} else {
		cpSync(source, target, { recursive: true, force: true });
		rmSync(source, { recursive: true, force: true });
	}
	prefixesMaterialized++;
}
console.log(
	`[decompress-docs] ${prefixesMaterialized} asset prefixes materialized (originals moved)`
);

const routes = JSON.parse(readFileSync(join(root, 'routes.json'), 'utf8'));
let materialized = 0;
for (const [route, target] of Object.entries(routes)) {
	if (!target.endsWith('.html')) continue;
	const alias = aliases[route] ?? route;
	if (!alias) continue; // the home route is already dist/index.html
	const source = join(root, target);
	if (!existsSync(source)) {
		throw new Error(`Missing document for route ${route}: ${target}`);
	}
	mkdirSync(join(root, alias), { recursive: true });
	copyFileSync(source, join(root, alias, 'index.html'));
	materialized++;
}
console.log(`[decompress-docs] ${materialized} route directories materialized`);
