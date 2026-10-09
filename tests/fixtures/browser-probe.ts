import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	chromium,
	devices,
	type Browser,
	type BrowserContext,
} from 'playwright';
const load = <T>(path: string): Promise<T> =>
	import(pathToFileURL(join(process.cwd(), path)).href);
const { createSiteHandler } = await load<
	typeof import('../../src/server/handler.ts')
>('src/server/handler.ts');
const { serve } = await import('../helpers/http.ts');
const { config, serverUrl } =
	await load<typeof import('../../src/config.ts')>('src/config.ts');
const { pages } = (
	await load<typeof import('../../src/server/routes.ts')>(
		'src/server/routes.ts'
	)
).loadRoutes();
const { classNames } = await load<
	typeof import('../../src/obfuscation/classes.ts')
>('src/obfuscation/classes.ts');
const classes = new Proxy(classNames(), {
	get: (names, key: string) => names[key] || key,
});
const { getAltPrefix } = await load<
	typeof import('../../src/obfuscation/paths.ts')
>('src/obfuscation/paths.ts');
const app = await serve(createSiteHandler());
let browser: Browser | undefined;
try {
	const { origin } = app;
	const base = origin + serverUrl.pathname;
	const route = (file: string) =>
		base + Object.keys(pages).find((key) => pages[key] === file);
	browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	const context = await browser.newContext({ serviceWorkers: 'block' });
	await context.route('**/*', (request) =>
		new URL(request.request().url()).origin === origin
			? request.continue()
			: request.fulfill({
					status: 200,
					contentType: 'application/javascript',
					body: '',
				})
	);
	await context.addInitScript(() => {
		Object.assign(window, {
			AOS: {
				init() {
					document.documentElement.setAttribute(
						'data-aos-initialized',
						'true'
					);
					document
						.querySelectorAll('[data-aos]')
						.forEach((element) => {
							element.classList.add('aos-init', 'aos-animate');
						});
				},
				refresh() {},
			},
			tippy: () => [],
			loadFull: async () => {},
			tsParticles: { load: async () => ({ destroy() {} }) },
		});
	});
	const page = await context.newPage();
	page.setDefaultTimeout(10000);
	if (config.disguiseFiles) {
		await page.goto(route('pages/nav/partners.html'));
		await page.getByText('403 Forbidden').waitFor();
		await page.goto(base);
	}
	await page.route('**/aos.css', (request) =>
		request.fulfill({
			contentType: 'text/css',
			body: '[data-aos^="fade"] { opacity: 0; transform: translateX(-100px); } [data-aos].aos-animate { opacity: 1; transform: none; }',
		})
	);
	await page.goto(route('index.html'));
	await page.waitForFunction(
		() =>
			document.documentElement.getAttribute('data-aos-initialized') ===
			'true'
	);
	assert.equal(
		new URL(page.url()).pathname,
		serverUrl.pathname,
		'the homepage stays at the root'
	);
	assert.equal(
		await page.locator('#banner').count(),
		config.showSplash ? 1 : 0
	);
	const animatedSections = page.locator('[data-aos]');
	assert.ok((await animatedSections.count()) > 5);
	assert.ok(
		await animatedSections.evaluateAll((elements) =>
			elements.every(
				(element) => getComputedStyle(element).opacity === '1'
			)
		)
	);
	await page.evaluate(() => {
		delete (window as unknown as { AOS?: unknown }).AOS;
		for (const element of document.querySelectorAll('[data-aos]'))
			element.classList.remove('aos-init', 'aos-animate');
	});
	assert.ok(
		await animatedSections.evaluateAll((elements) =>
			elements.every(
				(element) => getComputedStyle(element).opacity === '1'
			)
		)
	);
	await page
		.getByRole('button', { name: 'Mirror links', exact: true })
		.click();
	const button = page.locator('#dispense-link');
	await button.waitFor({ state: 'visible' });
	assert.equal(
		await button.getAttribute('data-endpoint'),
		`${serverUrl.pathname}api/link`
	);
	const buttonClasses = (await button.getAttribute('class')) ?? '';
	assert.ok(buttonClasses.includes(classes.fancybutton || 'fancybutton'));
	assert.ok(buttonClasses.includes(classes.glowbutton || 'glowbutton'));
	if (!config.usingSEO)
		assert.doesNotMatch(buttonClasses, /fancybutton|glowbutton/);
	assert.equal(
		await button.evaluate((el) => getComputedStyle(el).borderRadius),
		'8px'
	);
	await button.click();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLAnchorElement>('#dispensed-link')
				?.hidden === false
	);
	assert.ok(
		['https://first.example/', 'https://second.example/'].includes(
			(await page.locator('#dispensed-link').getAttribute('href')) ?? ''
		)
	);
	assert.equal(
		await page.locator('#dispensed-link').getAttribute('rel'),
		'noopener noreferrer'
	);
	await button.click();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLButtonElement>('#dispense-link')
				?.disabled === false
	);
	assert.equal(
		await page.locator('#dispensed-link').getAttribute('href'),
		null
	);
	assert.equal(
		await page
			.locator('#dispensed-link')
			.evaluate((el) => (el as HTMLAnchorElement).hidden),
		true
	);
	assert.match(
		(await page.locator('#dispenser-status').textContent()) ?? '',
		/wait|try again/i
	);
	for (const data of [
		{ error: 'Mirrors are unavailable.' },
		{ link: 'javascript:alert(1)' },
	]) {
		await page.route('**/api/link', (request) =>
			request.fulfill({ status: data.error ? 503 : 200, json: data })
		);
		await button.click();
		await page.waitForFunction(
			() =>
				document.querySelector<HTMLButtonElement>('#dispense-link')
					?.disabled === false
		);
		assert.equal(
			await page.locator('#dispensed-link').getAttribute('href'),
			null
		);
		assert.ok(await page.locator('#dispenser-status').textContent());
		await page.unroute('**/api/link');
	}
	const pending: { release?: () => void } = {};
	await page.route('**/api/link', async (request) => {
		await new Promise<void>((resolve) => {
			pending.release = resolve;
		});
		await request.fulfill({ json: { link: 'https://pending.example/' } });
	});
	await button.click();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLButtonElement>('#dispense-link')
				?.disabled === true
	);
	assert.ok(pending.release);
	pending.release();
	await page.waitForFunction(
		() =>
			document.querySelector<HTMLButtonElement>('#dispense-link')
				?.disabled === false
	);
	await page.unroute('**/api/link');

	await page.goto(route('faq.html'));
	const search = page.getByRole('searchbox', {
		name: 'Search frequently asked questions',
	});
	await search.waitFor();
	assert.equal(await search.getAttribute('class'), classes['faq-search']);
	const entries = page.locator('#faqs > div');
	const total = await entries.count();
	assert.ok(total > 5);
	await search.fill('  DiS\u200bCoRd  ');
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll<HTMLElement>('#faqs > div')].filter(
				(el) => el.style.display !== 'none'
			).length === 1
	);
	await search.fill('no-match-for-this-query');
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>('#faqs > div')].every(
			(el) => el.style.display === 'none'
		)
	);
	await search.fill('');
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>('#faqs > div')].every(
			(el) => el.style.display !== 'none'
		)
	);

	await page.evaluate(() => {
		const form = document.querySelector<HTMLFormElement>('#titleform');
		if (!form) throw new Error('Missing title form');
		(form.firstElementChild as HTMLInputElement).value = 'Test tab title';
		form.requestSubmit();
	});
	await page.waitForFunction(() => document.title === 'Test tab title');
	await page.reload();
	await page.waitForFunction(() => document.title === 'Test tab title');
	await search.waitFor();
	await page
		.locator('#settings-theme')
		.selectOption('light', { force: true });
	await page.waitForFunction(
		(name) => document.documentElement.classList.contains(name),
		classes.light
	);
	await page.reload();
	await search.waitFor();
	await page.waitForFunction(
		(name) => document.documentElement.classList.contains(name),
		classes.light
	);
	await page.locator('#settings-theme').selectOption('dark', { force: true });
	await page.waitForFunction(
		(name) => !document.documentElement.classList.contains(name),
		classes.light
	);
	await search.fill('discord');
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll<HTMLElement>('#faqs > div')].filter(
				(el) => el.style.display !== 'none'
			).length === 1
	);

	await page.evaluate(() => {
		const key = Object.keys(localStorage).find((key) =>
			key.endsWith('-storage')
		);
		if (!key) throw new Error('Missing settings storage');
		localStorage.setItem(
			key,
			JSON.stringify({
				...JSON.parse(localStorage.getItem(key) || '{}'),
				Transport: 'retired-transport',
				SearchEngine: '_0xlegacy',
			})
		);
	});
	await page.goto(route('pages/proxnav/scramjet.html'));
	await page.waitForURL(
		(url) =>
			url.pathname ===
			new URL(route('pages/proxnav/scramjet.html')).pathname
	);
	await page.locator('#search-input').waitFor();
	await page.waitForFunction(() => {
		const key = Object.keys(localStorage).find((key) =>
			key.endsWith('-storage')
		);
		return (
			key &&
			!JSON.parse(localStorage.getItem(key) || '{}').Transport &&
			!JSON.parse(localStorage.getItem(key) || '{}').SearchEngine
		);
	});
	await page.locator('#settings-panel').waitFor({ state: 'attached' });
	assert.equal(
		await page.locator('#settings-transport').inputValue(),
		'libcurl'
	);
	assert.equal(
		await page.locator('#browsing-transport').inputValue(),
		'libcurl'
	);
	assert.equal(await page.locator('#settings-panel select').count(), 2);
	assert.equal(
		await page.locator('#settings-panel input[type="checkbox"]').count(),
		3
	);
	const historySwitches = page.locator(`input.${classes['history-toggle']}`);
	assert.equal(await historySwitches.count(), 2);
	for (const checked of [false, true]) {
		await historySwitches.last().evaluate((input, checked) => {
			(input as HTMLInputElement).checked = checked;
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}, checked);
		assert.deepEqual(
			await historySwitches.evaluateAll((inputs) =>
				inputs.map((input) => (input as HTMLInputElement).checked)
			),
			[checked, checked]
		);
		assert.equal(
			await page.evaluate(() => {
				const key = Object.keys(localStorage).find((key) =>
					key.endsWith('-storage')
				);
				return (
					key &&
					JSON.parse(localStorage.getItem(key) || '{}').HistoryHide
				);
			}),
			checked ? 'hidehistory' : 'none'
		);
	}
	assert.equal(
		await page
			.locator('#transport-setting')
			.evaluate((el) => (el as HTMLElement).hidden),
		false
	);
	assert.equal(
		await page.locator('#settings-search-engine').inputValue(),
		'DuckDuckGo'
	);
	const engineOptions = await page
		.locator('#settings-search-engine option')
		.evaluateAll((options) =>
			options.map((option) => ({
				text: option.textContent?.replace(
					/[\u00ad\u200b-\u200d\ufeff]/g,
					''
				),
				value: (option as HTMLOptionElement).value,
			}))
		);
	assert.deepEqual(
		engineOptions,
		['Startpage', 'DuckDuckGo', 'Bing', 'Brave'].map((name) => ({
			text: name,
			value: name,
		}))
	);
	const iconOptions = await page
		.locator('#icon-list option')
		.evaluateAll((options) =>
			options.map((option) => ({
				text: option.textContent?.replace(
					/[\u00ad\u200b-\u200d\ufeff]/g,
					''
				),
				value: (option as HTMLOptionElement).value,
			}))
		);
	assert.deepEqual(
		iconOptions,
		['', 'Google', 'Bing', 'Google Drive', 'Gmail'].map((name) => ({
			text: name || 'Select an icon preset',
			value: name,
		}))
	);
	await page.waitForFunction(() => {
		const el = document.querySelector<HTMLInputElement>('#search-input');
		if (!el) throw new Error('Missing search input');
		el.value = 'https://ready.example/';
		el.dispatchEvent(
			new KeyboardEvent('keydown', {
				code: 'Validator Test',
				bubbles: true,
			})
		);
		return el.value.startsWith('sj:');
	});
	for (const [input, expected] of [
		['https://example.com/path?q=1', 'https://example.com/path?q=1'],
		['example.com', 'http://example.com/'],
		['two words & symbols', null],
	] as const) {
		const resolved = await page.evaluate((input) => {
			const el =
				document.querySelector<HTMLInputElement>('#search-input');
			if (!el) throw new Error('Missing search input');
			el.value = input;
			el.dispatchEvent(
				new KeyboardEvent('keydown', {
					code: 'Validator Test',
					bubbles: true,
				})
			);
			return el.value;
		}, input);
		assert.ok(resolved.startsWith('sj:'));
		const target = resolved.slice(3);
		if (expected) assert.equal(target, expected);
		else {
			assert.equal(new URL(target).protocol, 'https:');
			assert.ok(target.includes(encodeURIComponent(input)));
		}
	}
	await page.locator('#search-input').fill('https://example.com/');
	await page.locator('#search-input').press('Enter');
	await page.waitForURL(
		(url) => url.pathname === new URL(route('pages/frame.html')).pathname
	);
	assert.ok(
		await page.evaluate(() =>
			Object.keys(localStorage).some(
				(key) =>
					key.endsWith('-frame-url') &&
					localStorage[key].startsWith('sj:https://example.com/')
			)
		)
	);
	await page.route('**/loading-frame-test', (request) =>
		request.fulfill({
			contentType: 'text/html',
			body: '<!doctype html><p>Loading fixture content</p><script defer src="loading-frame-test.js"></script>',
		})
	);
	for (const reload of [false, true]) {
		let releaseFrame!: () => void;
		const loading = new Promise<void>((resolve) => {
			releaseFrame = resolve;
		});
		await page.route('**/loading-frame-test.js', async (request) => {
			await loading;
			await request.fulfill({
				contentType: 'application/javascript',
				body: '',
			});
		});
		if (reload) await page.locator('#omnibar-reload').click();
		else
			await page.locator('#frame').evaluate((frame, src) => {
				(frame as HTMLIFrameElement).src = src;
			}, `${base}loading-frame-test`);
		await page
			.frameLocator('#frame')
			.getByText('Loading fixture content')
			.waitFor();
		const overlay = page.locator(`.${classes.loader}`);
		await page.waitForFunction(
			({ loader, active }) =>
				document
					.querySelector(`.${loader}`)
					?.classList.contains(active),
			{ loader: classes.loader, active: classes['loader-active'] }
		);
		assert.equal(
			await overlay.evaluate(
				(element) => getComputedStyle(element).backgroundColor
			),
			'rgba(13, 17, 23, 0.65)'
		);
		releaseFrame();
		await page.waitForFunction(
			({ loader, active }) =>
				!document
					.querySelector(`.${loader}`)
					?.classList.contains(active),
			{ loader: classes.loader, active: classes['loader-active'] }
		);
		await page.unroute('**/loading-frame-test.js');
	}
	await page.goto(route('pages/proxnav/preset/applications.html'));
	await page.getByRole('button', { name: /^youtube$/i }).waitFor();
	await page.getByRole('button', { name: /^youtube$/i }).click();
	await page.waitForURL(
		(url) => url.pathname === new URL(route('pages/frame.html')).pathname
	);
	assert.ok(
		await page.evaluate(() =>
			Object.keys(localStorage).some(
				(key) =>
					key.endsWith('-frame-url') &&
					localStorage[key] === 'sj:https://youtube.com/'
			)
		)
	);
	const prepareRuntimeContext = async (runtimeContext: BrowserContext) => {
		await runtimeContext.route('**/*', (request) =>
			new URL(request.request().url()).origin === origin
				? request.continue()
				: request.fulfill({
						status: 200,
						contentType: 'application/javascript',
						body: '',
					})
		);
		await runtimeContext.addInitScript(() => {
			Object.assign(window, {
				AOS: { init() {}, refresh() {} },
				tippy: () => [],
				loadFull: async () => {},
				tsParticles: { load: async () => ({ destroy() {} }) },
			});
		});
	};
	const runtimeContext = await browser.newContext();
	await prepareRuntimeContext(runtimeContext);
	const runtimePage = await runtimeContext.newPage();
	if (config.disguiseFiles) {
		await runtimePage.goto(base);
	}
	await runtimePage.goto(route('pages/proxnav/scramjet.html'));
	await runtimePage.waitForFunction(
		() => window.$invisiScramjet?.ready === true
	);
	await runtimePage.locator('#search-input').fill('https://example.com/');
	await runtimePage.locator('#search-input').press('Enter');
	await runtimePage.waitForURL(
		(url) => url.pathname === new URL(route('pages/frame.html')).pathname
	);
	assert.equal(
		await runtimePage.locator('#password-field').count(),
		0,
		'the proxy shell must not insert decoy credentials that could hijack login autofill'
	);
	await runtimePage.waitForFunction(
		() =>
			window.$invisiScramjet?.ready === true &&
			window.$invisiScramjet.frame.element ===
				document.getElementById('frame')
	);
	assert.equal(
		await runtimePage.evaluate(
			() => window.$invisiScramjetError === undefined
		),
		true
	);
	const epoxyModule = `${origin}${getAltPrefix('epoxy', serverUrl.pathname)}index.mjs`;
	let desktopEpoxyLoaded = false;
	runtimeContext.on('request', (request) => {
		if (request.url() === epoxyModule) desktopEpoxyLoaded = true;
	});
	await Promise.all([
		runtimePage.waitForEvent('load'),
		runtimePage
			.locator('#settings-transport')
			.selectOption('epoxy', { force: true }),
	]);
	await runtimePage.waitForFunction(
		() =>
			window.$invisiScramjet?.ready === true &&
			(document.getElementById('settings-transport') as HTMLSelectElement)
				?.value === 'epoxy'
	);
	assert.equal(
		desktopEpoxyLoaded,
		true,
		'desktop selection initializes Epoxy'
	);
	await runtimePage.reload();
	await runtimePage.waitForFunction(
		() => window.$invisiScramjet?.ready === true
	);
	assert.equal(
		await runtimePage.locator('#settings-transport').inputValue(),
		'epoxy'
	);
	await runtimePage
		.getByRole('button', { name: 'Settings', exact: true })
		.click();
	await runtimePage.waitForFunction((selector) => {
		const el = document.querySelector(selector);
		return el && getComputedStyle(el).opacity === '1';
	}, `.${classes['dropdown-settings']}`);
	await runtimePage
		.getByRole('button', { name: 'Close settings', exact: true })
		.click();
	await runtimePage.goto(route('pages/proxnav/scramjet.html'));
	await runtimePage.waitForFunction(
		() => window.$invisiScramjet?.ready === true
	);
	assert.equal(
		await runtimePage.locator('#browsing-transport').inputValue(),
		'epoxy'
	);
	await runtimePage.locator('#settings-panel > summary').click();
	await Promise.all([
		runtimePage.waitForEvent('load'),
		runtimePage.locator('#browsing-transport').selectOption('libcurl'),
	]);
	await runtimePage.waitForFunction(
		() => window.$invisiScramjet?.ready === true
	);
	assert.equal(
		await runtimePage.locator('#settings-transport').inputValue(),
		'libcurl'
	);
	await runtimeContext.close();
	const mobileContext = await browser.newContext({ ...devices['iPhone 13'] });
	await prepareRuntimeContext(mobileContext);
	await mobileContext.addInitScript(
		(storageKey) => {
			if (!localStorage.getItem(storageKey))
				localStorage.setItem(
					storageKey,
					JSON.stringify({ Transport: 'libcurl' })
				);
		},
		`${config.usingSEO ? 'ip' : 'net-time'}-storage`
	);
	const mobileModules: string[] = [];
	mobileContext.on('request', (request) => mobileModules.push(request.url()));
	const mobilePage = await mobileContext.newPage();
	if (config.disguiseFiles) await mobilePage.goto(base);
	await mobilePage.goto(route('pages/proxnav/scramjet.html'));
	await mobilePage.waitForFunction(
		() => window.$invisiScramjet?.ready === true
	);
	assert.equal(
		await mobilePage.locator('#settings-transport').inputValue(),
		'epoxy'
	);
	assert.equal(
		await mobilePage
			.locator('#transport-setting')
			.evaluate((el) => (el as HTMLElement).hidden),
		true
	);
	assert.equal(
		await mobilePage.evaluate(() => {
			const key = Object.keys(localStorage).find((key) =>
				key.endsWith('-storage')
			);
			return (
				key && JSON.parse(localStorage.getItem(key) || '{}').Transport
			);
		}),
		'epoxy'
	);
	assert.ok(
		mobileModules.includes(epoxyModule),
		'mobile loads the Merp-processed Epoxy module'
	);
	assert.ok(
		!mobileModules.includes(
			`${origin}${getAltPrefix('libcurl', serverUrl.pathname)}index.mjs`
		),
		'mobile never loads libcurl'
	);
	assert.equal(
		await mobilePage.evaluate(
			() => window.$invisiScramjetError === undefined
		),
		true
	);
	assert.equal(
		await mobilePage.locator('#browsing-transport').inputValue(),
		'epoxy'
	);
	assert.equal(
		await mobilePage
			.locator('#browsing-transport-setting')
			.evaluate((el) => (el as HTMLElement).hidden),
		true
	);
	await mobilePage
		.getByRole('button', { name: 'Settings menu', exact: true })
		.click();
	await mobilePage.waitForFunction((selector) => {
		const el = document.querySelector(selector);
		return el && getComputedStyle(el).opacity === '1';
	}, `.${classes['dropdown-settings']}`);
	const modalBounds = await mobilePage
		.locator(`.${classes['settings-content']}`)
		.boundingBox();
	assert.ok(
		modalBounds &&
			modalBounds.x >= 0 &&
			modalBounds.x + modalBounds.width <= 390,
		'mobile settings fit the viewport'
	);
	await mobileContext.close();
	console.log(
		'Mirror success, cooldown, pending/error/unsafe responses, styling, loader, FAQ hydration persistent tab settings and proxy URL/navigation boundaries passed.'
	);
} finally {
	await browser?.close();
	await app.close();
}
