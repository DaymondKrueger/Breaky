import { Room, Client } from "colyseus";
import { GameState, PaddleSchema } from "../../shared/schemas/GameState";
import { BrickManager } from "../game/BrickManager";
import { BallManager }  from "../game/BallManager";
import { PaddleManager } from "../game/PaddleManager";
import { BotManager }   from "../game/BotManager";
import * as C from "../../shared/constants";

const MIN_PLAYERS = 1;
const COUNTDOWN_SECONDS = 5;
const RECONNECT_TIMEOUT = 15;

interface JoinOptions { name?: string; playerId?: string; isCreator?: boolean; }
interface InputMessage { left: boolean; right: boolean; releaseBall: boolean; }

export class GameRoom extends Room<GameState> {
	maxClients = 10;

    private clockTicker: any = null;

	private TICK_RATE = 60;
    private inputs = new Map<string, InputMessage>();
	private releaseBall = new Map<string, boolean>();
    private paddleDir = new Map<string, number>(); // -1, 0, 1
    private paddleSimVel = new Map<string, number>(); // server-side simulated velocity for human paddles
    private paddleTravel = new Map<string, { distance: number; lastX: number; windowStart: number }>();

	private brickManager!: BrickManager;
	private ballManager!: BallManager;
	private paddleManager!: PaddleManager;
	private botManager!: BotManager;

	private countdownTimer: any = null;
	private rematchVotes = new Set<string>();

	// Maps sessionId to playerId for host tracking
	private sessionToPlayerId = new Map<string, string>();

	onCreate(_options: any) {
		this.setState(new GameState());
        this.setPatchRate(1000 / 20); // match simulation rate

		this.brickManager = new BrickManager(this.state);
		this.ballManager = new BallManager(this.state, this.brickManager);
		this.paddleManager = new PaddleManager();
		this.botManager = new BotManager(this.state, this.inputs);

        this.onMessage<{ x: number; d: number; v: number; f: number }>("input", (client, data) => {
            if (this.state.phase !== "playing") return;

            const paddle = this.state.paddles.get(client.sessionId);
            if (!paddle) return;

            // Validate client position
            const paddleW = C.PADDLE_WIDTH * paddle.scaleX;
            const minX = 34;
            const maxX = C.MAP_WIDTH - paddleW - 34;
            paddle.x = Math.max(minX, Math.min(maxX, data.x));

            // Accumulate travel distance for speed-hack detection
            const travel = this.paddleTravel.get(client.sessionId);
            if (travel) {
                travel.distance += Math.abs(paddle.x - travel.lastX);
                travel.lastX = paddle.x;

                const elapsed = (this.clock.currentTime - travel.windowStart) / 1000;
                if (elapsed >= 1) {
                    // Over the last second, how far could they have legally moved? 1.5x multiplier gives generous slack for timing jitter
                    const maxLegalDistance = paddle.pSpeed * 60 * elapsed * 1.5;
                    if (travel.distance > maxLegalDistance) {
                        // TODO: Flag or kick the player
                        console.warn(`[GameRoom] Speed hack detected for ${client.sessionId}`);
                    }
                    // Reset the window
                    travel.distance = 0;
                    travel.windowStart = this.clock.currentTime;
                }
            }

            // Store direction and velocity for server-side extrapolation between messages
            const d = data.d;
            this.paddleDir.set(client.sessionId, d === -1 ? -1 : d === 1 ? 1 : 0);
            this.paddleSimVel.set(client.sessionId, data.v ?? 0);

            this.releaseBall.set(client.sessionId, (data.f & 1) !== 0);
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

        this.onMessage("ping", (client) => {
			client.send("pong");
		});

		this.setSimulationInterval((dt) => this.update(dt), 1000 / this.TICK_RATE);
		console.log(`[GameRoom] Room ${this.roomId} created.`);
	}

	onJoin(client: Client, options: JoinOptions) {
		if (this.state.phase !== "lobby") {
			throw new Error("Game already in progress. Please join a new room.");
		}

        if (options.playerId == undefined) throw new Error("Missing player ID. Please refresh and try again.");

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
        paddle.playerId = options.playerId!;
		paddle.team = team;
		paddle.x = 200 + Math.random() * (C.MAP_WIDTH - 600);
		paddle.isReady = false;

		this.state.paddles.set(client.sessionId, paddle);
		this.inputs.set(client.sessionId, { left: false, right: false, releaseBall: false });
        this.paddleDir.set(client.sessionId, 0);
        this.paddleSimVel.set(client.sessionId, 0);
        this.releaseBall.set(client.sessionId, false);
        this.paddleTravel.set(client.sessionId, { distance: 0, lastX: paddle.x, windowStart: this.clock.currentTime });
        this.sessionToPlayerId.set(client.sessionId, options.playerId!);
 
		// Assign host if this is the first player, or if they explicitly created the room
		if (this.state.hostPlayerId === "" || options.isCreator) {
			this.state.hostPlayerId = options.playerId!;
			console.log(`[GameRoom] ${paddle.username} is now the host.`);
		}

		console.log(`[GameRoom] ${paddle.username} joined (team ${team}). Player ID of ${options.playerId}`);
	}

	async onLeave(client: Client, consented: boolean) {
		const leavingPaddle = this.state.paddles.get(client.sessionId);
		const leavingTeam = leavingPaddle?.team ?? 0;
		const leavingPlayerId = this.sessionToPlayerId.get(client.sessionId);

        // If the disconnect was unintentional during a game, hold their slot so they can reconnect within RECONNECT_TIMEOUT seconds.
		if (this.state.phase === "playing" && !consented) {
			try {
				console.log(`[GameRoom] ${client.sessionId} disconnected. Waiting ${RECONNECT_TIMEOUT}s for reconnection...`);
				await this.allowReconnection(client, RECONNECT_TIMEOUT);
				// Player reconnected successfully, no cleanup needed
				console.log(`[GameRoom] ${client.sessionId} reconnected.`);
				return;
			} catch {
				// Timed out, player did not reconnect. Fall through to cleanup.
				console.log(`[GameRoom] ${client.sessionId} reconnection timed out.`);
			}
		}

		this.ballManager.removeAllForSession(client.sessionId);
		this.state.paddles.delete(client.sessionId);
		this.inputs.delete(client.sessionId);
        this.paddleDir.delete(client.sessionId);
        this.paddleSimVel.delete(client.sessionId);
        this.releaseBall.delete(client.sessionId);
        this.paddleTravel.delete(client.sessionId);
        this.paddleManager.removeSession(client.sessionId);
		this.sessionToPlayerId.delete(client.sessionId);
 
		// Transfer host if the host left
		if (leavingPlayerId && leavingPlayerId === this.state.hostPlayerId) {
			this.transferHost();
		}

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
 
	// Transfer host to the next real (non-bot) player in the room
	private transferHost(): void {
		let newHostPlayerId = "";
		this.state.paddles.forEach((p, sid) => {
			if (newHostPlayerId !== "") return;
			if (this.botManager.isBot(sid)) return;
			newHostPlayerId = p.playerId;
		});
		this.state.hostPlayerId = newHostPlayerId;
		if (newHostPlayerId) {
			console.log(`[GameRoom] Host transferred to playerId ${newHostPlayerId}.`);
		} else {
			console.log(`[GameRoom] No players left to be host.`);
		}
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
        
        // Remove bots
        this.botManager.removeAllBots();
 
		// Remove all balls and bricks
		this.ballManager.removeAll();
		this.brickManager.clearMap();
 
		// Reset health and timer
		this.state.blueHealth = 100;
		this.state.redHealth = 100;
		this.state.minutes = 5;
		this.state.seconds = 0;
 
		// Reset paddle ready states and reposition
		this.state.paddles.forEach((paddle) => {
			paddle.isReady = false;
			paddle.score = 0;
			paddle.x = 200 + Math.random() * (C.MAP_WIDTH - 600);
			paddle.scaleX = 1;
			paddle.pSpeed = 14.16;
			paddle.inversionEffect = false;
			paddle.multiballs = 0;
			paddle.slowmoTimer = 0;
			paddle.inversionTimer = 0;
			paddle.shrinkrayTimer = 0;
		});
 
		this.clockTicker?.clear();
		this.clockTicker = null;
        
		this.state.phase = "lobby";
		this.state.gameOverReason = "";
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
		this.clockTicker = this.clock.setInterval(() => this.tickPerSecond(), 1000);
	}

	// Simulation
	private update(deltaTime: number): void {
		if (this.state.phase !== "playing") return;
		const dt = deltaTime / (1000 / this.TICK_RATE);

		this.botManager.updateBotInputs();

		this.state.paddles.forEach((paddle, sessionId) => {
            if (this.botManager.isBot(sessionId)) {
                // Bots use velocity-based directional input via PaddleManager
                const input = this.inputs.get(sessionId) ?? { left: false, right: false, releaseBall: false };
                this.paddleManager.updatePaddle(paddle, sessionId, input, dt);
            } else {
                // Human paddles: run the same accel/decel curve as the client
                // (direction from client is already post-inversion)
                const dir = this.paddleDir.get(sessionId) ?? 0;
                let vel = this.paddleSimVel.get(sessionId) ?? 0;

                if (dir !== 0) {
                    vel += (dir * paddle.pSpeed - vel) * C.PADDLE_ACCEL * dt;
                } else {
                    vel *= Math.pow(1 - C.PADDLE_DECEL, dt);
                    if (Math.abs(vel) < 0.01) vel = 0;
                }

                const paddleW = C.PADDLE_WIDTH * paddle.scaleX;
                const minX = 34;
                const maxX = C.MAP_WIDTH - paddleW - 34;
                paddle.x = Math.max(minX, Math.min(maxX, paddle.x + vel * dt));

                if ((vel > 0 && paddle.x >= maxX) || (vel < 0 && paddle.x <= 34)) {
                    vel = 0;
                }

                this.paddleSimVel.set(sessionId, vel);
            }
        });

        // Release any balls for players pressing space
        this.state.paddles.forEach((_paddle, sessionId) => {
            const wantsRelease = this.botManager.isBot(sessionId)
                ? this.inputs.get(sessionId)?.releaseBall
                : this.releaseBall.get(sessionId);
            if (wantsRelease && this.ballManager.hasUnreleasedBall(sessionId)) {
                this.ballManager.releaseBall(sessionId);
            }
        });

        let shakeNeeded = false;
		// updateAll returns ball IDs that left the field this tick.
		const destroyed = this.ballManager.updateAll(dt, () => { shakeNeeded = true; }, (hitSide, contactX, contactY) => {
			this.broadcast("brickHit", { s: hitSide, x: contactX, y: contactY });
		});
		if (shakeNeeded) this.broadcast("shake");

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

	private tickTimedAbilities(): void {
		this.state.paddles.forEach((paddle) => {
			// SLOWMO
			if (paddle.slowmoTimer > 0) {
				paddle.slowmoTimer = Math.max(0, paddle.slowmoTimer - 1);
				if (paddle.slowmoTimer === 0) {
					paddle.pSpeed = 14.16; // restore default speed
				}
			}
			// INVERSION
			if (paddle.inversionTimer > 0) {
				paddle.inversionTimer = Math.max(0, paddle.inversionTimer - 1);
				if (paddle.inversionTimer === 0) {
					paddle.inversionEffect = false;
				}
			}
			// SHRINKRAY
			if (paddle.shrinkrayTimer > 0) {
				paddle.shrinkrayTimer = Math.max(0, paddle.shrinkrayTimer - 1);
				if (paddle.shrinkrayTimer === 0) {
					paddle.scaleX = 1; // restore default scale
				}
			}
		});
	}

	private tickPerSecond(): void {
		if (this.state.phase !== "playing") return;
		this.tickTimedAbilities();
		if (this.state.seconds <= 0 && this.state.minutes > 0) {
			this.state.minutes--;
			this.state.seconds = 59;
		} else if (this.state.seconds <= 0 && this.state.minutes === 0) {
			this.state.gameOverReason = "time";
			this.state.phase = "gameover";
			console.log(`[GameRoom] Game over in room ${this.roomId}.`);
		} else {
			this.state.seconds--;
		}
	}
}
