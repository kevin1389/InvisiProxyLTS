import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from '../helpers/fixture.ts';

for (const disguiseFiles of [true, false]) {
	test(`development Scramjet navigation through default Epoxy and libcurl: disguise=${disguiseFiles}`, {
		timeout: 360000,
	}, async (t) => {
		const root = await fixture(
			t,
			{
				usingSEO: false,
				disguiseFiles,
				minifyScripts: true,
				pathname: '/school/',
			},
			true
		);
		await run(
			root,
			[
				fileURLToPath(
					new URL('../fixtures/dev-probe.ts', import.meta.url)
				),
			],
			{
				INVISIPROXY_VITE_DEV: '1',
				INVISIPROXY_TEST_BROWSER: '1',
			},
			300000
		);
	});
}
