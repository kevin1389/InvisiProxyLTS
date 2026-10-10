export type TransportName = 'libcurl' | 'epoxy';
export const transportPreferenceVersion = 2;

function isTransientConnectionError(error: unknown): boolean {
	const cause = error instanceof Error ? error.cause : undefined;
	const message =
		`${error instanceof Error ? error.message : error} ${cause ?? ''}`
			.toLowerCase()
			.replaceAll(' ', '')
			.replaceAll('_', '');
	return /tlshandshakeeof|sslconnecterror|http2.{0,100}protocolerror|connectionreset|unexpectedeof/.test(
		message
	);
}

export async function requestWithTransientRetry<T>(
	request: () => Promise<T>,
	method: string,
	signal?: AbortSignal
): Promise<T> {
	try {
		return await request();
	} catch (error) {
		if (
			!['GET', 'HEAD'].includes(method.toUpperCase()) ||
			signal?.aborted ||
			!isTransientConnectionError(error)
		)
			throw error;
	}

	await new Promise((resolve) => setTimeout(resolve, 200));
	if (signal?.aborted)
		throw new DOMException('The request was aborted.', 'AbortError');
	return request();
}

export function withTransientRequestRetry<
	T extends {
		request: (
			remote: URL,
			method: string,
			body: BodyInit | null,
			headers: [string, string][],
			signal: AbortSignal | undefined
		) => Promise<unknown>;
	},
>(transport: T): T {
	const request = transport.request.bind(transport);
	transport.request = ((remote, method, body, headers, signal) =>
		requestWithTransientRetry(
			() => request(remote, method, body, headers, signal),
			method,
			signal
		)) as T['request'];
	return transport;
}

export function isMobileBrowser(browser: Navigator = navigator): boolean {
	const mobile = (
		browser as Navigator & {
			userAgentData?: { mobile?: boolean };
		}
	).userAgentData?.mobile;
	return (
		mobile === true ||
		/Android|iPhone|iPad|iPod|Mobile/i.test(browser.userAgent) ||
		(browser.platform === 'MacIntel' && browser.maxTouchPoints > 1)
	);
}

export function selectedTransport(
	stored: unknown,
	mobile = isMobileBrowser(),
	storedVersion?: number
): TransportName {
	return mobile ||
		storedVersion !== transportPreferenceVersion ||
		stored !== 'libcurl'
		? 'epoxy'
		: 'libcurl';
}
