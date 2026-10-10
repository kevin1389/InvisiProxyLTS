import assert from 'node:assert/strict';
import test from 'node:test';
import {
	isMobileBrowser,
	selectedTransport,
	transportPreferenceVersion,
} from '../../src/browser/transport.ts';


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

test('Epoxy is the default; desktop can explicitly select the libcurl fallback', () => {
	for (const stored of [undefined, 'epoxy', 'retired-transport'])
		assert.equal(selectedTransport(stored, false), 'epoxy');
	assert.equal(
		selectedTransport('libcurl', false, transportPreferenceVersion),
		'libcurl'
	);
});

test('legacy saved transport choices migrate to Epoxy', () => {
	assert.equal(selectedTransport('libcurl', false, undefined), 'epoxy');
	assert.equal(selectedTransport('libcurl', false, 1), 'epoxy');
	assert.equal(
		selectedTransport('libcurl', false, transportPreferenceVersion),
		'libcurl'
	);
});

test('mobile always uses Epoxy regardless of a saved transport', () => {
	for (const stored of [undefined, 'libcurl', 'epoxy', 'retired-transport'])
		assert.equal(selectedTransport(stored, true), 'epoxy');
});
