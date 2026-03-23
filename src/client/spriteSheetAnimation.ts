import { Texture, Rectangle } from "pixi.js";

export interface SpriteSheetConfig {
	/** Alias of the preloaded texture (from Assets) */
	alias: string;
	/** Total number of frames in the strip */
	frameCount: number;
	/** Playback speed in frames per second */
	fps: number;
	/** Whether the animation loops or plays once and stops */
	loop: boolean;
}

/**
 * Holds the pre-sliced frame textures for a spritesheet.
 * Create one of these per spritesheet asset; share it across all particles / sprites that need to play the same animation.
 */
export class SpriteSheetFrames {
	readonly frames: Texture[];
	readonly fps: number;
	readonly loop: boolean;
	readonly frameDuration: number; // seconds per frame
	readonly totalDuration: number; // seconds for one full playthrough
	readonly frameWidth: number;
	readonly frameHeight: number;

	constructor(config: SpriteSheetConfig) {
		const base = Texture.from(config.alias);

		const fw = Math.floor(base.width / config.frameCount);
		const fh = base.height;

		this.frameWidth = fw;
		this.frameHeight = fh;
		this.fps = config.fps;
		this.loop = config.loop;
		this.frameDuration = 1 / config.fps;
		this.totalDuration = config.frameCount / config.fps;

		this.frames = [];
		for (let i = 0; i < config.frameCount; i++) {
			const x = i * fw;
			const y = 0;
			const frame = new Texture({
				source: base.source,
				frame: new Rectangle(x, y, fw, fh),
			});
			this.frames.push(frame);
		}
	}

	/** Get the frame texture for a given elapsed time (seconds). Clamps or wraps depending on loop. */
	getFrameAtTime(elapsed: number): { texture: Texture; finished: boolean } {
		const frameIndex = Math.floor(elapsed / this.frameDuration);

		if (this.loop) {
			return {
				texture: this.frames[frameIndex % this.frames.length],
				finished: false,
			};
		}

		if (frameIndex >= this.frames.length) {
			return {
				texture: this.frames[this.frames.length - 1],
				finished: true,
			};
		}

		return {
			texture: this.frames[frameIndex],
			finished: false,
		};
	}
}
