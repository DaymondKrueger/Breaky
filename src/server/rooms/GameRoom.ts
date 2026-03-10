import { Room, Client } from "colyseus";
import { GameState, Player } from "../../shared/schemas/GameState";

interface JoinOptions {
  	name?: string;
}

interface PlayerInput {
	dx: number;
	dy: number;
}

export class GameRoom extends Room<GameState> {
	maxClients = 20;
	TICK_RATE = 60;

	onCreate(_options: JoinOptions) {
		this.setState(new GameState());

		// Handle player input messages
		this.onMessage<PlayerInput>("input", (client, input) => {
		const player = this.state.players.get(client.sessionId);
		if (!player) return;

		player.x += input.dx * player.speed;
		player.y += input.dy * player.speed;
		});

		// Server-side game loop
		this.setSimulationInterval((_deltaTime) => {
			this.update();
		}, 1000 / this.TICK_RATE);

		console.log(`[GameRoom] Room ${this.roomId} created.`);
	}

	onJoin(client: Client, options: JoinOptions) {
		const player = new Player();
		player.x = Math.random() * 800;
		player.y = Math.random() * 600;
		player.name = options.name ?? `Player_${client.sessionId.slice(0, 4)}`;

		this.state.players.set(client.sessionId, player);
		console.log(`[GameRoom] ${player.name} joined (${client.sessionId})`);
	}

	onLeave(client: Client) {
		this.state.players.delete(client.sessionId);
		console.log(`[GameRoom] Client ${client.sessionId} left.`);
	}

	onDispose() {
		console.log(`[GameRoom] Room ${this.roomId} disposed.`);
	}

	private update() {
		// Add server-side game logic here (e.g. collision, pickups, etc.)
	}
}
