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

function bounceAndDepenetrate(ball: BallState, brick: PhysicsBrick): void {
	const overlapX = ball.vX > 0 ? (ball.x + C.BALL_WIDTH) - brick.x : (brick.x + C.BRICK_WIDTH) - ball.x;
	const overlapY = ball.vY > 0 ? (ball.y + C.BALL_HEIGHT) - brick.y : (brick.y + C.BRICK_HEIGHT) - ball.y;
	const normX = overlapX / (Math.abs(ball.vX) || 0.001);
	const normY = overlapY / (Math.abs(ball.vY) || 0.001);
 
	if (normY <= normX) {
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

		if (rectsOverlap(ball.x, ball.y, C.BALL_WIDTH, C.BALL_HEIGHT, paddle.x, paddleY, paddleW, C.PADDLE_HEIGHT)) {

			// Only reverse if ball is heading toward the paddle face
			if (paddle.team === 0 && ball.vY > 0) ball.vY *= -1;
			if (paddle.team === 1 && ball.vY < 0) ball.vY *= -1;

			// Angle off-centre hit
			const centerBallX = ball.x + C.BALL_WIDTH / 2;
			let hit = (centerBallX - paddle.x - paddleW / 2) / (paddleW / 2);
			hit = clamp(hit, -1, 1);
			// Avoid pure-vertical shots at dead centre
			if (hit >  0.45 && hit <  0.5)  hit -= 0.05;
			if (hit >= 0.5  && hit <  0.55) hit += 0.05;
			ball.vX += 3 * hit;

			// Depenetrate: push ball flush against paddle face
			if (paddle.team === 0) {
				ball.y = paddleY - C.BALL_HEIGHT;
			} else {
				ball.y = paddleY + C.PADDLE_HEIGHT;
			}
		}
	}

	// One hit per tick (break after first). Depenetration inside bounceAndDepenetrate ensures the ball is outside the brick next tick so no cooldown is needed.
	for (let i = 0; i < bricks.length; i++) {
		const brick = bricks[i];
		if (!brick) continue;

		// Skip friendly-owned bricks (blue ball skips type-11 blue bricks, etc.)
		const friendly =
			(ownerTeam === 0 && brick.brickType === 11) ||
			(ownerTeam === 1 && brick.brickType === 12);
		if (friendly) continue;

		if (!rectsOverlap(ball.x, ball.y, C.BALL_WIDTH, C.BALL_HEIGHT, brick.x, brick.y, C.BRICK_WIDTH, C.BRICK_HEIGHT)) continue;

		bounceAndDepenetrate(ball, brick);
		callbacks.onBrickHit(i);
		break;
	}

	ball.vX = clamp(ball.vX, -MAX_SPEED, MAX_SPEED);
	ball.vY = clamp(ball.vY, -MAX_SPEED, MAX_SPEED);

	return "ok";
}
