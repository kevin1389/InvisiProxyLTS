import { createServer } from 'node:http';
import { Socket } from 'node:net';
import { wispurr } from 'wispurr';
import { config, serverHost, serverPort, serverUrl } from '../config.ts';
import { entryPointFile } from '../constants.ts';
import { createSiteHandler } from './handler.ts';
import { isWispRequest, wispOptions } from './wisp.ts';

const wisp = new wispurr(wispOptions);
await wisp.start(1);

const server = createServer(createSiteHandler()).on(
	'upgrade',
	(req, socket, head) => {
		if (socket instanceof Socket && isWispRequest(req.url))
			wisp.route(req, socket, head);
		else socket.destroy();
	}
);

let shuttingDown = false;
const stopServer = async () => {
	if (shuttingDown) return;
	shuttingDown = true;
	await wisp.stop();
	server.closeAllConnections();
	server.close();
};
process.once('SIGTERM', () => void stopServer());
process.once('SIGINT', () => void stopServer());
process.once('exit', () => {
	if (wisp.isRunning) wisp.kill();
});

server.listen(serverPort, serverHost, () => {
	process.send?.({ type: 'ready' });
	console.log(`InvisiProxy is listening on port ${serverPort}.`);
	console.log(
		'When hosting with a reverse proxy please ensure you are using NGINX only.\nCaddy and Apache have security risks due to wispurr and loopbacks. Please configure them correctly.\nNGINX is recommended and used for production. Ports are whitelisted and security is maintained with NGINX only.'
	);
	if (config.disguiseFiles)
		console.log(
			`disguiseFiles is enabled. The site root now serves the entry point (views/dist/${entryPointFile}), which unlocks the page loader.`
		);
});
