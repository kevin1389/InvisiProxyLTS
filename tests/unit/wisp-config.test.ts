import assert from 'node:assert/strict';
import test from 'node:test';
import { wispOptions } from '../../src/server/wisp.ts';

test('Wisp memory limits stay constrained and concurrency supports modern sites', () => {
	assert.equal(wispOptions.tcpBufferSize, 32_768);
	assert.equal(wispOptions.socketBufferSize, 65_536);
	assert.equal(wispOptions.pendingQueueSize, 131_072);
	assert.equal(wispOptions.bufferRemainingLength, 16_384);
	assert.equal(wispOptions.maxMessageSize, 131_072);
	assert.equal(wispOptions.connectionsLimitPerIP, 32);
	assert.equal(wispOptions.floodProtection?.maxInFlightSyns, 128);
	assert.equal(
		wispOptions.floodProtection?.maxConcurrentStreamsPerConnection,
		128
	);
	assert.equal(wispOptions.floodProtection?.maxConcurrentConnections, 2048);
});
