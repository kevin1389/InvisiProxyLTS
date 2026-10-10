import assert from 'node:assert/strict';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const readProjectFile = (path: string) =>
	readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Render starts the prebuilt Docker app through the bounded startup script', () => {
	const render = readProjectFile('render.yaml');
	const dockerfile = readProjectFile('Dockerfile');
	const serve = readProjectFile('serve.sh');

	assert.match(render, /runtime: docker/);
	assert.match(render, /repo: https:\/\/github\.com\/kevin1389\/InvisiProxyLTS/);
	assert.match(render, /branch: freebuff\/the-dev-server-failed-to-start-the-d-d98ftvxd/);
	assert.match(render, /dockerCommand: sh \/serve\.sh/);
	assert.match(render, /healthCheckPath: \/\s*$/m);
	assert.match(render, /key: ENABLE_TOR\s+value: "false"/);
	assert.doesNotMatch(render, /(?:startCommand|dockerCommand):.*pnpm run build/);
	assert.match(serve, /if \[ "\$\{ENABLE_TOR:-true\}" = "true" \]/);
	assert.match(serve, /tor --MaxMemInQueues "32 MB"/);
	assert.match(serve, /exec node --max-old-space-size=256 dist\/server\.js/);
	assert.doesNotMatch(serve, /pnpm run build/);

	assert.match(dockerfile, /RUN pnpm run build/);
	assert.match(dockerfile, /CMD \["\/serve\.sh"\]/);
});

test('Render startup skips Tor when disabled and execs the prebuilt Node server', () => {
	const temporaryDirectory = mkdtempSync(join(tmpdir(), 'render-startup-'));
	try {
		const bin = join(temporaryDirectory, 'bin');
		const nodeArguments = join(temporaryDirectory, 'node-arguments');
		const torStarted = join(temporaryDirectory, 'tor-started');
		mkdirSync(bin);
		writeFileSync(
			join(bin, 'node'),
			`#!/bin/sh
printf '%s\\n' "$*" > "$NODE_ARGUMENTS_FILE"
`
		);
		writeFileSync(
			join(bin, 'tor'),
			`#!/bin/sh
printf started > "$TOR_MARKER_FILE"
`
		);
		chmodSync(join(bin, 'node'), 0o755);
		chmodSync(join(bin, 'tor'), 0o755);

		const result = spawnSync('/bin/sh', ['serve.sh'], {
			encoding: 'utf8',
			env: {
				...process.env,
				ENABLE_TOR: 'false',
				NODE_ARGUMENTS_FILE: nodeArguments,
				TOR_MARKER_FILE: torStarted,
				PATH: bin,
			},
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(
			readFileSync(nodeArguments, 'utf8').trim(),
			'--max-old-space-size=256 dist/server.js'
		);
		assert.equal(existsSync(torStarted), false);
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
});
