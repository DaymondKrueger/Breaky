import { Sprite, Container } from "pixi.js";
import { gs } from "./state";
import { getTrailTexture } from "./trailTexture";

// Start colour is the brighter highlight, end colour fades to the team tint
const TRAIL_COLOURS = {
	blue: { start: 0x8EF1FF, end: 0x61EAFF },
	red: { start: 0xFF96B0, end: 0xFF547C },
} as const;

const PARTICLE_LIFETIME = 0.5; // seconds each particle lives
const EMIT_INTERVAL = 0.016; // emit a particle every 16 ms
const MAX_PARTICLES = 120; // hard cap per trail

interface TrailParticle {
	sprite: Sprite;
	life: number; // remaining lifetime (seconds)
	maxLife: number; // total lifetime (seconds)
    active: boolean; // is particle currently in use
}

function lerpColor(from: number, to: number, t: number): number {
	const r1 = (from >> 16) & 0xff, g1 = (from >> 8) & 0xff, b1 = from & 0xff;
	const r2 = (to   >> 16) & 0xff, g2 = (to   >> 8) & 0xff, b2 = to   & 0xff;
	return (Math.round(r1 + (r2 - r1) * t) << 16)
	     | (Math.round(g1 + (g2 - g1) * t) << 8)
	     |  Math.round(b1 + (b2 - b1) * t);
}

export class BallTrail {
	private container: Container;
	private pool: TrailParticle[] = [];
	private emitAccum = 0;
	private startColor: number;
	private endColor: number;

	constructor(teamColor: "blue" | "red") {
		const colours = TRAIL_COLOURS[teamColor];
		this.startColor = colours.start;
		this.endColor = colours.end;

		this.container = new Container();
        this.container.label = "noCull";

        // Pre-allocate the entire pool
		for (let i = 0; i < MAX_PARTICLES; i++) {
			const sprite = new Sprite(getTrailTexture());
			sprite.anchor.set(0.5);
			sprite.renderable = false; // hidden until activated
			this.container.addChild(sprite);
			this.pool.push({ sprite, life: 0, maxLife: PARTICLE_LIFETIME, active: false });
		}

		// Added before the ball sprite so the trail renders behind the ball
		gs.camera.addChild(this.container);
	}

	update(x: number, y: number, ballW: number, ballH: number, dt: number): void {
		const dtSec = dt / 60;

		// Emit new particles by activating pooled ones
		this.emitAccum += dtSec;
		while (this.emitAccum >= EMIT_INTERVAL) {
			this.emitAccum -= EMIT_INTERVAL;
			this.activateParticle(x + ballW / 2, y + ballH / 2);
		}

		// Tick and age existing particles
		for (let i = 0; i < this.pool.length; i++) {
			const p = this.pool[i];
			if (!p.active) continue;
 
			p.life -= dtSec;
 
			if (p.life <= 0) {
				// Return to pool instead of destroying
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

	// Find an inactive particle in the pool and activate it
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
		// Destroy the pre-allocated sprites (only on trail teardown)
		for (const p of this.pool) {
			p.sprite.destroy({ texture: false });
		}
		this.pool = [];
		gs.camera.removeChild(this.container);
		this.container.destroy({ children: false });
	}
}
