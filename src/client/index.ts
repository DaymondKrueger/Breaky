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
	const hideMainMenu = setTimeout(() => (mainMenu.style.display = "none"), 400);

	const usernameInput = document.getElementById("game-username") as HTMLInputElement | null;
	const username = usernameInput?.value || `Guest${Math.floor(Math.random() * 5001)}`;

    let playerId = localStorage.getItem("breaky_player_id");
	if (!playerId) {
		playerId = `pid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
		localStorage.setItem("breaky_player_id", playerId);
	}

    try {
	    const room = await client.joinOrCreate<GameState>("game_room", { name: username, playerId: playerId });

        console.log("Joined room:", room.id);

        // Pass room to initGame - all schema listeners are wired there
        await initGame(room);
    } catch (e) {
        mainMenu.style.opacity = "1";
        mainMenu.style.display = "block";
        clearTimeout(hideMainMenu);
        // TODO: Show an error message HTML element instead of an alert
        alert(e);
    }
});
