import { Texture } from "pixi.js";

let _trailTexture: Texture | null = null;

export function getTrailTexture(): Texture {
	if (_trailTexture && !_trailTexture.destroyed) return _trailTexture;

	const r2 = 8;
	const resolution = window.devicePixelRatio || 1;
	const c = (r2 + 1) * resolution;
	const size = c * 2;

	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext("2d")!;

	const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
	gradient.addColorStop(0, "rgba(255,255,255,1)");
	gradient.addColorStop(1, "rgba(255,255,255,0)");

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);

	_trailTexture = Texture.from(canvas);
	return _trailTexture;
}
