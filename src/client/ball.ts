import { Sprite, Texture } from "pixi.js";
import { gs } from "./state";
import { screenShake } from "./main";
import type { Paddle } from "./paddle";
import type { Brick }  from "./brick";

export class Ball {
	// types: 0=player primary, 1=player multi, 2=teammate, 3=enemy
	ball: Sprite;
	bY: number = 5;
	bX: number = 0;
	maxBXChange: number = 3;
	centerOfBallX: number = 0;
	centerOfBallY: number = 0;
	lastHitUser: boolean = false;
	napalmEffect: boolean = false;
	myPaddle: Paddle;
	type: number;
	ballID: number;
	private randNumber: number = 0;

	constructor(myPaddle: Paddle, x: number, y: number, type: number, ballID: number) {
		this.myPaddle = myPaddle;
		this.type = type;
		this.ballID = ballID;
		this.ball = new Sprite(Texture.from("playerBall"));
		this.ball.position.set(x, y);

		if (type === 2) {
			this.ball.alpha = 0.6;
			this.ball.tint  = gs.BLUE_TINT;
		} else if (type === 3) {
			this.ball.alpha = 0.6;
			this.ball.tint  = gs.RED_TINT;
		}

		gs.camera.addChild(this.ball);
	}

	private ownBricks(brick: Brick): void {
		switch (this.myPaddle.team) {
		case 0:
			brick.brick.texture = Texture.from("brickBlue_owned");
			brick.brick.tint = gs.BLUE_TINT;
			brick.brickType = 1;
			break;
		case 1:
			brick.brick.texture = Texture.from("brickRed_owned");
			brick.brick.tint = gs.RED_TINT;
			brick.brickType = 0;
			break;
		}
	}

	private ownBrick(x: number, y: number): void {
		if (x < 0 || y < 0 || x >= gs.bricksPerLine || y >= 6) return;
		const b = gs.bricks[x + y * gs.bricksPerLine];
		if (b.brickType !== 4) this.ownBricks(b);
	}

	private isExplosiveBrick(x: number, y: number): boolean {
		if (x < 0 || y < 0 || x >= gs.bricksPerLine || y >= 6) return false;
		return gs.bricks[x + y * gs.bricksPerLine].brickType === 3;
	}

	private explode(x: number, y: number): void {
		screenShake(gs.app);
		this.ownBrick(x, y);
		if (this.isExplosiveBrick(x - 1, y)) this.explode(x - 1, y);
		this.ownBrick(x - 1, y);
		if (this.isExplosiveBrick(x + 1, y)) this.explode(x + 1, y);
		this.ownBrick(x + 1, y);
		if (this.isExplosiveBrick(x, y - 1)) this.explode(x, y - 1);
		this.ownBrick(x, y - 1);
		if (this.isExplosiveBrick(x, y + 1)) this.explode(x, y + 1);
		this.ownBrick(x, y + 1);
	}

	private checkOwnColl(brick: Brick): boolean {
		const label = brick.brick.texture.label ?? "";
		switch (this.myPaddle.team) {
			case 0: return label === "brickBlue_owned";
			case 1: return label === "brickRed_owned";
		}
		return false;
	}

	update(deltaTime: number): void {
		this.ball.y += this.bY * deltaTime;
		this.ball.x += this.bX * deltaTime;
		this.centerOfBallX = this.ball.x + this.ball.width  / 2;
		this.centerOfBallY = this.ball.y + this.ball.height / 2;

		// Ball out of bounds - score + destroy
		if (this.ball.y <= -32 || this.ball.y >= gs.HEIGHT) {
			if (this.ball.y <= -32 && this.myPaddle.team === 0) {
				this.myPaddle.score += 20;
				gs.leaderboard.redHealth -= 5;
			} else if (this.ball.y >= gs.HEIGHT && this.myPaddle.team === 1) {
				this.myPaddle.score += 20;
				gs.leaderboard.blueHealth -= 5;
			}
			this.myPaddle.myBalls[this.ballID].ball.destroy();
			if (this.myPaddle.multiballs > 0) this.myPaddle.multiballs--;
			else this.myPaddle.genNewBall();
			return;
		}

		// Wall bounce
		const nextX = this.ball.x + this.bX * deltaTime;
		if (nextX <= 30 || nextX >= gs.MAP_WIDTH - (30 + this.ball.width)) this.bX *= -1;

		// Paddle collision
		if (isCollide(this.ball, this.bX * deltaTime, this.bY * deltaTime, this.myPaddle.paddle)) {
			let hit = (this.centerOfBallX - this.myPaddle.paddle.x - this.myPaddle.paddle.width / 2) / (this.myPaddle.paddle.width / 2);
			hit = Math.max(-1, Math.min(1, hit));
			if (hit > 0.45 && hit < 0.5)  hit -= 0.05;
			if (hit >= 0.5 && hit < 0.55) hit += 0.05;
			if (this.myPaddle.type === 0) this.lastHitUser = true;
			if (this.ball.y + this.ball.height + this.bY * deltaTime > this.myPaddle.paddle.y) this.bY *= -1;
			this.bX += this.maxBXChange * hit;
		}

		// Brick collisions
		for (let i = 0; i < gs.bricks.length; i++) {
			const b   = gs.bricks[i] as Brick;
			const aX  = this.bX * deltaTime;
			const aY  = this.bY * deltaTime;

			switch (b.brickType) {
				case 0: case 1: {
					if (isCollide(this.ball, aX, aY, b.brick) && !this.checkOwnColl(b)) {
						this.myPaddle.score += 5;
						this.bounceOff(b, aX, aY);
						const label = b.brick.texture.label ?? "";
						if (!this.napalmEffect) {
							if (label === "brickT3") {
								b.brick.texture = Texture.from("brickT2");
							} else if (label === "brickT2") {
								b.brick.texture = Texture.from("brickT1");
							} else {
								this.myPaddle.score += 5;
								this.ownBricks(b);
							}
						} else {
							this.ownBricks(b);
							this.napalmEffect = false;
						}
					}
				break;
				}
				case 2: // mystery
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						this.randNumber = Math.floor(Math.random() * 6);
						const mysteryMap: [string, number][] = [
						["napalmBrick",    5],
						["multiballBrick", 6],
						["turboBrick",     7],
						["slowmoBrick",    8],
						["inversionBrick", 9],
						["shrinkrayBrick", 10],
						];
						const [tex, type] = mysteryMap[this.randNumber];
						b.brick.texture   = Texture.from(tex);
						b.brickType       = type;
					}
				break;
				case 3: // dynamite
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						this.explode(b.relX, b.relY);
					}
				break;
				case 4: // indestructible
					if (isCollide(this.ball, aX, aY, b.brick)) this.bounceOff(b, aX, aY);
				break;
				case 5: // napalm
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						this.napalmEffect = true;
						this.ownBricks(b);
					}
				break;
				case 6: // multiball
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						this.myPaddle.genNewBall();
						this.myPaddle.multiballs++;
						this.ownBricks(b);
					}
				break;
				case 7: // turbo
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						this.bX += this.bX > 0 ? 2.5 : -2.5;
						this.bY += 2.5;
						this.ownBricks(b);
					}
				break;
				case 8: // slowmo
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						this.myPaddle.pSpeed *= 0.6;
						this.ownBricks(b);
					}
				break;
				case 9: // inversion
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						if (this.lastHitUser) gs.inversionEffect = !gs.inversionEffect;
						this.ownBricks(b);
					}
				break;
				case 10: // shrinkray
					if (isCollide(this.ball, aX, aY, b.brick)) {
						this.bounceOff(b, aX, aY);
						this.myPaddle.paddle.scale.x = 0.75;
						this.ownBricks(b);
					}
				break;
			}
		}
	}

	// Extracted repeated bounce direction logic
	private bounceOff(b: Brick, aX: number, aY: number): void {
		if (this.ball.y + aY <= b.brick.y || this.ball.y - aY >= b.brick.y + b.brick.height) {
			this.bY *= -1;
		} else if (this.ball.x + aX <= b.brick.x || this.ball.x - aX >= b.brick.x + b.brick.width) {
			this.bX *= -1;
		}
	}
	}

	// Shared AABB collision — same logic as original isCollide() in main.js
	function isCollide(a: Sprite, aX: number, aY: number, b: Sprite): boolean {
		try {
			return !(
			(a.y + a.height + aY) < b.y ||
			(a.y + aY)             > b.y + b.height ||
			(a.x + a.width  + aX) < b.x ||
			(a.x + aX)             > b.x + b.width
			);
		} catch {
			return false;
		}
}
