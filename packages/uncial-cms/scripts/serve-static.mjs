// Minimal static file server for the built demo site, with optional base-path
// mounting (mirrors GitHub Pages project-site serving for the e2e tests).
// Usage: node scripts/serve-static.mjs <dir> <port> [basePath]
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [dir, port, base = ''] = process.argv.slice(2);
if (!dir || !port) {
	console.error('Usage: node scripts/serve-static.mjs <dir> <port> [basePath]');
	process.exit(1);
}

const contentTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon'
};

createServer(async (req, res) => {
	let path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
	if (base !== '') {
		if (path !== base && !path.startsWith(`${base}/`)) {
			res.writeHead(404).end('outside base path');
			return;
		}
		path = path.slice(base.length) || '/';
	}
	if (path.endsWith('/')) path += 'index.html';

	const file = normalize(join(dir, path));
	if (!file.startsWith(normalize(dir))) {
		res.writeHead(403).end();
		return;
	}
	try {
		const data = await readFile(file);
		res.writeHead(200, {
			'content-type': contentTypes[extname(file)] ?? 'application/octet-stream'
		});
		res.end(data);
	} catch {
		res.writeHead(404).end('not found');
	}
}).listen(Number(port), () => {
	console.log(`serving ${dir} at http://localhost:${port}${base}`);
});
