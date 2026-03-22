import * as Colyseus from "colyseus.js";
import { GameState } from "../shared/schemas/GameState";
import { initGame } from "./main";
import "./styles/main.scss";

const SERVER_URL = process.env.NODE_ENV === "production" ? `wss://${window.location.host}` : `ws://${process.env.DEV_SERVER_URL}`;
const client = new Colyseus.Client(SERVER_URL);

const RECONNECT_KEY = "breaky_reconnect";

// TODO: Test this more, and how it works when triggered. Does all current states come back to the user?
async function attemptReconnect(): Promise<boolean> {
	const token = sessionStorage.getItem(RECONNECT_KEY);
	if (!token) return false;
 
	sessionStorage.removeItem(RECONNECT_KEY);
	try {
		const room = await client.reconnect<GameState>(token);
		console.log("Reconnected to room:", room.id);
		// Hide menu since we are going straight into the game
		const mainMenu = document.getElementById("main-menu")!;
		mainMenu.style.display = "none";
		await initGame(room);
		setupDisconnectHandler(room);
		return true;
	} catch (err) {
		// Token expired or room is gone. Fall through to normal menu.
		console.warn("Reconnection failed:", err);
		return false;
	}
}
 
function setupDisconnectHandler(room: Colyseus.Room<GameState>): void {
    window.addEventListener("beforeunload", () => {
		room.leave(true);
	});
    
	room.onLeave((code: number) => {
		// code 1000 = normal close (player intentionally left)... anything else = abnormal (network drop, server restart, etc.)
		if (code > 1000 && room.reconnectionToken) {
			sessionStorage.setItem(RECONNECT_KEY, room.reconnectionToken);
			window.location.reload();
		}
	});
}

attemptReconnect().then((reconnected) => {
    // Already in-game, skip menu setup
	if (reconnected) return;

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
			setupDisconnectHandler(room);
        } catch (e) {
            if (room) { try { room.leave(); } catch (_) { window.location.reload(); return; } }
            menuContent.style.opacity = "1";
            menuContent.style.display = "flex";
            clearTimeout(hideMenuContent);
            // TODO: Show an error message HTML element instead of an alert
            const message = e instanceof Error ? e.message : String(e);
			alert(message);
        }
    });
});
