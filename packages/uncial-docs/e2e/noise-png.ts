// A real PNG encoder for the image e2e: the upload path now decodes what it is
// given, so a placeholder buffer is no longer a usable fixture. Pixels are
// pseudo-random because a flat colour would compress far under the forge's
// size limit and never exercise the downscale.
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

/** xorshift32: an LCG's low bits are periodic enough for deflate to eat them. */
function nextNoise(seed: number): number {
	let x = seed;
	x ^= x << 13;
	x ^= x >>> 17;
	x ^= x << 5;
	return x >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typed));
	return Buffer.concat([length, typed, crc]);
}

/** An 8-bit RGB PNG of `width` × `height` deterministic noise. */
export function noisePng(width: number, height: number): Buffer {
	const raw = Buffer.alloc(height * (1 + width * 3)); // filter byte per scanline
	let seed = 0x2f6e2b1;
	let offset = 0;
	for (let y = 0; y < height; y += 1) {
		offset += 1; // filter type 0 (none)
		for (let x = 0; x < width * 3; x += 1) {
			seed = nextNoise(seed);
			raw[offset] = seed & 0xff;
			offset += 1;
		}
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}
