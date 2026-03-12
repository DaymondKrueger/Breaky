import { Sprite, Texture } from "pixi.js";
import { gs } from "./state";
import type { BrickSchema } from "../shared/schemas/GameState";

export class ClientBrick {
	sprite: Sprite;

	constructor(schema: BrickSchema) {
		this.sprite = new Sprite(this.textureFor(schema));
		this.sprite.position.set(schema.x, schema.y);
		this.applyTint(schema);
		gs.camera.addChild(this.sprite);
	}

	// Called when brickType or health changes on the schema
	update(schema: BrickSchema): void {
		this.sprite.texture = this.textureFor(schema);
		this.sprite.tint = 0xFFFFFF; // reset before applyTint
		this.applyTint(schema);
	}

	private textureFor(schema: BrickSchema): Texture {
		switch (schema.brickType) {
			case 0: case 1:
				if (schema.health >= 3) return Texture.from("brickT3");
				if (schema.health === 2) return Texture.from("brickT2");
				return Texture.from("brickT1");
			case 2: return Texture.from("mysteryBrick");
			case 3: return Texture.from("dynamiteBrick");
			case 4: return Texture.from("indestructBrick");
			case 5: return Texture.from("napalmBrick");
			case 6: return Texture.from("multiballBrick");
			case 7: return Texture.from("turboBrick");
			case 8: return Texture.from("slowmoBrick");
			case 9: return Texture.from("inversionBrick");
			case 10: return Texture.from("shrinkrayBrick");
			case 11: return Texture.from("brickBlue_owned");
			case 12: return Texture.from("brickRed_owned");
			default: return Texture.from("brickT3");
		}
	}

	private applyTint(schema: BrickSchema): void {
		if (schema.brickType === 0) this.sprite.tint = gs.RED_TINT;
		if (schema.brickType === 1) this.sprite.tint = gs.BLUE_TINT;
		if (schema.brickType === 11) this.sprite.tint = gs.BLUE_TINT;
		if (schema.brickType === 12) this.sprite.tint = gs.RED_TINT;
	}

	destroy(): void {
		gs.camera.removeChild(this.sprite);
		this.sprite.destroy();
	}
}
