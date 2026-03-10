import * as PIXI from "pixi.js";
import * as Colyseus from "colyseus.js";
import { GameState } from "../shared/schemas/GameState";
import "./styles/main.scss";

const SERVER_URL =
  process.env.NODE_ENV === "production"
    ? `wss://${window.location.host}`
    : "ws://localhost:3000";

async function main() {
	// --- Pixi Setup ---
	const app = new PIXI.Application();
	await app.init({
		width: window.innerWidth,
		height: window.innerHeight,
		backgroundColor: 0x1a1a2e,
		resizeTo: window,
	});

	document.getElementById("game-container")!.appendChild(app.canvas);

	// Map of sessionId -> PIXI sprite for each player
	const playerSprites = new Map<string, PIXI.Graphics>();

	function createPlayerSprite(): PIXI.Graphics {
		const g = new PIXI.Graphics();
		g.circle(0, 0, 16).fill({ color: 0x4fc3f7 });
		return g;
	}

	// --- Input Handling ---
	const keys = new Set<string>();
	window.addEventListener("keydown", (e) => keys.add(e.key));
	window.addEventListener("keyup", (e) => keys.delete(e.key));

	// --- Colyseus Setup ---
	const client = new Colyseus.Client(SERVER_URL);

	document.getElementById("play-btn")!.addEventListener("click", async () => {
		// Hide splash, show HUD
		const splash = document.getElementById("splash")!;
		splash.style.opacity = "0";
		splash.style.transition = "opacity 0.4s ease";
		setTimeout(() => (splash.style.display = "none"), 400);
		document.getElementById("ui-overlay")!.classList.remove("hidden");

		const room = await client.joinOrCreate<GameState>("game_room", {
		name: `Player_${Math.floor(Math.random() * 1000)}`,
		});

		console.log("Joined room:", room.id);

		// Sync state: player added
		room.state.players.onAdd((player: any, sessionId: string) => {
		const sprite = createPlayerSprite();
		sprite.x = player.x;
		sprite.y = player.y;
		app.stage.addChild(sprite);
		playerSprites.set(sessionId, sprite);

		player.onChange(() => {
			sprite.x = player.x;
			sprite.y = player.y;
		});
		});

		// Sync state: player removed
		room.state.players.onRemove((_player: any, sessionId: string) => {
		const sprite = playerSprites.get(sessionId);
		if (sprite) {
			app.stage.removeChild(sprite);
			sprite.destroy();
			playerSprites.delete(sessionId);
		}
		});

		// Send input to server on each tick
		app.ticker.add(() => {
			let dx = 0;
			let dy = 0;
			if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
			if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
			if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
			if (keys.has("ArrowDown") || keys.has("s")) dy += 1;

			if (dx !== 0 || dy !== 0) {
				room.send("input", { dx, dy });
			}
		});
	});
}

main().catch(console.error);