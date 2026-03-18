import { Sprite, Text, TextStyle, Texture } from "pixi.js";
import { gs } from "./state";
import type { PaddleSchema } from "../shared/schemas/GameState";

export class ClientPaddle {
	paddle: Sprite;
	private usernameText: Text;

	constructor(schema: PaddleSchema, isLocal: boolean) {
		this.paddle = new Sprite(Texture.from("defaultPaddle"));
		this.paddle.x = schema.x;

		const style = new TextStyle({
			fontFamily: "Open Sans",
			fontSize: 24,
			fill: "#ffffff",
			stroke: { color: "#000000", width: 4 },
		});
		this.usernameText = new Text({ text: schema.username, style });

        // Team 0 = blue team, team 1 = red team
		if (schema.team === 1) {
			this.paddle.anchor.y = 1;
			this.paddle.scale.y = -1;
			this.paddle.y = 53;
			this.usernameText.y = this.paddle.y - 46;
		} else {
			this.paddle.y = gs.HEIGHT - 85;
			this.usernameText.y = gs.HEIGHT - 85 + 46;
		}

        if (gs.isFlipped) {
			this.usernameText.scale.y = -1;
			this.usernameText.anchor.y = 1;
		}

		if (!isLocal) this.paddle.alpha = 0.6;

		gs.camera.addChild(this.usernameText);
		gs.camera.addChild(this.paddle);
		this.syncLabelX(schema.x);
	}

	// Called by main.ts ticker for both local (predicted) and remote (interpolated) paddles
	syncLabelX(x: number): void {
		this.usernameText.x = x + this.paddle.width / 2 - this.usernameText.width / 2;
	}

	update(schema: PaddleSchema): void {
		this.paddle.scale.x = schema.scaleX;
	}

	destroy(): void {
		gs.camera.removeChild(this.paddle);
		gs.camera.removeChild(this.usernameText);
		this.paddle.destroy();
		this.usernameText.destroy();
	}
}
