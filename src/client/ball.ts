import { Sprite, Texture } from "pixi.js";
import { gs } from "./state";
import { BallTrail } from "./ballTrail";
import type { BallSchema } from "../shared/schemas/GameState";

export class ClientBall {
	sprite: Sprite;
	trail:  BallTrail;

	// ownerTeam and isLocal determine rendering (tint, alpha)
	constructor(schema: BallSchema, isLocal: boolean, isTeammate: boolean, ownerTeam: number) {
		this.sprite = new Sprite(Texture.from("playerBall"));
		this.sprite.position.set(schema.x, schema.y);
        
		if (gs.isFlipped) { this.sprite.scale.y = -1; this.sprite.anchor.y = 1; }

		if (!isLocal && isTeammate) {
			this.sprite.alpha = 0.6;
			this.sprite.tint = ownerTeam === 0 ? gs.BLUE_TINT : gs.RED_TINT;
		} else if (!isLocal && !isTeammate) {
			this.sprite.alpha = 0.6;
			this.sprite.tint = ownerTeam === 1 ? gs.RED_TINT : gs.BLUE_TINT;
		}
        
		// Trail colour follows the owner's team: team 0 = blue, team 1 = red
		this.trail = new BallTrail(ownerTeam === 0 ? "blue" : "red");

        this.trail.setNapalm(schema.napalm);
		schema.listen("napalm", (val: boolean) => {
			this.trail.setNapalm(val);
		});

		gs.camera.addChild(this.sprite);
	}

	destroy(): void {
		this.trail.destroy();
		gs.camera.removeChild(this.sprite);
		this.sprite.destroy();
	}
}
