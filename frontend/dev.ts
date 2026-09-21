import { serve } from "bun";
import { watch } from 'fs/promises';

const filter = /hotreload/;
const namespace = 'virtual';
const code = `Object.assign(new WebSocket(location.origin.replace(/^http/,'ws')+'/hotreload'),{onmessage:_=>location.reload(),onclose:_=>location.reload()})`;

const hotreload: Bun.BunPlugin = {
	name: 'hotreload',
	setup: b => void(b.onResolve({ filter }, ({ path }) => ({ path, namespace })).onLoad({ filter, namespace }, () => ({ contents: code, loader: 'js' })))
};

let assets: { [route: string]: Bun.BuildArtifact };

async function rebuild() {
	const result = await Bun.build({
		entrypoints: ['./index.html'],
		plugins: [hotreload],
		sourcemap: 'inline',
		throw: false,
		splitting: true,
	});

	console.log(result.success ? `Build ok` : 'Build failed');
	result.logs.forEach(v => console.log(v))

	if (result.success) {
		assets = Object.fromEntries(result.outputs.map(v => [v.path.substring(1), v]));
	}
}

await rebuild();

const server = serve({
	websocket: {
		open: ws =>  ws.subscribe('reload'),
		message() {},
	},
	routes: {
		"/hotreload": (req, server) => {
			if (server.upgrade(req)) return; // do not return a Response
			return new Response("Upgrade failed", { status: 500 });
		},
		"/*": req => {
			const asset = assets[req.url.slice(req.url.indexOf("/", 8))] ?? assets['/index.html']!;
			return new Response(asset.stream(), { status: 200, headers: { "Content-Type": asset.type } });
		}

	},
	port: 5173,
});

!async function () { // dont block event loop
	while (true) {
		for await (const { filename } of watch('.', { recursive: true })) {
			console.log(`${filename} changed! rebuilding...`);
			await rebuild();
			server.publish('reload', filename!);
			break;
		}
	}
}();

console.log('bundler running.');