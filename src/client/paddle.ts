import { Sprite, Texture, Text, TextStyle } from "pixi.js";
import { gs } from "./state";
import { Ball } from "./ball";

export class Paddle {
	// Types: 0=player, 1=teammate, 2=enemy
	paddle: Sprite;
	pSpeed: number = 14.16;
	myBalls: Ball[] = [];
	ballID: number = 0;
	type: number;
	bot: boolean;
	multiballs: number = 0;
	team: number = 0; // 0 = blue (bottom), 1 = red (top)
	score: number = 0;
	username: string;
	myTint: number;
	primaryBall!: Ball;

	private usernameText: Text;

	constructor(x: number, type: number, bot: boolean, username: string) {
		this.type = type;
		this.bot = bot;
		this.username = username;
		this.myTint = gs.BLUE_TINT;

		this.paddle = new Sprite(Texture.from("defaultPaddle"));

		if (type !== 2) this.paddle.position.set(x, gs.HEIGHT - 85);
		else this.paddle.position.set(x, 53);

		// Username label
		const style = new TextStyle({
			fontFamily: "Open Sans",
			fontSize: 24,
			fill: "#ffffff",
			stroke: { color: "#000000", width: 4 },
		});
		this.usernameText = new Text({ text: username, style });
		this.usernameText.y = this.paddle.y + 46;
		gs.camera.addChild(this.usernameText);

		if (type === 2) {
			this.paddle.anchor.y = 1;
			this.paddle.scale.y = -1;
			this.usernameText.y = this.paddle.y - 46;
			this.team = 1;
			this.myTint = gs.RED_TINT;
		}
		gs.camera.addChild(this.paddle);

		// Spawn starting ball
		if (type === 0) {
			this.primaryBall = new Ball(this, x + this.paddle.width / 2, (gs.HEIGHT - 85) - 200, 0, this.ballID);
			this.myBalls.push(this.primaryBall);
			this.ballID++;
		} else if (type === 1) {
			this.paddle.alpha = 0.6;
			this.primaryBall  = new Ball(this, x + this.paddle.width / 2, (gs.HEIGHT - 85) - 200, 2, this.ballID);
			this.myBalls.push(this.primaryBall);
			this.ballID++;
		} else if (type === 2) {
			this.paddle.alpha = 0.6;
			this.primaryBall  = new Ball(this, x + this.paddle.width / 2, 53 + 200, 3, this.ballID);
			this.myBalls.push(this.primaryBall);
			this.ballID++;
		}
	}

	update(deltaTime: number): void {
		// Update all balls
		for (let i = 0; i < this.myBalls.length; i++) {
			try {
				this.myBalls[i].update(deltaTime);
			} catch {
				continue;
			}
		}

		// Move paddle
		if (this.type === 0) {
			// Player-controlled with optional inversion effect
			if (gs.inversionEffect) {
				if (gs.rightPressed && this.paddle.x > 34) this.paddle.x -= this.pSpeed * deltaTime;
				if (gs.leftPressed  && this.paddle.x < gs.MAP_WIDTH - (this.paddle.width + 34)) this.paddle.x += this.pSpeed * deltaTime;
			} else {
				if (gs.rightPressed && this.paddle.x < gs.MAP_WIDTH - (this.paddle.width + 34)) this.paddle.x += this.pSpeed * deltaTime;
				if (gs.leftPressed  && this.paddle.x > 34) this.paddle.x -= this.pSpeed * deltaTime;
			}
		} else if (this.bot) {
			// Simple AI: follow the first valid ball
			const centerOfPaddle = this.paddle.x + this.paddle.width / 2;
			let mainBallIndex = 0;
			for (let i = 0; i < this.myBalls.length; i++) {
				if (this.myBalls[i] !== undefined) { mainBallIndex = i; break; }
			}
			try {
				const ballX = this.myBalls[mainBallIndex].ball.x;
				if (ballX < centerOfPaddle - 20) this.paddle.x -= this.pSpeed * deltaTime;
				else if (ballX > centerOfPaddle + 20) this.paddle.x += this.pSpeed * deltaTime;
			} catch { 
				/* ball may be undefined */ 
			}
		}

		// Keep username label centred on paddle
		this.usernameText.x = this.paddle.x + this.paddle.width / 2 - this.usernameText.width / 2;
	}

	genNewBall(): void {
		const spawnX = this.paddle.x + 5 + Math.random() * (this.paddle.width - 10);
		if (this.type === 0) {
			this.primaryBall = new Ball(this, spawnX, (gs.HEIGHT - 85) - 200, 0, this.ballID);
		} else if (this.type === 1) {
			this.primaryBall = new Ball(this, spawnX, (gs.HEIGHT - 85) - 200, 2, this.ballID);
		} else if (this.type === 2) {
			this.primaryBall = new Ball(this, spawnX, 53 + 200, 3, this.ballID);
		}
		this.myBalls.push(this.primaryBall);
		this.ballID++;
	}
}