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
interface InputMessage { left: boolean; right: boolean; }

export class GameRoom extends Room<GameState> {
	maxClients = 10;

	private TICK_RATE = 60;
	private inputs = new Map<string, InputMessage>();

	private brickManager!: BrickManager;
	private ballManager!: BallManager;
	private paddleManager = new PaddleManager();
	private botManager!: BotManager;

	private countdownTimer: any = null;

	onCreate(_options: any) {
		this.setState(new GameState());

		this.brickManager = new BrickManager(this.state);
		this.ballManager = new BallManager(this.state, this.brickManager);
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

		this.setSimulationInterval((dt) => this.update(dt), 1000 / this.TICK_RATE);
		console.log(`[GameRoom] Room ${this.roomId} created.`);
	}

	onJoin(client: Client, options: JoinOptions) {
		if (this.state.phase !== "lobby") {
			throw new Error("Game already in progress. Join a new room.");
		}

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
		this.inputs.set(client.sessionId, { left: false, right: false });

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
			const input = this.inputs.get(sessionId) ?? { left: false, right: false };
			this.paddleManager.updatePaddle(paddle, input, dt);
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
