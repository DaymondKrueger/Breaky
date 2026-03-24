import { Sprite, Container } from "pixi.js";
import { gs } from "./state";
import { getTrailTexture } from "./trailTexture";
import { SpriteSheetFrames } from "./spriteSheetAnimation";

// Start colour is the brighter highlight, end colour fades to the team tint
const TRAIL_COLOURS = {
	blue: { start: 0x8EF1FF, end: 0x61EAFF },
	red: { start: 0xFF96B0, end: 0xFF547C },
} as const;

const PARTICLE_LIFETIME = 0.5; // seconds each particle lives
const EMIT_INTERVAL = 0.016; // emit a particle every 16 ms
const MAX_PARTICLES = 120; // hard cap per trail

// Napalm trail settings
const NAPALM_SCALE = 0.08; // 512x900 frames scaled down to trail size
// How often a napalm imprint is stamped down (seconds)
const NAPALM_IMPRINT_INTERVAL = 0.05;
// How long each imprint lingers before fully faded (seconds)
const NAPALM_IMPRINT_LIFETIME = 0.4;
// Max pooled imprints (should comfortably cover lifetime / interval)
const MAX_NAPALM_IMPRINTS = 8;

let _napalmSheet: SpriteSheetFrames | null = null;

function getNapalmSheet(): SpriteSheetFrames {
	if (!_napalmSheet) {
		_napalmSheet = new SpriteSheetFrames({
			alias: "napalmTrail",
			frameCount: 19,
			fps: 24,
			loop: true,
		});
	}
	return _napalmSheet;
}

interface TrailParticle {
	sprite: Sprite;
	life: number; // remaining lifetime (seconds)
	maxLife: number; // total lifetime (seconds)
	active: boolean; // is particle currently in use
}

interface NapalmImprint {
	sprite: Sprite;
	life: number; // remaining lifetime (seconds)
	maxLife: number;
	elapsed: number; // animation clock (seconds)
	active: boolean;
}

function lerpColor(from: number, to: number, t: number): number {
	const r1 = (from >> 16) & 0xff, g1 = (from >> 8) & 0xff, b1 = from & 0xff;
	const r2 = (to >> 16) & 0xff, g2 = (to >> 8) & 0xff, b2 = to & 0xff;
	return (Math.round(r1 + (r2 - r1) * t) << 16) | (Math.round(g1 + (g2 - g1) * t) << 8) | Math.round(b1 + (b2 - b1) * t);
}

export class BallTrail {
	private container: Container;

	// Normal trail pool
	private pool: TrailParticle[] = [];
	private emitAccum = 0;
	private startColor: number;
	private endColor: number;

	// Napalm: lead sprite that follows the ball
	private napalmSprite: Sprite;
	private napalmSheet: SpriteSheetFrames;
	private napalmElapsed = 0;
	private _napalmActive = false;
	private napalmRotation = 0;

	// Napalm: imprint pool — stamps left behind that fade out
	private imprintPool: NapalmImprint[] = [];
	private imprintEmitAccum = 0;

	constructor(teamColor: "blue" | "red") {
		const colours = TRAIL_COLOURS[teamColor];
		this.startColor = colours.start;
		this.endColor = colours.end;

		this.container = new Container();
		this.container.label = "noCull";
		this.napalmSheet = getNapalmSheet();

		// Pre-allocate normal particle pool
		for (let i = 0; i < MAX_PARTICLES; i++) {
			const sprite = new Sprite(getTrailTexture());
			sprite.anchor.set(0.5);
			sprite.renderable = false;
			this.container.addChild(sprite);
			this.pool.push({ sprite, life: 0, maxLife: PARTICLE_LIFETIME, active: false });
		}

		// Pre-allocate napalm imprint pool (rendered behind the lead sprite)
		for (let i = 0; i < MAX_NAPALM_IMPRINTS; i++) {
			const sprite = new Sprite(this.napalmSheet.frames[0]);
			sprite.anchor.set(0.5, 0.15);
			sprite.scale.set(NAPALM_SCALE);
			sprite.renderable = false;
			this.container.addChild(sprite);
			this.imprintPool.push({ sprite, life: 0, maxLife: NAPALM_IMPRINT_LIFETIME, elapsed: 0, active: false });
		}

		// Lead napalm trail sprite (rendered on top of imprints)
		this.napalmSprite = new Sprite(this.napalmSheet.frames[0]);
		this.napalmSprite.anchor.set(0.5, 0.15);
		this.napalmSprite.scale.set(NAPALM_SCALE);
		this.napalmSprite.renderable = false;
		this.container.addChild(this.napalmSprite);

		// Added before the ball sprite so the trail renders behind the ball
		gs.camera.addChild(this.container);
	}

	/** Toggle napalm trail mode on/off */
	setNapalm(active: boolean): void {
		if (this._napalmActive === active) return;
		this._napalmActive = active;

		if (active) {
			this.napalmElapsed = 0;
			this.imprintEmitAccum = 0;
			this.napalmSprite.renderable = true;
		} else {
			this.napalmSprite.renderable = false;
			// Imprints keep ticking so they fade out naturally
		}
	}

	update(x: number, y: number, ballW: number, ballH: number, vX: number, vY: number, dt: number): void {
		const dtSec = dt / 60;
		const cx = x + ballW / 2;
		const cy = y + ballH / 2;

		if (this._napalmActive) {
			// Advance lead animation
			this.napalmElapsed += dtSec;
			const { texture } = this.napalmSheet.getFrameAtTime(this.napalmElapsed);

			// Snap rotation to travel direction
			if (vX !== 0 || vY !== 0) {
				this.napalmRotation = Math.atan2(vY, vX) + Math.PI / 2;
			}

			// Update lead sprite
			this.napalmSprite.texture = texture;
			this.napalmSprite.position.set(cx, cy);
			this.napalmSprite.rotation = this.napalmRotation;

			// Emit imprints at regular intervals
			this.imprintEmitAccum += dtSec;
			while (this.imprintEmitAccum >= NAPALM_IMPRINT_INTERVAL) {
				this.imprintEmitAccum -= NAPALM_IMPRINT_INTERVAL;
				this.activateImprint(cx, cy, this.napalmRotation, this.napalmElapsed);
			}

			// Pause normal emission so it doesn't burst on switch-back
			this.emitAccum = 0;
		} else {
			// Emit normal particles
			this.emitAccum += dtSec;
			while (this.emitAccum >= EMIT_INTERVAL) {
				this.emitAccum -= EMIT_INTERVAL;
				this.activateParticle(cx, cy);
			}
			this.imprintEmitAccum = 0;
		}

		// Always tick normal particles so existing ones fade out after switching to napalm
		for (let i = 0; i < this.pool.length; i++) {
			const p = this.pool[i];
			if (!p.active) continue;

			p.life -= dtSec;

			if (p.life <= 0) {
				p.active = false;
				p.sprite.renderable = false;
				continue;
			}

			const t = 1 - p.life / p.maxLife; // 0 = fresh, 1 = dying
			p.sprite.alpha = 0.8 * (1 - t);
			p.sprite.scale.set(1.0 - t * 0.85);
			p.sprite.tint = lerpColor(this.startColor, this.endColor, t);
		}

		// Always tick napalm imprints so they fade out even after napalm deactivates
		const sheet = this.napalmSheet;
		for (let i = 0; i < this.imprintPool.length; i++) {
			const imp = this.imprintPool[i];
			if (!imp.active) continue;

			imp.life -= dtSec;

			if (imp.life <= 0) {
				imp.active = false;
				imp.sprite.renderable = false;
				continue;
			}

			// Continue animating the fire in place
			imp.elapsed += dtSec;
			const { texture } = sheet.getFrameAtTime(imp.elapsed);
			imp.sprite.texture = texture;

			// Fade out over lifetime
			const t = 1 - imp.life / imp.maxLife; // 0 = fresh, 1 = dying
			imp.sprite.alpha = 1 - t;
		}
	}

	// Find an inactive normal particle in the pool and activate it
	private activateParticle(cx: number, cy: number): void {
		for (let i = 0; i < this.pool.length; i++) {
			const p = this.pool[i];
			if (p.active) continue;

			p.active = true;
			p.life = PARTICLE_LIFETIME;
			p.maxLife = PARTICLE_LIFETIME;
			p.sprite.position.set(cx, cy);
			p.sprite.alpha = 0.8;
			p.sprite.scale.set(1.0);
			p.sprite.tint = this.startColor;
			p.sprite.renderable = true;
			return;
		}
	}

	// Stamp down a napalm imprint at the current position/rotation
	private activateImprint(cx: number, cy: number, rotation: number, elapsed: number): void {
		for (let i = 0; i < this.imprintPool.length; i++) {
			const imp = this.imprintPool[i];
			if (imp.active) continue;

			imp.active = true;
			imp.life = NAPALM_IMPRINT_LIFETIME;
			imp.maxLife = NAPALM_IMPRINT_LIFETIME;
			imp.elapsed = elapsed; // start from the lead sprite's current animation time
			imp.sprite.position.set(cx, cy);
			imp.sprite.rotation = rotation;
			imp.sprite.texture = this.napalmSheet.getFrameAtTime(elapsed).texture;
			imp.sprite.alpha = 1;
			imp.sprite.scale.set(NAPALM_SCALE);
			imp.sprite.renderable = true;
			return;
		}
	}

	destroy(): void {
		for (const p of this.pool) {
			p.sprite.destroy({ texture: false });
		}
		this.napalmSprite.destroy({ texture: false });
		for (const imp of this.imprintPool) {
			imp.sprite.destroy({ texture: false });
		}
		this.pool = [];
		this.imprintPool = [];
		gs.camera.removeChild(this.container);
		this.container.destroy({ children: false });
	}
}
