import { Room, Client } from "colyseus";
import { GameState, PaddleSchema } from "../../shared/schemas/GameState";
import { BrickManager } from "../game/BrickManager";
import { BallManager }  from "../game/BallManager";
import { PaddleManager } from "../game/PaddleManager";
import { BotManager }   from "../game/BotManager";
import * as C from "../../shared/constants";

const MIN_PLAYERS = 1;
const COUNTDOWN_SECONDS = 5;

interface JoinOptions  { name?: string; playerId?: string; }
interface InputMessage { left: boolean; right: boolean; releaseBall: boolean; }

export class GameRoom extends Room<GameState> {
	maxClients = 10;

	private TICK_RATE = 60;
	private inputs = new Map<string, InputMessage>();

	private brickManager!: BrickManager;
	private ballManager!: BallManager;
	private paddleManager!: PaddleManager;
	private botManager!: BotManager;

	private countdownTimer: any = null;
	private rematchVotes = new Set<string>();

	onCreate(_options: any) {
		this.setState(new GameState());

		this.brickManager = new BrickManager(this.state);
		this.ballManager = new BallManager(this.state, this.brickManager);
		this.paddleManager = new PaddleManager();
		this.botManager = new BotManager(this.state, this.inputs);

		this.onMessage<InputMessage>("input", (client, data) => {
			if (this.state.phase !== "playing") return;
			this.inputs.set(client.sessionId, data);
		});

		this.onMessage("ready", (client) => {
			if (this.state.phase !== "lobby") return;
			const paddle = this.state.paddles.get(client.sessionId);
			if (paddle) paddle.isReady = true;
			this.checkAllReady();
		});

		this.onMessage("unready", (client) => {
			if (this.state.phase !== "lobby") return;
			const paddle = this.state.paddles.get(client.sessionId);
			if (paddle) paddle.isReady = false;
		});
 
		this.onMessage("rematch", (client) => {
			if (this.state.phase !== "gameover") return;
			this.rematchVotes.add(client.sessionId);
			this.state.rematchCount = this.rematchVotes.size;
			this.checkAllRematch();
		});
 
		this.onMessage("unrematch", (client) => {
			if (this.state.phase !== "gameover") return;
			this.rematchVotes.delete(client.sessionId);
			this.state.rematchCount = this.rematchVotes.size;
		});

		this.setSimulationInterval((dt) => this.update(dt), 1000 / this.TICK_RATE);
		console.log(`[GameRoom] Room ${this.roomId} created.`);
	}

	onJoin(client: Client, options: JoinOptions) {
		if (this.state.phase !== "lobby") {
			throw new Error("Game already in progress. Join a new room.");
		}

        if (options.playerId == undefined) throw new Error("Undefined playerId");

        // Reject if this playerId is already in the room
		if (options.playerId) {
			let alreadyPresent = false;
			this.state.paddles.forEach((p) => {
				if (p.playerId === options.playerId) alreadyPresent = true;
			});
			if (alreadyPresent) throw new Error("Already in this room.");
		}

		const teamCount = [0, 0];
		this.state.paddles.forEach((p) => { teamCount[p.team]++; });
		const team = teamCount[0] <= teamCount[1] ? 0 : 1;

		const paddle = new PaddleSchema();
		paddle.username = options.name ?? `Guest_${client.sessionId.slice(0, 4)}`;
		paddle.team = team;
		paddle.x = 200 + Math.random() * (C.MAP_WIDTH - 600);
		paddle.isReady = false;

		this.state.paddles.set(client.sessionId, paddle);
		this.inputs.set(client.sessionId, { left: false, right: false, releaseBall: false });

		console.log(`[GameRoom] ${paddle.username} joined (team ${team}). Player ID of ${options.playerId}`);
	}

	onLeave(client: Client) {
		const leavingPaddle = this.state.paddles.get(client.sessionId);
		const leavingTeam = leavingPaddle?.team ?? 0;

		this.ballManager.removeAllForSession(client.sessionId);
		this.state.paddles.delete(client.sessionId);
		this.inputs.delete(client.sessionId);

		if (this.state.phase === "lobby") {
			// Cancel any countdown that was running - someone left.
			if (this.countdownTimer) this.cancelCountdown();
		} else if (this.state.phase === "playing") {
			// Mid-game: add a bot so that team isn't shorthanded.
			this.botManager.replaceLeavingPlayer(leavingTeam, this.ballManager);
		} else if (this.state.phase === "gameover") {
			// Remove their rematch vote and update count.
			this.rematchVotes.delete(client.sessionId);
			this.state.rematchCount = this.rematchVotes.size;
		}

		console.log(`[GameRoom] ${client.sessionId} left.`);
	}

	onDispose() {
		console.log(`[GameRoom] Room ${this.roomId} disposed.`);
	}

	// Lobby
	private checkAllReady(): void {
		let realCount = 0;
		let allReady = true;

		this.state.paddles.forEach((p, sid) => {
			if (this.botManager.isBot(sid)) return;
			realCount++;
			if (!p.isReady) allReady = false;
		});

		if (realCount >= MIN_PLAYERS && allReady) this.startCountdown();
	}

	private startCountdown(): void {
		this.state.phase = "countdown";
		this.state.countdownSeconds = COUNTDOWN_SECONDS;
		this.lock();

		this.countdownTimer = this.clock.setInterval(() => {
			this.state.countdownSeconds--;
			if (this.state.countdownSeconds <= 0) {
				this.countdownTimer.clear();
				this.countdownTimer = null;
				this.startGame();
			}
		}, 1000);
	}

	private cancelCountdown(): void {
		this.countdownTimer?.clear();
		this.countdownTimer = null;
		this.state.phase = "lobby";
		this.state.countdownSeconds = COUNTDOWN_SECONDS;
		this.state.paddles.forEach((p) => { p.isReady = false; });
		this.unlock();
	}
 
	private checkAllRematch(): void {
		let realCount = 0;
		this.state.paddles.forEach((_p, sid) => {
			if (!this.botManager.isBot(sid)) realCount++;
		});
		if (realCount > 0 && this.rematchVotes.size >= realCount) {
			this.resetGame();
		}
	}
 
	private resetGame(): void {
		// Clear votes
		this.rematchVotes.clear();
		this.state.rematchCount = 0;
 
		// Remove all balls and bricks
		this.ballManager.removeAll();
		this.brickManager.clearMap();
 
		// Reset health and timer
		this.state.blueHealth = 100;
		this.state.redHealth = 100;
		this.state.minutes = 0;
		this.state.seconds = 10;
 
		// Reset paddle ready states and reposition
		this.state.paddles.forEach((paddle) => {
			paddle.isReady = false;
			paddle.score = 0;
			paddle.x = 200 + Math.random() * (C.MAP_WIDTH - 600);
			paddle.scaleX = 1;
			paddle.pSpeed = 14.16;
			paddle.inversionEffect = false;
			paddle.multiballs = 0;
		});
 
		this.state.phase = "lobby";
		this.unlock();
		console.log(`[GameRoom] Rematch! Room ${this.roomId} reset to lobby.`);
	}

	private startGame(): void {
		this.brickManager.spawnMap();
		this.botManager.balanceTeams(this.ballManager);

		this.state.paddles.forEach((paddle, sessionId) => {
			if (!this.botManager.isBot(sessionId)) {
				this.ballManager.spawnBall(sessionId, paddle);
			}
		});

		this.state.phase = "playing";
		this.clock.setInterval(() => this.tickPerSecond(), 1000);
	}

	// Simulation
	private update(deltaTime: number): void {
		if (this.state.phase !== "playing") return;
		const dt = deltaTime / (1000 / this.TICK_RATE);

		this.botManager.updateBotInputs();

		this.state.paddles.forEach((paddle, sessionId) => {
			const input = this.inputs.get(sessionId) ?? { left: false, right: false, releaseBall: false };
			this.paddleManager.updatePaddle(paddle, input, dt);
		});

        // Release any balls for players pressing space
		this.state.paddles.forEach((_paddle, sessionId) => {
			const input = this.inputs.get(sessionId);
			if (input?.releaseBall && this.ballManager.hasUnreleasedBall(sessionId)) {
				this.ballManager.releaseBall(sessionId);
			}
		});

		// updateAll returns ball IDs that left the field this tick.
		const destroyed = this.ballManager.updateAll(dt, () => this.broadcast("shake"));

		for (const ballId of destroyed) {
			const ball = this.state.balls.get(ballId);
			if (!ball) continue;

			const ownerSessionId = ball.ownerSessionId;
			const ownerPaddle = this.state.paddles.get(ownerSessionId);

			this.ballManager.removeBall(ballId);

			if (ownerPaddle) {
				if (ownerPaddle.multiballs > 0) {
					ownerPaddle.multiballs--;
				} else {
					this.ballManager.spawnBall(ownerSessionId, ownerPaddle);
                    if (this.botManager.isBot(ownerSessionId)) this.ballManager.releaseBall(ownerSessionId);
				}
			}
		}
	}

	private tickPerSecond(): void {
		if (this.state.phase !== "playing") return;
		if (this.state.seconds <= 0 && this.state.minutes > 0) {
			this.state.minutes--;
			this.state.seconds = 59;
		} else if (this.state.seconds <= 0 && this.state.minutes === 0) {
			this.state.phase = "gameover";
			console.log(`[GameRoom] Game over in room ${this.roomId}.`);
		} else {
			this.state.seconds--;
		}
	}
}
