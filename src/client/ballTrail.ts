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
	private particles: TrailParticle[] = [];
	private emitAccum = 0;
	private startColor: number;
	private endColor: number;

	constructor(teamColor: "blue" | "red") {
		const colours = TRAIL_COLOURS[teamColor];
		this.startColor = colours.start;
		this.endColor = colours.end;

		this.container = new Container();
        this.container.label = "noCull";

		// Added before the ball sprite so the trail renders behind the ball
		gs.camera.addChild(this.container);
	}

	update(x: number, y: number, ballW: number, ballH: number, dt: number): void {
		const dtSec = dt / 60;

		// Emit new particles
		this.emitAccum += dtSec;
		while (this.emitAccum >= EMIT_INTERVAL && this.particles.length < MAX_PARTICLES) {
			this.emitAccum -= EMIT_INTERVAL;
			this.spawnParticle(x + ballW / 2, y + ballH / 2);
		}
		if (this.emitAccum >= EMIT_INTERVAL) this.emitAccum = 0;

		// Tick and age existing particles
		for (let i = this.particles.length - 1; i >= 0; i--) {
			const p = this.particles[i];
			p.life -= dtSec;

			if (p.life <= 0) {
				this.container.removeChild(p.sprite);
				p.sprite.destroy({ texture: false });
				this.particles.splice(i, 1);
				continue;
			}

			const t = 1 - p.life / p.maxLife; // 0 = fresh, 1 = dying

			p.sprite.alpha = 0.8 * (1 - t);
			p.sprite.scale.set(1.0 - t * 0.85);
			p.sprite.tint = lerpColor(this.startColor, this.endColor, t);
		}
	}

	private spawnParticle(cx: number, cy: number): void {
		const sprite = new Sprite(getTrailTexture());
		sprite.anchor.set(0.5);
		sprite.position.set(cx, cy);
		sprite.alpha = 0.8;
		sprite.scale.set(1.0);
		sprite.tint = this.startColor;

		this.particles.push({ sprite, life: PARTICLE_LIFETIME, maxLife: PARTICLE_LIFETIME });
		this.container.addChild(sprite);
	}

	destroy(): void {
		for (const p of this.particles) p.sprite.destroy({ texture: false });
		this.particles = [];
		gs.camera.removeChild(this.container);
		this.container.destroy({ children: false });
	}
}
