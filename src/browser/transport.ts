export type TransportName = 'libcurl' | 'epoxy';
export const transportPreferenceVersion = 2;

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
	return mobile || storedVersion !== transportPreferenceVersion || stored !== 'libcurl'
		? 'epoxy'
		: 'libcurl';
}
