import assert from 'node:assert/strict';
import test from 'node:test';
import { wispOptions } from '../../src/server/wisp.ts';

test('Wisp memory and concurrency limits stay modest for small hosts', () => {
	assert.equal(wispOptions.tcpBufferSize, 65_536);
	assert.equal(wispOptions.socketBufferSize, 65_536);
	assert.equal(wispOptions.pendingQueueSize, 262_144);
	assert.equal(wispOptions.floodProtection?.maxInFlightSyns, 4);
	assert.equal(
		wispOptions.floodProtection?.maxConcurrentStreamsPerConnection,
		8
	);
	assert.equal(wispOptions.floodProtection?.maxConcurrentConnections, 16);
});
