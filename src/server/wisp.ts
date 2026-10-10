import type { wispurrOptions } from 'wispurr';
import { serverUrl } from '../config.ts';
import { getAltPrefix } from '../obfuscation/paths.ts';

export const wispPath = () => getAltPrefix('wisp', serverUrl.pathname);
export const isWispRequest = (url: string | null | undefined) =>
	Boolean(url?.endsWith(wispPath()));

const wispConfig = {
	port: 4432,
	host: '127.0.0.1',
	allowTCP: true,
	allowUDP: false,
	allowDirectIP: false,
	allowPrivateIPs: false,
	allowLoopbackIPs: false,
	tcpBufferSize: 32768,
	socketBufferSize: 65536,
	pendingQueueSize: 131072,
	bufferRemainingLength: 16384,
	tcpNoDelay: true,
	blacklist: {
		hostnames: [],
		ports: [25, 465, 587],
	},
	whitelist: {
		hostnames: [],
		ports: [],
	},
	websocketPermessageDeflate: false,
	frameObfuscation: {
		enabled: false,
		version: 2,
		key: '',
		tag: '',
		headerLength: 0,
		nonceLength: 0,
		metadataOffset: 0,
		paddingMinimum: 0,
		paddingMaximum: 0,
		paddingPlacement: 'split',
		keyStride: 0,
		nonceStride: 0,
	},
	dnsServers: [],
	dnsMethod: 'resolve',
	dnsResultOrder: 'ipv4first',
	enableTwisp: false,
	enableV2: true,
	handshakeTimeoutSeconds: 5,
	motd: '',
	passwordAuth: false,
	passwordAuthRequired: false,
	passwordUsers: {},
	parseRealIP: true,
	trustedProxies: ['127.0.0.1', '::1'],
	trustedHeaders: ['X-Forwarded-For'],
	nonWSResponse: 'meow',
	nonWSRedirect: '/pages/404.html',
	logLevel: 'warn',
	proxy: '',
	maxMessageSize: 131072,
	staticDir: '',
	bandwidthLimitKbps: 0,
	connectionsLimitPerIP: 32,
	connectionWindowSeconds: 10,
	floodProtection: {
		enabled: true,
		maxConnectsPerSourceIPPerSecond: 500,
		maxConnectsPerDestPerSecond: 250,
		maxConnectsPerDestPerMinute: 6000,
		maxInFlightSyns: 128,
		maxConcurrentStreamsPerConnection: 128,
		maxConcurrentConnections: 2048,
		synFloodSignature: {
			enabled: false,
			windowMs: 2000,
			minSamples: 128,
			failedHandshakeRatio: 0.75,
		},
		wsCloseAfterViolations: 64,
		logBlockedDials: false,
	},
	reputation: {
		enabled: false,
		storePath: './data/wispurr-reputation.json',
		saveIntervalSeconds: 30,
		scoreDecayPerHour: 1,
		evictAfterDays: 7,
		thresholds: {
			warn: 21,
			throttle: 51,
			strict: 81,
		},
		weights: {},
		destinationWeights: {},
	},
} satisfies wispurrOptions & Record<string, unknown>;

const { frameObfuscation, nonWSRedirect, ...wispOptions } = wispConfig;
if (frameObfuscation.enabled)
	throw new Error('This Wispurr version does not support frame obfuscation.');

export { nonWSRedirect, wispOptions };
