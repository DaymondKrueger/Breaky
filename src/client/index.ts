import * as Colyseus from "colyseus.js";
import { GameState } from "../shared/schemas/GameState";
import { initGame } from "./main";
import "./styles/main.scss";

const SERVER_URL = process.env.NODE_ENV === "production" ? `wss://${window.location.host}` : "ws://localhost:3000";
const client = new Colyseus.Client(SERVER_URL);

document.getElementById("play-game")!.addEventListener("click", async () => {
	// Fade out menu
	const mainMenu = document.getElementById("main-menu")!;
	mainMenu.style.opacity    = "0";
	mainMenu.style.transition = "opacity 0.4s ease";
	setTimeout(() => (mainMenu.style.display = "none"), 400);

	// Connect to Colyseus room
	const room = await client.joinOrCreate<GameState>("game_room", {
		name: `Player_${Math.floor(Math.random() * 1000)}`,
	});
	console.log("Joined room:", room.id);

	// Boot the Pixi game — creates the Application, loads assets, starts loop
	await initGame();

	// Sync other players via Colyseus state (extend as your server-side GameState grows)
	room.state.players.onAdd((_player: any, sessionId: string) => {
		console.log("Player joined:", sessionId);
	});
	room.state.players.onRemove((_player: any, sessionId: string) => {
		console.log("Player left:", sessionId);
	});
});

