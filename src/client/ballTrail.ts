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
const NAPALM_GHOST_COUNT = 6; // afterimages behind the lead
// Offset between each ghost
const NAPALM_GHOST_OFFSET = 20;
// How fast the trail rotation catches up (0 = frozen, 1 = instant snap)
const NAPALM_ROTATION_LERP = 0.05;

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

	// Napalm trail: lead sprite + ghost afterimages offset behind it
	private napalmSprite: Sprite;
	private napalmGhosts: Sprite[] = [];
	private napalmSheet: SpriteSheetFrames;
	private napalmElapsed = 0;
	private _napalmActive = false;
	private napalmSmoothedRotation = 0;
	private napalmRotationSeeded = false;

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

		// Ghost afterimages (added first so they render behind the lead sprite)
		for (let i = 0; i < NAPALM_GHOST_COUNT; i++) {
			const ghost = new Sprite(this.napalmSheet.frames[0]);
			ghost.anchor.set(0.5, 0.15);
			ghost.scale.set(NAPALM_SCALE);
			ghost.renderable = false;
			this.container.addChild(ghost);
			this.napalmGhosts.push(ghost);
		}

		// Lead napalm trail sprite (rendered on top of ghosts)
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
			this.napalmRotationSeeded = false;
			this.napalmSprite.renderable = true;
			for (const ghost of this.napalmGhosts) ghost.renderable = true;
		} else {
			this.napalmSprite.renderable = false;
			for (const ghost of this.napalmGhosts) ghost.renderable = false;
		}
	}

	update(x: number, y: number, ballW: number, ballH: number, vX: number, vY: number, dt: number): void {
		const dtSec = dt / 60;
		const cx = x + ballW / 2;
		const cy = y + ballH / 2;

		if (this._napalmActive) {
			// Advance animation
			this.napalmElapsed += dtSec;
			const { texture } = this.napalmSheet.getFrameAtTime(this.napalmElapsed);

			// Smoothly rotate toward travel direction
			if (vX !== 0 || vY !== 0) {
				const targetRotation = Math.atan2(vY, vX) + Math.PI / 2;
				if (!this.napalmRotationSeeded) {
					this.napalmSmoothedRotation = targetRotation;
					this.napalmRotationSeeded = true;
				} else {
					// Shortest-path angle difference
					let delta = targetRotation - this.napalmSmoothedRotation;
					delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
					this.napalmSmoothedRotation += delta * NAPALM_ROTATION_LERP;
				}
			}
			const rotation = this.napalmSmoothedRotation;

			// Update lead sprite
			this.napalmSprite.texture = texture;
			this.napalmSprite.position.set(cx, cy);
			this.napalmSprite.rotation = rotation;

			const behindAngle = rotation - Math.PI / 2 + Math.PI;
			const dirX = Math.cos(behindAngle);
			const dirY = Math.sin(behindAngle);

			// Place ghosts along the behind direction with halving opacity
			for (let i = 0; i < NAPALM_GHOST_COUNT; i++) {
				const ghost = this.napalmGhosts[i];
				const dist = (i + 1) * NAPALM_GHOST_OFFSET;
				ghost.position.set(cx + dirX * dist, cy + dirY * dist);
				ghost.rotation = rotation;
				ghost.texture = texture;
				// Each ghost is 50% the opacity of the one before it
				ghost.alpha = 1 / Math.pow(2, i + 1);
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

	destroy(): void {
		for (const p of this.pool) {
			p.sprite.destroy({ texture: false });
		}
		this.napalmSprite.destroy({ texture: false });
		for (const ghost of this.napalmGhosts) {
			ghost.destroy({ texture: false });
		}
		this.pool = [];
		this.napalmGhosts = [];
		gs.camera.removeChild(this.container);
		this.container.destroy({ children: false });
	}
}
