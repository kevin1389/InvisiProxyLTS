import assert from 'node:assert/strict';
import test from 'node:test';
import { wispOptions } from '../../src/server/wisp.ts';

test('Wisp memory and concurrency limits stay constrained for small hosts', () => {
	assert.equal(wispOptions.tcpBufferSize, 32_768);
	assert.equal(wispOptions.socketBufferSize, 32_768);
	assert.equal(wispOptions.pendingQueueSize, 131_072);
	assert.equal(wispOptions.bufferRemainingLength, 16_384);
	assert.equal(wispOptions.maxMessageSize, 131_072);
	assert.equal(wispOptions.connectionsLimitPerIP, 32);
	assert.equal(wispOptions.floodProtection?.maxInFlightSyns, 2);
	assert.equal(
		wispOptions.floodProtection?.maxConcurrentStreamsPerConnection,
		4
	);
	assert.equal(wispOptions.floodProtection?.maxConcurrentConnections, 8);
});
