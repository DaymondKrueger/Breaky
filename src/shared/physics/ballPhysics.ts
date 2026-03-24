import * as C from "../constants";

// Interfaces
// Minimal shapes so BallSchema / BrickSchema / PaddleSchema are accepted structurally without importing schema classes here

export interface BallState {
	x: number;
	y: number;
	vX: number;
	vY: number;
}

export interface PhysicsBrick {
	x: number;
	y: number;
	brickType: number;
}

export interface PhysicsPaddle {
	x: number;
	team: number;
	scaleX: number;
}

export interface BallStepCallbacks {
	onBrickHit(brickIndex: number): void;
}

// Hard cap on ball speed to prevent runaway turbo stacking
const MAX_SPEED = 25;

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
	return ax + aw > bx && ax < bx + bw && ay + ah > by && ay < by + bh;
}

// axis override: "y" = force vertical bounce, "x" = force horizontal, null = use heuristic
function bounceAndDepenetrate(ball: BallState, brick: PhysicsBrick, axisOverride: "x" | "y" | null): void {
	let bounceY: boolean;

	if (axisOverride === "y") {
		bounceY = true;
	} else if (axisOverride === "x") {
		bounceY = false;
	} else {
		// Single-brick hit: use penetration-depth heuristic
		const overlapX = ball.vX > 0 ? (ball.x + C.BALL_WIDTH) - brick.x : (brick.x + C.BRICK_WIDTH) - ball.x;
		const overlapY = ball.vY > 0 ? (ball.y + C.BALL_HEIGHT) - brick.y : (brick.y + C.BRICK_HEIGHT) - ball.y;
		const normX = overlapX / (Math.abs(ball.vX) || 0.001);
		const normY = overlapY / (Math.abs(ball.vY) || 0.001);
		bounceY = normY <= normX;
	}

	if (bounceY) {
		ball.vY *= -1;
		if (ball.vY < 0) {
			ball.y = brick.y - C.BALL_HEIGHT;
		} else {
			ball.y = brick.y + C.BRICK_HEIGHT;
		}
	} else {
		ball.vX *= -1;
		if (ball.vX < 0) {
			ball.x = brick.x - C.BALL_WIDTH;
		} else {
			ball.x = brick.x + C.BRICK_WIDTH;
		}
	}
}

/**
 * Advance one physics tick for a single ball.
 *
 * Mutates `ball` in place (x, y, vX, vY).
 * Returns "destroy" if the ball has left the field (fell into a goal).
 *
 * @param ball Mutable ball state. Can be a plain object or a BallSchema
 * @param bricks The full bricks array (BrickSchema[] satisfies PhysicsBrick[])
 * @param paddle The owning paddle, or null if the owner has left
 * @param ownerTeam 0 = blue, 1 = red. Used to skip friendly-owned bricks
 * @param dt Ticker delta (1.0 at 60 fps)
 * @param callbacks Side-effect hooks. No-op on client, game-logic on server
 */
export function stepBall(ball: BallState, bricks: ArrayLike<PhysicsBrick | undefined>, paddle: PhysicsPaddle | null, ownerTeam: number, dt: number, callbacks: BallStepCallbacks,): "ok" | "destroy" {
	ball.x += ball.vX * dt;
	ball.y += ball.vY * dt;

	if (ball.y <= C.GOAL_TOP || ball.y >= C.GOAL_BOTTOM) {
		return "destroy";
	}

	if (ball.x <= C.WALL_LEFT) {
		ball.vX = Math.abs(ball.vX); // force rightward
		ball.x  = C.WALL_LEFT;
	} else if (ball.x >= C.MAP_WIDTH - C.WALL_LEFT - C.BALL_WIDTH) {
		ball.vX = -Math.abs(ball.vX); // force leftward
		ball.x  = C.MAP_WIDTH - C.WALL_LEFT - C.BALL_WIDTH;
	}

	if (paddle) {
		const paddleW = C.PADDLE_WIDTH * paddle.scaleX;
		const paddleY = paddle.team === 0 ? C.BLUE_PADDLE_Y : C.RED_PADDLE_Y;

		const PADDLE_MARGIN = 6;
        if (rectsOverlap(ball.x, ball.y, C.BALL_WIDTH, C.BALL_HEIGHT, paddle.x - PADDLE_MARGIN, paddleY, paddleW + PADDLE_MARGIN * 2, C.PADDLE_HEIGHT)) {
			// Only reverse if ball is heading toward the paddle face
			if (paddle.team === 0 && ball.vY > 0) ball.vY *= -1;
			if (paddle.team === 1 && ball.vY < 0) ball.vY *= -1;

			// Angle off-centre hit
			const centerBallX = ball.x + C.BALL_WIDTH / 2;
			let hit = (centerBallX - paddle.x - paddleW / 2) / (paddleW / 2);
			hit = clamp(hit, -1, 1);
			// Avoid pure-vertical shots at dead centre
			if (hit > 0.45 && hit < 0.5) hit -= 0.05;
			if (hit >= 0.5 && hit < 0.55) hit += 0.05;
			ball.vX += 3 * hit;

			// Depenetrate: push ball flush against paddle face
			if (paddle.team === 0) {
				ball.y = paddleY - C.BALL_HEIGHT;
			} else {
				ball.y = paddleY + C.PADDLE_HEIGHT;
			}
		}
	}

	const hitIndices: number[] = [];
	for (let i = 0; i < bricks.length; i++) {
		const brick = bricks[i];
		if (!brick) continue;

		const friendly = (ownerTeam === 0 && brick.brickType === 11) || (ownerTeam === 1 && brick.brickType === 12);
		if (friendly) continue;

		if (!rectsOverlap(ball.x, ball.y, C.BALL_WIDTH, C.BALL_HEIGHT, brick.x, brick.y, C.BRICK_WIDTH, C.BRICK_HEIGHT)) continue;

		hitIndices.push(i);
	}

	if (hitIndices.length > 0) {
		// Determine axis override by checking if any two hits are neighbours.
		// Also track the collision face so we only damage bricks on that face (not corner-clipped bricks from an adjacent row/column).
		let axisOverride: "x" | "y" | null = null;
		let faceValue = -1; // the shared y (for horiz pair) or x (for vert pair)

		if (hitIndices.length >= 2) {
			const horizStep = C.BRICK_WIDTH + C.BRICK_GAP; // x delta for side-by-side
			const vertStep = C.BRICK_HEIGHT + C.BRICK_GAP; // y delta for stacked

			outer:
			for (let a = 0; a < hitIndices.length; a++) {
				const ba = bricks[hitIndices[a]]!;
				for (let b = a + 1; b < hitIndices.length; b++) {
					const bb = bricks[hitIndices[b]]!;
					const dx = Math.abs(ba.x - bb.x);
					const dy = Math.abs(ba.y - bb.y);

					if (dy < 1 && Math.abs(dx - horizStep) < 1) {
						// Same row, side-by-side = ball came from above/below
						axisOverride = "y";
						faceValue = ba.y;
						break outer;
					}
					if (dx < 1 && Math.abs(dy - vertStep) < 1) {
						// Same column, stacked = ball came from the side
						axisOverride = "x";
						faceValue = ba.x;
						break outer;
					}
				}
			}
		}

		// Bounce off the first hit brick, with the axis override if detected
		const firstBrick = bricks[hitIndices[0]]!;
		bounceAndDepenetrate(ball, firstBrick, axisOverride);

		// Fire callbacks. Only for bricks on the collision face when an adjacent pair was found, so corner-clipped bricks are ignored.
		for (const idx of hitIndices) {
			if (axisOverride === "y") {
				// Only hit bricks in the same row as the adjacent pair
				if (Math.abs(bricks[idx]!.y - faceValue) > 1) continue;
			} else if (axisOverride === "x") {
				// Only hit bricks in the same column as the adjacent pair
				if (Math.abs(bricks[idx]!.x - faceValue) > 1) continue;
			}
			callbacks.onBrickHit(idx);
		}
	}

	ball.vX = clamp(ball.vX, -MAX_SPEED, MAX_SPEED);
	ball.vY = clamp(ball.vY, -MAX_SPEED, MAX_SPEED);

	return "ok";
}
