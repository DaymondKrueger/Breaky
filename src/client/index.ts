import * as Colyseus from "colyseus.js";
import { GameState } from "../shared/schemas/GameState";
import { initGame } from "./main";
import "./styles/main.scss";

const SERVER_URL = process.env.NODE_ENV === "production" ? `wss://${window.location.host}` : `ws://${process.env.DEV_SERVER_URL}`;
const client = new Colyseus.Client(SERVER_URL);

document.getElementById("play-game")!.addEventListener("click", async () => {
	const menuContent = document.getElementById("menu-content")!;
	menuContent.style.opacity = "0";
	const hideMenuContent = setTimeout(() => (menuContent.style.display = "none"), 400);

	const usernameInput = document.getElementById("game-username") as HTMLInputElement | null;
	const username = usernameInput?.value || `Guest${Math.floor(Math.random() * 5001)}`;

    let playerId = localStorage.getItem("breaky_player_id");
	if (!playerId) {
		playerId = `pid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
		localStorage.setItem("breaky_player_id", playerId);
	}

    let room: Awaited<ReturnType<typeof client.joinOrCreate<GameState>>> | undefined;
    try {
	    room = await client.joinOrCreate<GameState>("game_room", { name: username, playerId: playerId });

        console.log("Joined room:", room.id);

        // Pass room to initGame - all schema listeners are wired there
        await initGame(room);
    } catch (e) {
        if (room) { try { room.leave(); } catch (_) { window.location.reload(); return; } }
        menuContent.style.opacity = "1";
        menuContent.style.display = "flex";
        clearTimeout(hideMenuContent);
        // TODO: Show an error message HTML element instead of an alert
        alert(e);
    }
});
