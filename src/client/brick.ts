import { Sprite, Texture } from "pixi.js";
import { gs } from "./state";

export class Brick {
	brick: Sprite;
	brickType: number;
	relX: number;
	relY: number;
	private randNumber: number;

	constructor(x: number, y: number, brickType: number, relX: number, relY: number) {
		this.brick = new Sprite(Texture.from("brickT3"));
		this.brickType = brickType;
		this.relX = relX;
		this.relY = relY;

		switch (brickType) {
			case 0: 
				this.brick.tint = gs.RED_TINT;  
			break;
			case 1: 
				this.brick.tint = gs.BLUE_TINT; 
			break;
		}

		// Random chance: mystery brick
		this.randNumber = Math.floor(Math.random() * 11);
		if (this.randNumber === 0) {
			this.brick = new Sprite(Texture.from("mysteryBrick"));
			this.brickType = 2;
		}

		// Random chance: dynamite brick
		this.randNumber = Math.floor(Math.random() * 81);
		if (this.randNumber === 0) {
			this.brick = new Sprite(Texture.from("dynamiteBrick"));
			this.brickType = 3;
		}

		// Random chance: indestructible brick
		this.randNumber = Math.floor(Math.random() * 76);
		if (this.randNumber === 0) {
			this.brick = new Sprite(Texture.from("indestructBrick"));
			this.brickType = 4;
		}

		this.brick.position.set(x, y);
		gs.bricks.push(this);
		gs.camera.addChild(this.brick);
	}
}
