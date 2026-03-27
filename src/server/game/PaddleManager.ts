import { PaddleSchema } from "../../shared/schemas/GameState";
import * as C from "../../shared/constants";

export class PaddleManager {
	private velocities = new Map<string, number>();

	updatePaddle(paddle: PaddleSchema, sessionId: string, input: { left: boolean; right: boolean; releaseBall: boolean }, dt: number): void {
		let vel = this.velocities.get(sessionId) ?? 0;

		let wantsRight = input.right;
		let wantsLeft = input.left;
		if (paddle.inversionEffect) {
			[wantsRight, wantsLeft] = [wantsLeft, wantsRight];
		}

		const dir = (wantsRight ? 1 : 0) - (wantsLeft ? 1 : 0);
		if (dir !== 0) {
			vel += (dir * paddle.pSpeed - vel) * C.PADDLE_ACCEL * dt;
		} else {
			vel *= Math.pow(1 - C.PADDLE_DECEL, dt);
			if (Math.abs(vel) < 0.01) vel = 0;
		}

		const paddleW = C.PADDLE_WIDTH * paddle.scaleX;
		const maxX = C.MAP_WIDTH - paddleW - 34;
		paddle.x = Math.max(34, Math.min(maxX, paddle.x + vel * dt));

		// Kill velocity when pressing into a wall
		if ((vel > 0 && paddle.x >= maxX) || (vel < 0 && paddle.x <= 34)) {
			vel = 0;
		}

		this.velocities.set(sessionId, vel);
	}

	removeSession(sessionId: string): void {
		this.velocities.delete(sessionId);
	}
}
