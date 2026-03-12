import * as Colyseus from "colyseus.js";
import { GameState } from "../shared/schemas/GameState";
import { initGame } from "./main";
import "./styles/main.scss";

const SERVER_URL = process.env.NODE_ENV === "production" ? `wss://${window.location.host}` : "ws://174.2.21.52:3000";
const client = new Colyseus.Client(SERVER_URL);

document.getElementById("play-game")!.addEventListener("click", async () => {
	const mainMenu = document.getElementById("main-menu")!;
	mainMenu.style.opacity = "0";
	mainMenu.style.transition = "opacity 0.4s ease";
	setTimeout(() => (mainMenu.style.display = "none"), 400);

	const usernameInput = document.getElementById("game-username") as HTMLInputElement | null;
	const username = usernameInput?.value || `Guest${Math.floor(Math.random() * 5001)}`;

	const room = await client.joinOrCreate<GameState>("game_room", { name: username });
	console.log("Joined room:", room.id);

	// Pass room to initGame — all schema listeners are wired there
	await initGame(room);
});
