import * as C from "../constants";

// Interfaces
export interface BallState {
	x: number;
	y: number;
	vX: number;
	vY: number;
    napalmQueued: boolean; // queues up napalm to activate next time ball hits paddle
    napalmActive: boolean; // if napalm is active
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

export type HitSide = "top" | "bottom" | "left" | "right";

export interface BallStepCallbacks {
	onBrickHit(brickIndex: number, hitSide: HitSide, contactX: number, contactY: number): void;
}

const MAX_SPEED = 25;

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

function rectsOverlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
	return ax + aw > bx && ax < bx + bw && ay + ah > by && ay < by + bh;
}

// axis override: "y" = force vertical bounce, "x" = force horizontal, null = use heuristic
function bounceAndDepenetrate(ball: BallState, brick: PhysicsBrick, axisOverride: "x" | "y" | null): HitSide {
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
		// Capture hit side BEFORE flipping velocity
		const side: HitSide = ball.vY > 0 ? "top" : "bottom";
		ball.vY *= -1;
		if (ball.vY < 0) {
			ball.y = brick.y - C.BALL_HEIGHT;
		} else {
			ball.y = brick.y + C.BRICK_HEIGHT;
		}
		return side;
	} else {
		const side: HitSide = ball.vX > 0 ? "left" : "right";
		ball.vX *= -1;
		if (ball.vX < 0) {
			ball.x = brick.x - C.BALL_WIDTH;
		} else {
			ball.x = brick.x + C.BRICK_WIDTH;
		}
		return side;
	}
}

const BRICK_STEP_X = C.BRICK_WIDTH + C.BRICK_GAP;
const GRID_ORIGIN_X = 40;

// Pre-computed row Y positions (must match BrickManager.spawnMap)
const ROW_YS: number[] = [
	C.HEIGHT / 2 - 96 - C.BRICK_HEIGHT - C.BRICK_GAP * 2,
	C.HEIGHT / 2 - 60 - C.BRICK_HEIGHT - C.BRICK_GAP,
	C.HEIGHT / 2 - 24 - C.BRICK_HEIGHT,
	C.HEIGHT / 2 + 24,
	C.HEIGHT / 2 + 60 + C.BRICK_GAP,
	C.HEIGHT / 2 + 96 + C.BRICK_GAP * 2,
];
const NUM_ROWS = 6;

const _hitBuf: number[] = [];

/**
 * Advance one physics tick for a single ball.
 * Returns "destroy" if the ball has left the field (fell into a goal).
 *
 * @param ball Mutable ball state. Can be a plain object or a BallSchema
 * @param bricks The full bricks array (BrickSchema[] satisfies PhysicsBrick[])
 * @param paddle The owning paddle, or null if the owner has left
 * @param ownerTeam 0 = blue, 1 = red. Used to skip friendly-owned bricks
 * @param dt Ticker delta (1.0 at 60 fps)
 * @param callbacks Side-effect hooks. No-op on client, game-logic on server
 * @param bricksPerLine Number of bricks in one row (for grid lookup). Pass 0 to fall back to brute-force scan.
 */
export function stepBall(ball: BallState, bricks: ArrayLike<PhysicsBrick | undefined>, paddle: PhysicsPaddle | null, ownerTeam: number, dt: number, callbacks: BallStepCallbacks, bricksPerLine: number = 0): "ok" | "destroy" {
	ball.x += ball.vX * dt;
	ball.y += ball.vY * dt;

	if (ball.y <= C.GOAL_TOP || ball.y >= C.GOAL_BOTTOM) {
		return "destroy";
	}

	if (ball.x <= C.WALL_LEFT) {
		ball.vX = Math.abs(ball.vX); // force rightward
		ball.x = C.WALL_LEFT;
	} else if (ball.x >= C.MAP_WIDTH - C.WALL_LEFT - C.BALL_WIDTH) {
		ball.vX = -Math.abs(ball.vX); // force leftward
		ball.x = C.MAP_WIDTH - C.WALL_LEFT - C.BALL_WIDTH;
	}

	if (paddle) {
		const paddleW = C.PADDLE_WIDTH * paddle.scaleX;
		const paddleY = paddle.team === 0 ? C.BLUE_PADDLE_Y : C.RED_PADDLE_Y;

		const PADDLE_MARGIN = 6;
		if (rectsOverlap(ball.x, ball.y, C.BALL_WIDTH, C.BALL_HEIGHT, paddle.x - PADDLE_MARGIN, paddleY, paddleW + PADDLE_MARGIN * 2, C.PADDLE_HEIGHT)) {
            // Activate napalm if queued
            if (ball.napalmQueued) {
                ball.napalmActive = true;
                ball.napalmQueued = false;
            }

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

	_hitBuf.length = 0;

	if (bricksPerLine > 0) {
		const ballLeft = ball.x;
		const ballRight = ball.x + C.BALL_WIDTH;
		const ballTop = ball.y;
		const ballBottom = ball.y + C.BALL_HEIGHT;

		const colMin = Math.max(0, Math.floor((ballLeft - GRID_ORIGIN_X) / BRICK_STEP_X));
		const colMax = Math.min(bricksPerLine - 1, Math.floor((ballRight - GRID_ORIGIN_X) / BRICK_STEP_X));

		for (let row = 0; row < NUM_ROWS; row++) {
			const rowY = ROW_YS[row];
			if (ballBottom <= rowY || ballTop >= rowY + C.BRICK_HEIGHT) continue;

			for (let col = colMin; col <= colMax; col++) {
				const idx = col + row * bricksPerLine;
				const brick = bricks[idx];
				if (!brick) continue;

				const friendly = (ownerTeam === 0 && brick.brickType === 11) || (ownerTeam === 1 && brick.brickType === 12);
				if (friendly) continue;

				if (!rectsOverlap(ball.x, ball.y, C.BALL_WIDTH, C.BALL_HEIGHT, brick.x, brick.y, C.BRICK_WIDTH, C.BRICK_HEIGHT)) continue;

				_hitBuf.push(idx);
			}
		}
	} else {
		for (let i = 0; i < bricks.length; i++) {
			const brick = bricks[i];
			if (!brick) continue;

			const friendly = (ownerTeam === 0 && brick.brickType === 11) || (ownerTeam === 1 && brick.brickType === 12);
			if (friendly) continue;

			if (!rectsOverlap(ball.x, ball.y, C.BALL_WIDTH, C.BALL_HEIGHT, brick.x, brick.y, C.BRICK_WIDTH, C.BRICK_HEIGHT)) continue;

			_hitBuf.push(i);
		}
	}

	if (_hitBuf.length > 0) {
		// Determine axis override by checking if any two hits are neighbours.
		// Also track the collision face so we only damage bricks on that face (not corner-clipped bricks from an adjacent row/column).
		let axisOverride: "x" | "y" | null = null;
		let faceValue = -1; // the shared y (for horiz pair) or x (for vert pair)

		if (_hitBuf.length >= 2) {
			const horizStep = C.BRICK_WIDTH + C.BRICK_GAP; // x delta for side-by-side
			const vertStep = C.BRICK_HEIGHT + C.BRICK_GAP; // y delta for stacked

			outer:
			for (let a = 0; a < _hitBuf.length; a++) {
				const ba = bricks[_hitBuf[a]]!;
				for (let b = a + 1; b < _hitBuf.length; b++) {
					const bb = bricks[_hitBuf[b]]!;
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
		const firstBrick = bricks[_hitBuf[0]]!;
		const hitSide = bounceAndDepenetrate(ball, firstBrick, axisOverride);

		// Compute the contact point on the brick surface
		const ballCenterX = ball.x + C.BALL_WIDTH / 2;
		const ballCenterY = ball.y + C.BALL_HEIGHT / 2;
		let contactX: number;
		let contactY: number;

		switch (hitSide) {
			case "top":
				contactX = clamp(ballCenterX, firstBrick.x, firstBrick.x + C.BRICK_WIDTH);
				contactY = firstBrick.y;
				break;
			case "bottom":
				contactX = clamp(ballCenterX, firstBrick.x, firstBrick.x + C.BRICK_WIDTH);
				contactY = firstBrick.y + C.BRICK_HEIGHT;
				break;
			case "left":
				contactX = firstBrick.x;
				contactY = clamp(ballCenterY, firstBrick.y, firstBrick.y + C.BRICK_HEIGHT);
				break;
			case "right":
				contactX = firstBrick.x + C.BRICK_WIDTH;
				contactY = clamp(ballCenterY, firstBrick.y, firstBrick.y + C.BRICK_HEIGHT);
				break;
		}

		// Fire callbacks. Only for bricks on the collision face when an adjacent pair was found, so corner-clipped bricks are ignored.
		for (const idx of _hitBuf) {
			if (axisOverride === "y") {
				// Only hit bricks in the same row as the adjacent pair
				if (Math.abs(bricks[idx]!.y - faceValue) > 1) continue;
			} else if (axisOverride === "x") {
				// Only hit bricks in the same column as the adjacent pair
				if (Math.abs(bricks[idx]!.x - faceValue) > 1) continue;
			}
			callbacks.onBrickHit(idx, hitSide, contactX, contactY);
		}
	}

	ball.vX = clamp(ball.vX, -MAX_SPEED, MAX_SPEED);
	ball.vY = clamp(ball.vY, -MAX_SPEED, MAX_SPEED);

	return "ok";
}
