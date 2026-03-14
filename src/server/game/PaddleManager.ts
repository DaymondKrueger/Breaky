import { PaddleSchema } from "../../shared/schemas/GameState";
import * as C from "../../shared/constants";

export class PaddleManager {
	updatePaddle(paddle: PaddleSchema, input: { left: boolean; right: boolean; releaseBall: boolean }, dt: number): void {
		const paddleW = C.PADDLE_WIDTH * paddle.scaleX;
		const maxX = C.MAP_WIDTH - paddleW - 34;
		if (paddle.inversionEffect) {
			if (input.right && paddle.x > 34)   paddle.x -= paddle.pSpeed * dt;
			if (input.left  && paddle.x < maxX) paddle.x += paddle.pSpeed * dt;
		} else {
			if (input.right && paddle.x < maxX) paddle.x += paddle.pSpeed * dt;
			if (input.left  && paddle.x > 34)   paddle.x -= paddle.pSpeed * dt;
		}
	}
}
