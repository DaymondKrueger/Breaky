import { GameState, BallSchema, PaddleSchema } from "../../shared/schemas/GameState";
import { BrickManager, BrickTypes } from "./BrickManager";
import { stepBall, BallStepCallbacks } from "../../shared/physics/ballPhysics";
import * as C from "../../shared/constants";

export class BallManager {
	// Server-only: napalm state is never sent to clients
	private ballNapalm = new Map<string, boolean>();
	private ballReleased = new Map<string, boolean>(); // false = stuck, true = in play
	private nextBallId = 0;

	constructor(private state: GameState, private bricks: BrickManager) {}

	spawnBall(sessionId: string, paddle: PaddleSchema): string {
		const ballId = `ball_${this.nextBallId++}`;
		const ball = new BallSchema();
		ball.ownerSessionId = sessionId;
		ball.x  = paddle.x + (C.PADDLE_WIDTH * paddle.scaleX) / 2 - C.BALL_WIDTH / 2;
		ball.y  = paddle.team === 0 ? C.BLUE_PADDLE_Y - C.BALL_HEIGHT : C.RED_PADDLE_Y + C.PADDLE_HEIGHT;
		ball.vX = 0;
		ball.vY = 0;
		this.state.balls.set(ballId, ball);
		this.ballNapalm.set(ballId, false);
		this.ballReleased.set(ballId, false);
		return ballId;
	}

	removeBall(ballId: string): void {
		this.state.balls.delete(ballId);
		this.ballNapalm.delete(ballId);
		this.ballReleased.delete(ballId);
	}

	removeAllForSession(sessionId: string): void {
		const toRemove: string[] = [];
		this.state.balls.forEach((ball, ballId) => {
			if (ball.ownerSessionId === sessionId) toRemove.push(ballId);
		});
		for (const ballId of toRemove) this.removeBall(ballId);
	}

	updateAll(dt: number, broadcastShake: () => void): string[] {
		const toDestroy: string[] = [];
		this.state.balls.forEach((_ball, ballId) => {
			if (this.updateBall(ballId, dt, broadcastShake) === "destroy") {
				toDestroy.push(ballId);
			}
		});
		return toDestroy;
	}

	releaseBall(sessionId: string): void {
		this.state.balls.forEach((ball, ballId) => {
			if (ball.ownerSessionId !== sessionId) return;
			if (this.ballReleased.get(ballId)) return;
			const paddle = this.state.paddles.get(sessionId);
			if (!paddle) return;
			ball.vY = paddle.team === 0 ? -5 : 5;
            ball.vX = Math.random() * 3 - 1.5; // -1.5 to 1.5
			this.ballReleased.set(ballId, true);
		});
	}

    hasUnreleasedBall(sessionId: string): boolean {
		let found = false;
		this.state.balls.forEach((ball, ballId) => {
			if (ball.ownerSessionId === sessionId && !this.ballReleased.get(ballId)) found = true;
		});
		return found;
	}

	private updateBall(ballId: string, dt: number, broadcastShake: () => void): "ok" | "destroy" {
		const ball = this.state.balls.get(ballId)!;
		const ownerPaddle = this.state.paddles.get(ball.ownerSessionId);
		const ownerTeam = ownerPaddle?.team ?? 0;
		const napalm = this.ballNapalm.get(ballId) ?? false;

        // Ball is stuck to the paddle
		if (!this.ballReleased.get(ballId)) {
			if (ownerPaddle) {
				ball.x = ownerPaddle.x + (C.PADDLE_WIDTH * ownerPaddle.scaleX) / 2 - C.BALL_WIDTH / 2;
			}
			return "ok";
		}

		const callbacks: BallStepCallbacks = {
			onBrickHit: (brickIndex: number) => {
				if (!ownerPaddle) return;
				const brick = this.state.bricks[brickIndex];
				if (!brick) return;

				switch (brick.brickType) {
					case BrickTypes.RED_BRICK: case BrickTypes.BLUE_BRICK: {
						ownerPaddle.score += 5;
						if (napalm) {
							ownerPaddle.score += 5;
							this.bricks.ownBrick(brick, ball.ownerSessionId);
							this.ballNapalm.set(ballId, false);
						} else if (brick.health > 1) {
							brick.health--;
						} else {
							ownerPaddle.score += 5;
							this.bricks.ownBrick(brick, ball.ownerSessionId);
						}
						break;
					}
					case BrickTypes.MYSTERY: {
						const powerUps = [BrickTypes.NAPALM, BrickTypes.MULTIBALL, BrickTypes.TURBO, BrickTypes.SLOWMO, BrickTypes.INVERSION, BrickTypes.SHRINKRAY];
						brick.brickType = powerUps[Math.floor(Math.random() * powerUps.length)];
						break;
					}
					case BrickTypes.DYNAMITE: {
						this.bricks.explodeBrick(brick.relX, brick.relY, ball.ownerSessionId, true, broadcastShake);
						break;
					}
					case BrickTypes.INDESTRUCT: break;
					case BrickTypes.NAPALM: {
						this.ballNapalm.set(ballId, true);
						this.bricks.ownBrick(brick, ball.ownerSessionId);
						break;
					}
					case BrickTypes.MULTIBALL: {
						this.spawnBall(ball.ownerSessionId, ownerPaddle);
                        this.releaseBall(ball.ownerSessionId);
						ownerPaddle.multiballs++;
						this.bricks.ownBrick(brick, ball.ownerSessionId);
						break;
					}
					case BrickTypes.TURBO: {
						ball.vX += ball.vX > 0 ?  2.5 : -2.5;
						ball.vY += ball.vY > 0 ?  2.5 : -2.5;
						this.bricks.ownBrick(brick, ball.ownerSessionId);
						break;
					}
					case BrickTypes.SLOWMO: {
						ownerPaddle.pSpeed *= 0.6;
						this.bricks.ownBrick(brick, ball.ownerSessionId);
						break;
					}
					case BrickTypes.INVERSION: {
						ownerPaddle.inversionEffect = !ownerPaddle.inversionEffect;
						this.bricks.ownBrick(brick, ball.ownerSessionId);
						break;
					}
					case BrickTypes.SHRINKRAY: {
						ownerPaddle.scaleX = 0.75;
						this.bricks.ownBrick(brick, ball.ownerSessionId);
						break;
					}
					case BrickTypes.BLUE_OWNED: case BrickTypes.RED_OWNED: {
						ownerPaddle.score += 5;
						brick.health = 3;
						brick.brickType = ownerTeam === 0 ? BrickTypes.BLUE_OWNED : BrickTypes.RED_OWNED;
						break;
					}
				}
			},
		};

		const result = stepBall(ball, this.state.bricks, ownerPaddle ?? null, ownerTeam, dt, callbacks,);

		if (result === "destroy") {
			if (ownerPaddle) {
				if (ball.y <= C.GOAL_TOP && ownerPaddle.team === 0) {
					ownerPaddle.score   += 20;
					this.state.redHealth = Math.max(0, this.state.redHealth - 5);
				} else if (ball.y >= C.GOAL_BOTTOM && ownerPaddle.team === 1) {
					ownerPaddle.score    += 20;
					this.state.blueHealth = Math.max(0, this.state.blueHealth - 5);
				}
			}
		}

		return result;
	}
}
