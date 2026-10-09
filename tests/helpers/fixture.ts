import {
	cp,
	mkdtemp,
	mkdir,
	readFile,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import type settings from '../../config.json';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';

export const project = fileURLToPath(new URL('../../', import.meta.url));

export async function fixture(
	t: TestContext,
	overrides: Partial<typeof settings> = {},
	full = false
) {
	const root = await mkdtemp(join(tmpdir(), 'invisiproxy-test-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	for (const file of ['src', 'package.json', 'vite.config.ts'])
		await cp(join(project, file), join(root, file), { recursive: true });
	await symlink(
		join(project, 'node_modules'),
		join(root, 'node_modules'),
		'junction'
	);
	const config = {
		...JSON.parse(await readFile(join(project, 'config.json'), 'utf8')),
		verbose: false,
		mirrorLinksFile: 'private/test-links.txt',
		...overrides,
	};
	await writeFile(join(root, 'config.json'), JSON.stringify(config));
	await mkdir(join(root, 'private'));
	await writeFile(
		join(root, 'private/test-links.txt'),
		'# PRIVATE_TEST_MARKER\nhttps://first.example/\nhttps://second.example/\n'
	);
	if (full)
		await cp(join(project, 'views'), join(root, 'views'), {
			recursive: true,
			filter: (path) =>
				!['dist', 'dist-new', 'archive'].includes(basename(path)),
		});
	return root;
}

export async function run(
	root: string,
	args: string[],
	env: NodeJS.ProcessEnv = {},
	timeout = 120000
) {
	const reservation = createServer();
	await new Promise<void>((resolve, reject) => {
		reservation.once('error', reject);
		reservation.listen(0, '127.0.0.1', resolve);
	});
	const port = (reservation.address() as AddressInfo).port;
	await new Promise<void>((resolve, reject) =>
		reservation.close((error) => (error ? reject(error) : resolve()))
	);
	return new Promise<string>((resolve, reject) => {
		const childEnv: NodeJS.ProcessEnv = {
			...process.env,
			PORT: String(port),
			INVISIPROXY_VITE_DEV: '',
			...env,
		};
		delete childEnv.NODE_TEST_CONTEXT;
		const child = spawn(process.execPath, args, {
			cwd: root,
			env: childEnv,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let output = '';
		const timer = setTimeout(() => child.kill(), timeout);
		child.stdout.on('data', (data) => (output += data));
		child.stderr.on('data', (data) => (output += data));
		child.once('error', reject);
		child.once('exit', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve(output);
			else
				reject(
					new Error(
						`Command failed (${code}): ${output.slice(-8000)}`
					)
				);
		});
	});
}

export const buildFixture = (root: string, timeout = 120000) =>
	run(
		root,
		['node_modules/vite/bin/vite.js', 'build', '--configLoader', 'native'],
		{},
		timeout
	);
