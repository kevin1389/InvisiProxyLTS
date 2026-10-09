import { createServer } from "node:http";
import { Socket } from "node:net";
import { wispurr } from "wispurr";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import send from "send";
import ts from "typescript";
import { randomBytes, randomInt } from "node:crypto";
import { Indraughts } from "merp-obfuscator";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
//#region src/constants.ts
var projectUrl = new URL("../", import.meta.url);
var projectDir = fileURLToPath(projectUrl);
var configFile = new URL("config.json", projectUrl);
var siteUrl = new URL("views/dist/", projectUrl);
var siteDir = join(projectDir, "views/dist");
join(projectDir, "views/dist-new");
join(projectDir, "dist");
var notFoundFile = "not-found.html";
var routesFile = "routes.json";
var entryPointFile = "pages/misc/deobf/entry-point.html";
var developmentEnv = "INVISIPROXY_VITE_DEV";
var isDevelopment = () => process.env[developmentEnv] === "1";
var linkCooldownMs = 5e3;
//#endregion
//#region src/config.ts
var config = Object.freeze(JSON.parse(readFileSync(configFile, "utf8")));
var serverPort = Number(process.env.PORT ?? config.port);
if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
var serverUrl = (() => {
	let url;
	try {
		url = new URL(config.host);
	} catch {
		url = new URL("http://a");
		url.host = config.host;
	}
	url.port = String(serverPort);
	url.pathname = `${(config.pathname || "/").replace(/\/+$|[^\w/.-]+/g, "")}/`;
	return Object.freeze(url);
})();
//#endregion
//#region src/server/links.ts
var externalPages = {
	github: {
		default: "https://github.com/QuiteAFancyEmerald/InvisiProxy",
		aos: "https://github.com/michalsnik/aos",
		"bare-module": "https://github.com/motortruck1221/bare-as-module3",
		fastify: "https://github.com/fastify/fastify",
		"font-awesome": "https://github.com/FortAwesome/Font-Awesome",
		libcurl: "https://github.com/MercuryWorkshop/libcurl-transport",
		epoxy: "https://github.com/MercuryWorkshop/epoxy-transport",
		"nord-theme": "https://github.com/nordtheme",
		"proxy-transports": "https://github.com/MercuryWorkshop/proxy-transports",
		scramjet: "https://github.com/MercuryWorkshop/scramjet",
		wisp: "https://github.com/MercuryWorkshop/wisp-protocol"
	},
	codespaces: "https://github.com/codespaces",
	"tor-project": "https://support.torproject.org/little-t-tor/getting-started/installing/",
	patreon: "https://www.patreon.com/invisiproxy",
	kofi: "https://ko-fi.com/quiteafancyemerald",
	truffled: "https://truffled.lol",
	freedomproject: "https://nullatenus.com",
	wispurr: "https://github.com/sylvieisnton/wispurr"
};
//#endregion
//#region src/obfuscation/state.ts
var obfuscationStateFile = ".obfuscation.json";
var stateEnv = "INVISIPROXY_OBFUSCATION_STATE";
var cached;
var serialized;
function saveObfuscationState(state) {
	cached = state;
	serialized = JSON.stringify({
		root: projectDir,
		state
	});
	process.env[stateEnv] = serialized;
}
function beginObfuscationBuild() {
	saveObfuscationState({
		version: 1,
		seed: randomBytes(32).toString("hex"),
		aliases: {},
		classes: {}
	});
}
function obfuscationState() {
	const current = process.env[stateEnv];
	if (cached && current === serialized) return cached;
	const path = join(siteDir, obfuscationStateFile);
	const shared = current ? JSON.parse(current) : void 0;
	const source = shared?.root === projectDir ? JSON.stringify(shared.state) : existsSync(path) ? readFileSync(path, "utf8") : "";
	if (source) {
		const state = JSON.parse(source);
		if (state.version !== 1 || !state.seed || !state.aliases || !state.classes) throw new Error("Invalid build obfuscation state; rebuild the site.");
		saveObfuscationState(state);
	} else beginObfuscationBuild();
	if (!cached) throw new Error("Missing obfuscation state");
	return cached;
}
function generatedNames(keys, scope) {
	const names = [...new Set(keys)].sort();
	if (!names.length) return {};
	const source = `(() => { ${names.map((_, index) => `const n${index} = ${index};`).join("\n")} return [${names.map((_, index) => `n${index}`).join(",")}]; })();`;
	const result = Indraughts({ "names.js": source }, {
		seed: `${obfuscationState().seed}:${scope}`,
		style: scope === "paths" ? "word" : "hex",
		renameFiles: false,
		preservePublicNames: true,
		escapeCharacters: false
	});
	const bindings = new Map(result.renames.filter((entry) => entry.kind === "binding").map((entry) => [entry.original, entry.obfuscated]));
	return Object.fromEntries(names.map((name, index) => {
		const value = bindings.get(`n${index}`);
		if (!value) throw new Error(`Merp did not generate a name for ${name}`);
		return [name, value];
	}));
}
//#endregion
//#region src/obfuscation/paths.ts
function getPathAliases() {
	if (config.usingSEO) return {};
	const state = obfuscationState();
	if (Object.keys(state.aliases).length) return state.aliases;
	const keys = /* @__PURE__ */ new Set();
	const source = ts.createSourceFile("pages.ts", readFileSync(join(projectDir, "src/client/pages.ts"), "utf8"), ts.ScriptTarget.Latest, true);
	function visit(node) {
		if (ts.isPropertyAssignment(node) && node.name.getText(source) === "route") {
			const routes = ts.isArrayLiteralExpression(node.initializer) ? node.initializer.elements : [node.initializer];
			for (const route of routes) if (ts.isStringLiteralLike(route) && route.text) keys.add(route.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	for (const [name, target] of Object.entries(externalPages)) if (typeof target === "string") keys.add(name);
	else for (const child of Object.keys(target)) if (child !== "default") keys.add(`${name}/${child}`);
	for (const prefix of [
		"scram",
		"libcurl",
		"epoxy",
		"wisp"
	]) keys.add(`prefixes/${prefix}`);
	const assetDir = join(projectDir, "views/assets");
	const files = (existsSync(assetDir) ? readdirSync(assetDir, {
		recursive: true,
		encoding: "utf8"
	}) : []).filter((file) => extname(file) && !file.endsWith(".map")).map((file) => basename(file).replace(/\.ts$/, ".js"));
	files.push("sw.js", "sw-blacklist.js", "faq-search.js", "splash.json");
	for (const file of files) keys.add(`files/${file}`);
	const names = generatedNames(keys, "paths");
	state.aliases = Object.fromEntries(Object.entries(names).map(([key, value]) => {
		if (key.startsWith("files/")) return [key, value + extname(key)];
		if (key.includes("/") && !key.startsWith("prefixes/")) return [key, key.slice(0, key.indexOf("/") + 1) + value];
		return [key, value];
	}));
	saveObfuscationState(state);
	return state.aliases;
}
var getAltPrefix = (prefix, serverPathname = "/") => `${serverPathname}${getPathAliases()[`prefixes/${prefix}`] || prefix}/`;
function aliasRoutes(pages, links) {
	const aliases = getPathAliases();
	return {
		pages: Object.fromEntries(Object.entries(pages).filter(([name]) => config.usingSEO || !["robots.txt", "sitemap.xml"].includes(name)).map(([name, target]) => [aliases[name] || name, target])),
		links: Object.fromEntries(Object.entries(links).map(([name, target]) => [aliases[name] || name, typeof target === "string" ? target : Object.fromEntries(Object.entries(target).map(([child, url]) => [(aliases[`${name}/${child}`] || `${name}/${child}`).split("/").at(-1) || child, url]))]))
	};
}
//#endregion
//#region src/server/files.ts
var isImage = /\.(?:ico|png|jpg|jpeg)$/;
var notFoundPage = new URL(notFoundFile, siteUrl);
var cached404;
function preloaded404() {
	const stat = statSync(notFoundPage, { throwIfNoEntry: false });
	if (!stat) return "Not Found";
	if (cached404?.mtimeMs !== stat.mtimeMs) {
		const html = readFileSync(notFoundPage, "utf8");
		cached404 = {
			mtimeMs: stat.mtimeMs,
			body: config.disguiseFiles ? gzipSync(html) : html
		};
	}
	return cached404.body;
}
function tryReadFile(file, baseUrl = projectUrl, isBuffer = config.disguiseFiles) {
	const location = new URL(file, baseUrl);
	if (!existsSync(location)) return preloaded404();
	return isImage.test(location.pathname) || isBuffer ? readFileSync(location) : readFileSync(location, "utf8");
}
//#endregion
//#region src/server/link-dispenser.ts
var linksFile = pathToFileURL(resolve(projectDir, config.mirrorLinksFile));
function json(res, status, body, headers = {}) {
	const payload = Buffer.from(JSON.stringify(body));
	res.writeHead(status, {
		"Cache-Control": "no-store",
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": payload.length,
		...headers
	});
	res.end(payload);
}
function parseLinks(text) {
	return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).flatMap((line) => {
		try {
			const url = new URL(line);
			return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? [url.href] : [];
		} catch {
			return [];
		}
	});
}
function createLinkDispenser(file = linksFile, clientIp = (req) => req.socket.remoteAddress) {
	const requests = /* @__PURE__ */ new Map();
	return async (req, res) => {
		req.resume();
		const ip = clientIp(req) || "";
		const now = Date.now();
		const nextRequest = requests.get(ip) || 0;
		if (nextRequest > now) return json(res, 429, { error: `Please wait ${linkCooldownMs / 1e3} seconds before requesting another link.` }, { "Retry-After": Math.ceil((nextRequest - now) / 1e3) });
		for (const [client, expires] of requests) if (expires <= now) requests.delete(client);
		if (requests.size >= 1e4) return json(res, 503, { error: "Please try again shortly." });
		requests.set(ip, now + linkCooldownMs);
		try {
			const links = parseLinks(await readFile(file, "utf8"));
			if (links.length) return json(res, 200, { link: links[randomInt(links.length)] });
		} catch {}
		return json(res, 503, { error: "No mirror links are available right now. Please check back later." });
	};
}
//#endregion
//#region src/server/routes.ts
function loadRoutes() {
	let pages;
	try {
		pages = JSON.parse(readFileSync(new URL(routesFile, siteUrl), "utf8"));
	} catch (cause) {
		throw new Error("The site has not been built yet; run `pnpm build`.", { cause });
	}
	const { pages: servedPages, links } = aliasRoutes(pages, externalPages);
	return {
		pages: servedPages,
		externalPages: links
	};
}
//#endregion
//#region src/server/wisp.ts
var wispPath = () => getAltPrefix("wisp", serverUrl.pathname);
var isWispRequest = (url) => Boolean(url?.endsWith(wispPath()));
var { frameObfuscation, nonWSRedirect, ...wispOptions } = {
	port: 4432,
	host: "127.0.0.1",
	allowTCP: true,
	allowUDP: false,
	allowDirectIP: false,
	allowPrivateIPs: false,
	allowLoopbackIPs: false,
	tcpBufferSize: 262144,
	socketBufferSize: 16777216,
	pendingQueueSize: 33554432,
	bufferRemainingLength: 32768,
	tcpNoDelay: true,
	blacklist: {
		hostnames: [],
		ports: [
			25,
			465,
			587
		]
	},
	whitelist: {
		hostnames: [],
		ports: []
	},
	websocketPermessageDeflate: false,
	frameObfuscation: {
		enabled: false,
		version: 2,
		key: "",
		tag: "",
		headerLength: 0,
		nonceLength: 0,
		metadataOffset: 0,
		paddingMinimum: 0,
		paddingMaximum: 0,
		paddingPlacement: "split",
		keyStride: 0,
		nonceStride: 0
	},
	dnsServers: [],
	dnsMethod: "resolve",
	dnsResultOrder: "ipv4first",
	enableTwisp: false,
	enableV2: true,
	handshakeTimeoutSeconds: 5,
	motd: "",
	passwordAuth: false,
	passwordAuthRequired: false,
	passwordUsers: {},
	parseRealIP: true,
	trustedProxies: ["127.0.0.1", "::1"],
	trustedHeaders: ["X-Forwarded-For"],
	nonWSResponse: "meow",
	nonWSRedirect: "/pages/404.html",
	logLevel: "warn",
	proxy: "",
	maxMessageSize: 262144,
	staticDir: "",
	bandwidthLimitKbps: 0,
	connectionsLimitPerIP: 200,
	connectionWindowSeconds: 10,
	floodProtection: {
		enabled: true,
		maxConnectsPerSourceIPPerSecond: 500,
		maxConnectsPerDestPerSecond: 250,
		maxConnectsPerDestPerMinute: 6e3,
		maxInFlightSyns: 4096,
		maxConcurrentStreamsPerConnection: 512,
		maxConcurrentConnections: 16384,
		synFloodSignature: {
			enabled: false,
			windowMs: 2e3,
			minSamples: 128,
			failedHandshakeRatio: .75
		},
		wsCloseAfterViolations: 64,
		logBlockedDials: false
	},
	reputation: {
		enabled: false,
		storePath: "./data/wispurr-reputation.json",
		saveIntervalSeconds: 30,
		scoreDecayPerHour: 1,
		evictAfterDays: 7,
		thresholds: {
			warn: 21,
			throttle: 51,
			strict: 81
		},
		weights: {},
		destinationWeights: {}
	}
};
if (frameObfuscation.enabled) throw new Error("This Wispurr version does not support frame obfuscation.");
//#endregion
//#region src/server/handler.ts
var securityHeaders = [
	["Cross-Origin-Opener-Policy", "same-origin"],
	["Cross-Origin-Resource-Policy", "same-origin"],
	["Origin-Agent-Cluster", "?1"],
	["Referrer-Policy", "no-referrer"],
	["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
	["X-Content-Type-Options", "nosniff"],
	["X-DNS-Prefetch-Control", "off"],
	["X-Download-Options", "noopen"],
	["X-Frame-Options", "SAMEORIGIN"],
	["X-Permitted-Cross-Domain-Policies", "none"],
	["X-XSS-Protection", "0"]
];
var pageTypes = {
	default: config.disguiseFiles ? "image/vnd.microsoft.icon" : "text/html",
	html: "text/html",
	txt: "text/plain",
	xml: "application/xml",
	ico: "image/vnd.microsoft.icon"
};
var precompressedTypes = {
	js: "application/javascript; charset=utf-8",
	mjs: "application/javascript; charset=utf-8",
	wasm: "application/wasm"
};
var encodings = [["br", ".br"], ["gzip", ".gz"]];
var trimSlash = (path) => path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
var decode = (path) => {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
};
var extension = (file) => file.slice(file.lastIndexOf(".") + 1);
function reply(res, status, type, body) {
	const payload = typeof body === "string" ? Buffer.from(body) : body;
	res.statusCode = status;
	if (type) res.setHeader("Content-Type", type);
	res.setHeader("Content-Length", payload?.length ?? 0);
	res.end(payload);
}
function redirect(res, location) {
	res.setHeader("Location", location);
	reply(res, 302);
}
function disguiseCheck(pages, externalPages) {
	if (!config.disguiseFiles) return () => "pass";
	const base = serverUrl.pathname;
	const otherFile = new RegExp(`\\.(?!html$|ico$)[\\w-]+$`, "i");
	const exemptDirs = [
		"assets",
		"scram",
		"libcurl",
		"epoxy",
		"wisp"
	].map((dir) => getAltPrefix(dir, base).slice(base.length, -1));
	const exemptPages = ["", "favicon.ico"];
	for (const [name, target] of Object.entries(externalPages)) (typeof target === "string" ? exemptPages : exemptDirs).push(name);
	exemptPages.push(...exemptDirs);
	return (url) => {
		let path;
		try {
			path = new URL(url, serverUrl).pathname.slice(base.length);
		} catch {
			return "pass";
		}
		if (otherFile.test(path) || exemptDirs.some((dir) => path.startsWith(`${dir}/`)) || exemptPages.includes(path)) return "pass";
		if (!path.endsWith(`.ico`)) return "loader";
		if (!Object.hasOwn(pages, path) && !path.endsWith("favicon.ico")) return "modified";
		return "pass";
	};
}
function applyResponseHooks(req, res, development) {
	for (const [name, value] of securityHeaders) res.setHeader(name, value);
	const hide = (req.headers.cookie || "").split("; ").find((cookie) => cookie.startsWith("HistoryHide="))?.split("=")[1] === "true" && req.headers["sec-fetch-dest"] === "document";
	if (!hide && !development) return;
	const writeHead = res.writeHead;
	res.writeHead = function(statusCode, ...args) {
		if (development) {
			for (const arg of args) if (arg && typeof arg === "object" && !Array.isArray(arg)) {
				for (const key of Object.keys(arg)) if (key.toLowerCase() === "cache-control") delete arg[key];
			}
			this.setHeader("Cache-Control", "no-store");
		}
		return writeHead.call(this, hide && !(statusCode >= 300 && statusCode < 400 && this.hasHeader("Location")) ? 404 : statusCode, ...args);
	};
}
function createSiteHandler({ wispRedirect = nonWSRedirect, wispResponse = wispOptions.nonWSResponse, clientIp } = {}) {
	const { pages, externalPages } = loadRoutes();
	const base = serverUrl.pathname;
	const baseRoute = trimSlash(base);
	const development = isDevelopment();
	const dispenserPath = `${base}api/link`;
	const dispense = createLinkDispenser(void 0, clientIp);
	const wispRoute = trimSlash(wispPath());
	const checkDisguise = disguiseCheck(pages, externalPages);
	const loaderPage = config.disguiseFiles ? tryReadFile("pages/misc/deobf/loader.html", siteUrl, false) : "";
	const serviceWorkers = new Map(["sw.js", "sw-blacklist.js"].map((file) => {
		const name = getPathAliases()[`files/${file}`] || file;
		return [base + name, name];
	}));
	const staticDirs = [
		"assets",
		"scram",
		"libcurl",
		"epoxy"
	].map((prefix) => ({
		prefix: getAltPrefix(prefix, base),
		root: join(siteDir, prefix),
		precompressed: prefix !== "assets" && !development,
		vary: prefix !== "assets"
	}));
	const pagesDir = {
		prefix: base,
		root: join(siteDir, "pages"),
		precompressed: false,
		vary: false
	};
	const notFound = (res) => reply(res, 404, pageTypes.default, preloaded404());
	const undisguise = (path) => path.slice(0, path.length - 1 - 3);
	function servePage(res, name, modified) {
		if (name === "favicon.ico") return reply(res, 200);
		if (Object.hasOwn(externalPages, name)) {
			if (modified) return reply(res, 404, pageTypes.html, preloaded404());
			const target = externalPages[name];
			return redirect(res, typeof target === "string" ? target : target.default);
		}
		if (!Object.hasOwn(pages, name)) return notFound(res);
		const file = !name && config.disguiseFiles && !modified ? entryPointFile : pages[name];
		reply(res, 200, modified ? pageTypes["ico"] : pageTypes[extension(file)] || pageTypes.default, tryReadFile(file, siteUrl));
	}
	function serveStatic(req, res, dir, file) {
		res.removeHeader("Content-Type");
		const type = precompressedTypes[extension(file)];
		const accepted = String(req.headers["accept-encoding"] || "");
		const candidates = dir.precompressed && type ? encodings.filter(([name]) => accepted.includes(name)) : [];
		const attempt = (index) => {
			const encoding = candidates[index];
			const stream = send(req, `/${file}${encoding ? encoding[1] : ""}`, {
				root: dir.root,
				index: false
			});
			stream.on("headers", () => {
				if (type) res.setHeader("Content-Type", type);
				if (encoding) res.setHeader("Content-Encoding", encoding[0]);
				if (dir.vary) res.setHeader("Vary", "Accept-Encoding");
			});
			stream.on("directory", () => notFound(res));
			stream.on("error", () => index < candidates.length ? attempt(index + 1) : notFound(res));
			stream.pipe(res);
		};
		attempt(0);
	}
	return (req, res) => {
		applyResponseHooks(req, res, development);
		const url = req.url || "/";
		const path = trimSlash(url.split("?")[0].replace(/\/{2,}/g, "/"));
		if (req.method === "POST" && path === dispenserPath) return void dispense(req, res);
		if (path !== baseRoute && !path.startsWith(base)) return reply(res, 404, "text/plain", "Not Found");
		const disguise = checkDisguise(url);
		if (disguise === "loader") return reply(res, 200, pageTypes.html, loaderPage);
		const modified = disguise === "modified";
		if (modified) {
			res.setHeader("Content-Type", pageTypes["ico"]);
			res.setHeader("Access-Control-Allow-Origin", "null");
		}
		if (req.method !== "GET" && req.method !== "HEAD") return notFound(res);
		if (path === wispRoute) return wispRedirect ? redirect(res, wispRedirect) : reply(res, 200, "text/plain", wispResponse);
		const serviceWorker = serviceWorkers.get(path);
		if (serviceWorker !== void 0) {
			res.setHeader("Service-Worker-Allowed", base);
			return reply(res, 200, "application/javascript", tryReadFile(serviceWorker, siteUrl));
		}
		const relative = path === baseRoute ? "" : path.slice(base.length);
		if (!relative.includes("/")) {
			const name = decode(relative);
			return servePage(res, modified ? undisguise(name) : name, modified);
		}
		const github = /^github\/([^/]+)$/.exec(relative);
		if (github) {
			const name = decode(github[1]);
			return Object.hasOwn(externalPages.github, name) ? redirect(res, externalPages.github[name]) : notFound(res);
		}
		const dir = staticDirs.find((dir) => path.startsWith(dir.prefix)) || pagesDir;
		const file = path.slice(dir.prefix.length);
		serveStatic(req, res, dir, modified ? undisguise(file) : file);
	};
}
//#endregion
//#region src/server/index.ts
var wisp = new wispurr(wispOptions);
await wisp.start(1);
var server = createServer(createSiteHandler()).on("upgrade", (req, socket, head) => {
	if (socket instanceof Socket && isWispRequest(req.url)) wisp.route(req, socket, head);
	else socket.destroy();
});
var shuttingDown = false;
var stopServer = async () => {
	if (shuttingDown) return;
	shuttingDown = true;
	await wisp.stop();
	server.closeAllConnections();
	server.close();
};
process.once("SIGTERM", () => void stopServer());
process.once("SIGINT", () => void stopServer());
process.once("exit", () => {
	if (wisp.isRunning) wisp.kill();
});
server.listen(serverPort, serverUrl.hostname, () => {
	process.send?.({ type: "ready" });
	console.log(`InvisiProxy is listening on port ${serverPort}.`);
	console.log("When hosting with a reverse proxy please ensure you are using NGINX only.\nCaddy and Apache have security risks due to wispurr and loopbacks. Please configure them correctly.\nNGINX is recommended and used for production. Ports are whitelisted and security is maintained with NGINX only.");
	if (config.disguiseFiles) console.log(`disguiseFiles is enabled. The site root now serves the entry point (views/dist/${entryPointFile}), which unlocks the page loader.`);
});
//#endregion
export {};
