import type { BunPlugin } from "bun";
import { serve } from "bun";
import EventEmitter from 'events';
import { rm, watch } from 'fs/promises';
import * as sass from 'sass';

const sassPlugin: BunPlugin = {
	name: 'sass-transform',
	setup: bundler => { bundler.onLoad({ filter: /\.scss$/ }, ({ path }) => ({ contents: sass.compile(path).css, loader: 'css' })) }
}

const cmdArgs: Record<string, true | string> = process.argv.slice(2).map(arg => arg.startsWith('--') ? arg.substring(2).split('=') : []).reduce((o, [key, value]) => key ? ({ ...o, [key]: value ?? true }) : o, {});

if (cmdArgs.prod) {

	rm('./dist', { force: true, recursive: true });

	const result = await Bun.build({
		entrypoints: ['./index.html'],
		plugins: [sassPlugin],
		sourcemap: 'none',
		minify: true,
		splitting: true,
		define: {
			"process.env.NODE_ENV": JSON.stringify("production"),
		},
		outdir: './dist'
	});

	console.log(result.success ? 'Frontend Build ok' : 'Frontend Build failed');
	result.logs.forEach(console.log);
	Bun.file('./dist/.gitkeep').write('');

	process.exit(0);
}

const filter = /spark-hotreload/;
const namespace = 'virtual';

const hotreload: BunPlugin = {
	name: 'hotreload',
	setup: bundler => { bundler.onResolve({ filter }, ({ path }) => ({ path, namespace })).onLoad({ filter, namespace }, () => ({ contents: `!${hotreloadShim.toString()}();`, loader: 'js' })) }
};

const debug: BunPlugin = {
	name: 'debug',
	setup: bundler => {
		bundler.onStart(() => {
		})
	}
}

let assets: { [route: string]: Bun.BuildArtifact };
const rebuildEmitter = new EventEmitter();

function hotreloadShim() {
	const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/hotreload`);
	ws.onclose = ws.onmessage = () => location = location;
}

async function rebuild() {
	const result = await Bun.build({
		entrypoints: ['./index.html'],
		plugins: [sassPlugin, hotreload],
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

!async function () { // dont block event loop
	while (true) {
		for await (const { filename } of watch('.', { recursive: true })) {
			console.log(`${filename} changed! rebuilding...`);
			await rebuild();
			rebuildEmitter.emit('rebuild')
			break;
		}
	}
}();

serve({
	websocket: {
		open(ws) {
			ws.data = () => ws.send('reload');
			rebuildEmitter.on('rebuild', ws.data as () => void);
		},
		close: ws => void(rebuildEmitter.removeListener('rebuild', ws.data as () => void)),
		message() {},
	},
	routes: {
		"/hotreload": (req, server) => {
			if (server.upgrade(req)) return; // do not return a Response
			return new Response("Upgrade failed", { status: 500 });
		},
		"/*": req => {
			const path = req.url.slice(req.url.indexOf("/", 8));
			let asset = assets[path] ?? assets['/index.html']!;
			return new Response(asset.stream(), { status: 200, headers: { "Content-Type": asset.type } });
		}

	},
	port: 5173,
})

console.log('bundler running.');