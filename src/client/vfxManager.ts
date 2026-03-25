import { Sprite } from "pixi.js";
import { gs } from "./state";
import { SpriteSheetFrames } from "./spriteSheetAnimation";

export interface VfxSpawnOptions {
	sheet: SpriteSheetFrames;
	x: number;
	y: number;
	// Rotation in radians (default 0)
	rotation?: number;
	// Uniform scale multiplier (default 1). Use this to resize the effect.
	scale?: number;
	// Anchor X (0-1). Default 0.5 (centred horizontally)
	anchorX?: number;
	// Anchor Y (0-1). Default 1.0 (bottom-centre, base of effect sits on surface)
	anchorY?: number;
	// If true, flip the sprite vertically (scale.y *= -1). Default false.
	flipY?: boolean;
}

interface ActiveVfx {
	sprite: Sprite;
	sheet: SpriteSheetFrames;
	elapsed: number;
}

export class VfxManager {
	private active: ActiveVfx[] = [];

	spawn(opts: VfxSpawnOptions): void {
		const sprite = new Sprite(opts.sheet.frames[0]);

		sprite.anchor.set(opts.anchorX ?? 0.5, opts.anchorY ?? 1.0);
		sprite.position.set(opts.x, opts.y);
		sprite.rotation = opts.rotation ?? 0;

		const s = opts.scale ?? 1;
		sprite.scale.set(s, opts.flipY ? -s : s);

		gs.camera.addChild(sprite);

		this.active.push({ sprite, sheet: opts.sheet, elapsed: 0 });
	}

	update(dt: number): void {
		const frameSec = dt / 60; // convert ticker dt to seconds

		for (let i = this.active.length - 1; i >= 0; i--) {
			const vfx = this.active[i];
			vfx.elapsed += frameSec;

			const { texture, finished } = vfx.sheet.getFrameAtTime(vfx.elapsed);

			if (finished) {
				gs.camera.removeChild(vfx.sprite);
				vfx.sprite.destroy();
				this.active.splice(i, 1);
			} else {
				vfx.sprite.texture = texture;
			}
		}
	}

	clear(): void {
		for (const vfx of this.active) {
			gs.camera.removeChild(vfx.sprite);
			vfx.sprite.destroy();
		}
		this.active.length = 0;
	}
}
