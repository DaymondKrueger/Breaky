import { Texture } from "pixi.js";

let _trailTexture: Texture | null = null;

export function getTrailTexture(): Texture {
	if (_trailTexture && !_trailTexture.destroyed) return _trailTexture;

	const radius = 8;
	const center = radius + 1;
	const size = center * 2;

	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d")!;

	const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
	gradient.addColorStop(0, "rgba(255,255,255,1)");
	gradient.addColorStop(1, "rgba(255,255,255,0)");

	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);

	_trailTexture = Texture.from(canvas);
	return _trailTexture;
}
