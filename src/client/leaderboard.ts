import { Sprite, Text, TextStyle, Texture } from "pixi.js";
import { gs } from "./state";

export class Leaderboard {
	redHealth: number = 100;
	blueHealth: number = 100;
	minutes: number = 5;
	seconds: number = 0;

	private mainGraphic: Sprite;
	private dynamicTexts: Text[] = [];
	private leaderboardImages: Sprite[] = [];

	constructor(x: number, y: number) {
		this.mainGraphic = new Sprite(Texture.from("leaderboard_bg"));
		this.mainGraphic.x = x;
		this.mainGraphic.y = y;
		gs.HUD.addChild(this.mainGraphic);

		// Static labels
		this.addText(false, "BLUE TEAM", 28, 56, 12, 0, 0xFFFFFF);
		this.addText(true, "100%", 182,  56, 12, 1, 0xFFFFFF);
		this.addText(false, "RED TEAM", 28, 94, 12, 0, 0xFFFFFF);
		this.addText(true, "100%", 182, 94, 12, 1, 0xFFFFFF);
		this.addText(true, "5:00", 186, 202, 16, 1, 0xFFFFFF);

		// Leaderboard rows
		this.addText(true, "1st", 28, 128, 12, 0, gs.BLUE_TINT);
		this.addText(true, "0",  182, 128, 12, 1, gs.BLUE_TINT);
		this.addText(true, "2nd", 28, 144, 12, 0, gs.RED_TINT);
		this.addText(true, "0",  182, 144, 12, 1, gs.RED_TINT);
		this.addText(true, "3rd", 28, 160, 12, 0, gs.BLUE_TINT);
		this.addText(true, "0",  182, 160, 12, 1, gs.BLUE_TINT);
		this.addText(true, "4th", 28, 176, 12, 0, gs.RED_TINT);
		this.addText(true, "0",  182, 176, 12, 1, gs.RED_TINT);

		// Health bar images
		this.addLeaderboardImage("healthBar", 29, 74, gs.BLUE_TINT);
		this.addLeaderboardImage("healthBar", 29, 112, gs.RED_TINT);
	}

	private addText(isDynamic: boolean, tString: string, x: number, y: number, size: number, tAnchor: number, colour: number): void {
		const style = new TextStyle({
			fontFamily: "Open Sans",
			fontWeight: "bold",
			fontSize: size,
			fill: colour,
		});
		const t = new Text({ text: tString, style });
		t.anchor.set(tAnchor, 0);
		t.x = this.mainGraphic.x + x;
		t.y = this.mainGraphic.y + y;
		if (isDynamic) this.dynamicTexts.push(t);
		gs.HUD.addChild(t);
	}

	private addLeaderboardImage(name: string, x: number, y: number, tint: number): void {
		const img = new Sprite(Texture.from(name));
		img.tint = tint;
		img.x = this.mainGraphic.x + x;
		img.y = this.mainGraphic.y + y;
		this.leaderboardImages.push(img);
		gs.HUD.addChild(img);
	}

	updatePerSecond(): void {
		this.blueHealth = Math.max(0, this.blueHealth);
		this.redHealth = Math.max(0, this.redHealth);

		// Health bars
		this.leaderboardImages[0].scale.x = this.blueHealth / 100;
		this.dynamicTexts[0].text = `${this.blueHealth}%`;
		this.leaderboardImages[1].scale.x = this.redHealth / 100;
		this.dynamicTexts[1].text = `${this.redHealth}%`;

		// Timer countdown
		if (this.seconds <= 0 && this.minutes !== 0) {
			this.minutes--;
			this.seconds = 59;
		} else if (this.seconds <= 0 && this.minutes === 0) {
			console.log("Game over");
		} else {
			this.seconds--;
		}
		this.dynamicTexts[2].text = `${this.minutes}:${String(this.seconds).padStart(2, "0")}`;

		// Sort paddles by score and update rows
		gs.paddles.sort((a, b) => b.score - a.score);
		const labels = ["1st", "2nd", "3rd", "4th"];
		for (let i = 0; i < 4 && i < gs.paddles.length; i++) {
			const p = gs.paddles[i];
			this.dynamicTexts[3 + i * 2].text = `${labels[i]} ${p.username}`;
			this.dynamicTexts[3 + i * 2 + 1].text = String(p.score);
			(this.dynamicTexts[3 + i * 2] as any).style.fill = p.myTint;
			(this.dynamicTexts[3 + i * 2 + 1] as any).style.fill = p.myTint;
		}
	}
}
