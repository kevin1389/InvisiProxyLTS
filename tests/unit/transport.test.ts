import assert from 'node:assert/strict';
import test from 'node:test';
import { isMobileBrowser, selectedTransport } from '../../src/browser/transport.ts';


test('mobile detection covers Android, iOS and iPad desktop mode', () => {
	const browser = (userAgent: string, platform = '', maxTouchPoints = 0) =>
		({ userAgent, platform, maxTouchPoints }) as Navigator;
	assert.equal(
		isMobileBrowser(browser('Mozilla/5.0 (Linux; Android 14)')),
		true
	);
	assert.equal(
		isMobileBrowser(browser('Mozilla/5.0 (iPhone; CPU iPhone OS 17)')),
		true
	);
	assert.equal(isMobileBrowser(browser('Mozilla/5.0', 'MacIntel', 5)), true);
	assert.equal(isMobileBrowser(browser('Mozilla/5.0', 'Win32', 10)), false);
	assert.equal(isMobileBrowser(browser('Mozilla/5.0', 'MacIntel', 0)), false);
	assert.equal(
		isMobileBrowser({
			...browser('Mozilla/5.0'),
			userAgentData: { mobile: true },
		} as Navigator),
		true
	);
});

test('mobile overrides a saved libcurl choice; desktop preserves valid choices', () => {
	for (const stored of [undefined, 'libcurl', 'epoxy', 'retired-transport'])
		assert.equal(selectedTransport(stored, true), 'epoxy');
	assert.equal(selectedTransport(undefined, false), 'libcurl');
	assert.equal(selectedTransport('retired-transport', false), 'libcurl');
	assert.equal(selectedTransport('libcurl', false), 'libcurl');
	assert.equal(selectedTransport('epoxy', false), 'epoxy');
});
