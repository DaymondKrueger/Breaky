import * as Colyseus from "colyseus.js";
import { GameState } from "../shared/schemas/GameState";
import { initGame } from "./main";
import { loadAssets } from "./assets";
import { loadSounds } from "./audioManager";
import "./styles/main.scss";

const SERVER_URL = process.env.NODE_ENV === "development" ? `ws://${process.env.DEV_SERVER_URL}` : `wss://breakyserver.ultraboodog.com`;
const client = new Colyseus.Client(SERVER_URL);

// Start loading assets/sounds immediately so they're cached before any room join
const assetsReady = loadAssets();
const soundsReady = loadSounds();

const RECONNECT_KEY = "breaky_reconnect";

// Helpers
function getUsername(): string {
    const input = document.getElementById("game-username") as HTMLInputElement | null;
    return input?.value || `Guest${Math.floor(Math.random() * 5001)}`;
}

function getPlayerId(): string {
    let playerId = localStorage.getItem("breaky_player_id");
    if (!playerId) {
        playerId = `pid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem("breaky_player_id", playerId);
    }
    return playerId;
}

// Connection status
const connectionStatus = document.getElementById("connection-status")!;

async function preConnect(): Promise<boolean> {
    connectionStatus.textContent = "Connecting...";
    connectionStatus.className = "connecting";
    try {
        await client.getAvailableRooms("game_room");
        connectionStatus.textContent = "Connected";
        connectionStatus.className = "connected";
        return true;
    } catch {
        connectionStatus.textContent = "Offline";
        connectionStatus.className = "offline";
        return false;
    }
}

// Room browser
const roomBrowser = document.getElementById("room-browser")!;
const roomList = document.getElementById("room-list")!;
const roomBrowserBack = document.getElementById("room-browser-back")!;
const roomBrowserRefresh = document.getElementById("room-browser-refresh")!;
const roomBrowserEmpty = document.getElementById("room-browser-empty")!;

async function fetchAndDisplayRooms(): Promise<void> {
    roomList.innerHTML = "";
    roomBrowserEmpty.style.display = "none";

    try {
        const rooms = await client.getAvailableRooms("game_room");

        // Filter to lobby-phase rooms only for "Join Room"
        const lobbyRooms = rooms.filter(r => r.metadata?.phase === "lobby");

        if (lobbyRooms.length === 0) {
            roomBrowserEmpty.style.display = "block";
            return;
        }

        for (const room of lobbyRooms) {
            const row = document.createElement("div");
            row.className = "room-row";

            const info = document.createElement("div");
            info.className = "room-info";

            const hostLabel = room.metadata?.hostName || "Unknown";
            const playerCount = room.metadata?.playerCount ?? room.clients;
            const maxPlayers = room.metadata?.maxPlayers ?? 10;

            info.innerHTML = `
                <span class="room-host">${hostLabel}'s Room</span>
                <span class="room-players">${playerCount}/${maxPlayers} players</span>
            `;

            const joinBtn = document.createElement("button");
            joinBtn.className = "room-join-btn";
            joinBtn.textContent = "Join";
            joinBtn.addEventListener("click", () => joinRoomById(room.roomId));

            row.appendChild(info);
            row.appendChild(joinBtn);
            roomList.appendChild(row);
        }
    } catch {
        roomBrowserEmpty.textContent = "Failed to fetch rooms.";
        roomBrowserEmpty.style.display = "block";
    }
}

// Join/create logic
const menuContent = document.getElementById("menu-content")!;

async function enterRoom(roomPromise: Promise<Colyseus.Room<GameState>>): Promise<void> {
    menuContent.style.opacity = "0";
    const hideTimer = setTimeout(() => (menuContent.style.display = "none"), 400);

    let room: Colyseus.Room<GameState> | undefined;
    try {
        await assetsReady; // ensure textures are cached before entering the game
        await soundsReady; // ensure sounds are cached before entering the game
        room = await roomPromise;
        console.log("Joined room:", room.id);
        await initGame(room);
        setupDisconnectHandler(room);
    } catch (e) {
        if (room) { try { room.leave(); } catch (_) { window.location.reload(); return; } }
        menuContent.style.display = "flex";
        menuContent.style.opacity = "1";
        clearTimeout(hideTimer);
        const message = e instanceof Error ? e.message : String(e);
        alert(message);
    }
}

// "Play Game" joins any available room (playing or lobby) or creates a new one
async function playGame(): Promise<void> {
    const username = getUsername();
    const playerId = getPlayerId();

    try {
        // Try to join any available (unlocked) room first
        const rooms = await client.getAvailableRooms("game_room");
        // Prefer playing rooms then lobby rooms
        const playingRoom = rooms.find(r => r.metadata?.phase === "playing");
        const lobbyRoom = rooms.find(r => r.metadata?.phase === "lobby");
        const target = playingRoom || lobbyRoom;

        if (target) {
            await enterRoom(client.joinById<GameState>(target.roomId, { name: username, playerId }));
        } else {
            // No rooms available, create a fresh one
            await enterRoom(client.create<GameState>("game_room", { name: username, playerId }));
        }
    } catch (e) {
        // Fallback: if listing fails, try joinOrCreate
        await enterRoom(client.joinOrCreate<GameState>("game_room", { name: username, playerId }));
    }
}

// "Create Room" creates a new room, player is host
async function createRoom(): Promise<void> {
    const username = getUsername();
    const playerId = getPlayerId();
    await enterRoom(client.create<GameState>("game_room", { name: username, playerId, isCreator: true }));
}

// "Join Room" by specific room ID (from the browser list)
async function joinRoomById(roomId: string): Promise<void> {
    roomBrowser.style.display = "none";
    const username = getUsername();
    const playerId = getPlayerId();
    await enterRoom(client.joinById<GameState>(roomId, { name: username, playerId }));
}

// Reconnect
async function attemptReconnect(): Promise<boolean> {
	const token = sessionStorage.getItem(RECONNECT_KEY);
	if (!token) return false;
 
	sessionStorage.removeItem(RECONNECT_KEY);
	try {
		await assetsReady; // ensure textures are cached before entering the game
        await soundsReady; // ensure sounds are cached before entering the game
		const room = await client.reconnect<GameState>(token);
		console.log("Reconnected to room:", room.id);
		const mainMenu = document.getElementById("main-menu")!;
		mainMenu.style.display = "none";
		await initGame(room);
		setupDisconnectHandler(room);
		return true;
	} catch (err) {
		console.warn("Reconnection failed:", err);
		return false;
	}
}
 
function setupDisconnectHandler(room: Colyseus.Room<GameState>): void {
    window.addEventListener("beforeunload", () => {
		room.leave(true);
	});
    
	room.onLeave((code: number) => {
		if (code > 1000 && room.reconnectionToken) {
			sessionStorage.setItem(RECONNECT_KEY, room.reconnectionToken);
			window.location.reload();
		}
	});
}

// Init
attemptReconnect().then(async (reconnected) => {
	if (reconnected) return;

    // Pre-connect to server on menu load
    await preConnect();

    // Play Game, join any ongoing or lobby room
    document.getElementById("play-game")!.addEventListener("click", () => playGame());

    // Create Room, make a new room as host
    document.getElementById("create-room")!.addEventListener("click", () => createRoom());

    // Join Room, open the room browser
    document.getElementById("join-room")!.addEventListener("click", async () => {
        menuContent.style.opacity = "0";
        setTimeout(() => (menuContent.style.display = "none"), 400);
        roomBrowser.style.display = "flex";
        roomBrowser.style.opacity = "1";
        await fetchAndDisplayRooms();
    });

    // Room browser: back button
    roomBrowserBack.addEventListener("click", () => {
        roomBrowser.style.opacity = "0";
        setTimeout(() => (roomBrowser.style.display = "none"), 400);
        menuContent.style.display = "flex";
        menuContent.style.opacity = "1";
    });

    // Room browser: refresh button
    roomBrowserRefresh.addEventListener("click", () => fetchAndDisplayRooms());
});
