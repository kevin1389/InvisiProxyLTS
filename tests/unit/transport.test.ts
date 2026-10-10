import assert from 'node:assert/strict';
import test from 'node:test';
import {
	isMobileBrowser,
	requestWithTransientRetry,
	selectedTransport,
	transportPreferenceVersion,
	withTransientRequestRetry,
} from '../../src/browser/transport.ts';

test('transient TLS errors retry once for safe methods', async () => {
	let attempts = 0;
	const result = await requestWithTransientRetry(async () => {
		attempts++;
		if (attempts === 1) throw new Error('TLS handshake EOF');
		return 'ok';
	}, 'GET');
	assert.equal(result, 'ok');
	assert.equal(attempts, 2);
});

test('transport wrapper retries transient failures at the proxy request boundary', async () => {
	let attempts = 0;
	const transport = {
		request: async (
			_remote: URL,
			_method: string,
			_body: BodyInit | null,
			_headers: [string, string][],
			_signal: AbortSignal | undefined
		) => {
			attempts++;
			if (attempts === 1) throw new Error('TLS handshake EOF');
			return 'proxied response';
		},
	};
	const wrapped = withTransientRequestRetry(transport);
	assert.equal(wrapped, transport);
	assert.equal(
		await wrapped.request(
			new URL('https://example.com/'),
			'GET',
			null,
			[],
			undefined
		),
		'proxied response'
	);
	assert.equal(attempts, 2);
});

test('HTTP/2 protocol reset is recognized as transient', async () => {
	let attempts = 0;
	await assert.rejects(
		requestWithTransientRetry(async () => {
			attempts++;
			throw new Error(
				'hyper::Error(Http2, Error { kind: Reset(StreamId, PROTOCOL_ERROR) })'
			);
		}, 'GET'),
		/PROTOCOL_ERROR/
	);
	assert.equal(attempts, 2);
});

test('transient errors do not retry unsafe or non-connection failures', async () => {
	for (const [method, message] of [
		['POST', 'TLS handshake EOF'],
		['GET', 'certificate verify failed'],
	] as const) {
		let attempts = 0;
		await assert.rejects(
			requestWithTransientRetry(async () => {
				attempts++;
				throw new Error(message);
			}, method),
			new Error(message)
		);
		assert.equal(attempts, 1);
	}
});

test('aborted requests do not retry', async () => {
	const controller = new AbortController();
	let attempts = 0;
	await assert.rejects(
		requestWithTransientRetry(
			async () => {
				attempts++;
				controller.abort();
				throw new Error('connection reset');
			},
			'GET',
			controller.signal
		),
		/connection reset/
	);
	assert.equal(attempts, 1);
});

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
