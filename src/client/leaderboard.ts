import { Sprite, Text, TextStyle, Texture } from "pixi.js";
import { gs } from "./state";
import type { GameState } from "../shared/schemas/GameState";

export class Leaderboard {
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
		this.addText(true, "100%", 182, 56, 12, 1, 0xFFFFFF);
		this.addText(false, "RED TEAM", 28, 94, 12, 0, 0xFFFFFF);
		this.addText(true, "100%", 182, 94, 12, 1, 0xFFFFFF);
		this.addText(true, "5:00", 186, 202, 16, 1, 0xFFFFFF);

		// Leaderboard rows
		this.addText(true, "1st", 28, 128, 12, 0, gs.BLUE_TINT);
		this.addText(true, "0", 182, 128, 12, 1, gs.BLUE_TINT);
		this.addText(true, "2nd", 28, 144, 12, 0, gs.RED_TINT);
		this.addText(true, "0", 182, 144, 12, 1, gs.RED_TINT);
		this.addText(true, "3rd", 28, 160, 12, 0, gs.BLUE_TINT);
		this.addText(true, "0", 182, 160, 12, 1, gs.BLUE_TINT);
		this.addText(true, "4th", 28, 176, 12, 0, gs.RED_TINT);
		this.addText(true, "0", 182, 176, 12, 1, gs.RED_TINT);

		// Health bars
		this.addLeaderboardImage("healthBar", 29,  74, gs.BLUE_TINT);
		this.addLeaderboardImage("healthBar", 29, 112, gs.RED_TINT);
	}

	// Called by main.ts whenever relevant server state changes
	updateFromState(state: GameState): void {
		// Health bars
		this.leaderboardImages[0].scale.x = state.blueHealth / 100;
		this.dynamicTexts[0].text = `${state.blueHealth}%`;
		this.leaderboardImages[1].scale.x = state.redHealth / 100;
		this.dynamicTexts[1].text = `${state.redHealth}%`;

		// Timer
		this.dynamicTexts[2].text = `${state.minutes}:${String(state.seconds).padStart(2, "0")}`;

		// Sort paddles by score and display top 4
		const sorted: { username: string; score: number; myTint: number }[] = [];
		state.paddles.forEach((paddle) => {
			sorted.push({
				username: paddle.username,
				score: paddle.score,
				myTint: paddle.team === 0 ? gs.BLUE_TINT : gs.RED_TINT,
			});
		});
		sorted.sort((a, b) => b.score - a.score);

		const labels = ["1st", "2nd", "3rd", "4th"];
		for (let i = 0; i < 4; i++) {
			const p = sorted[i];
			if (p) {
				this.dynamicTexts[3 + i * 2].text = `${labels[i]} ${p.username}`;
				this.dynamicTexts[3 + i * 2 + 1].text = String(p.score);
				(this.dynamicTexts[3 + i * 2] as any).style.fill = p.myTint;
				(this.dynamicTexts[3 + i * 2 + 1] as any).style.fill = p.myTint;
			} else {
				this.dynamicTexts[3 + i * 2].text = labels[i];
				this.dynamicTexts[3 + i * 2 + 1].text = "0";
			}
		}
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
}
