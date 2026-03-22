import { Application, Container, Sprite, Text, TextStyle, Texture, Point } from "pixi.js";
import type * as Colyseus from "colyseus.js";
import { gs } from "./state";
import { loadAssets } from "./assets";
import { ClientBrick } from "./brick";
import { ClientBall } from "./ball";
import { ClientPaddle } from "./paddle";
import { Leaderboard } from "./leaderboard";
import type { GameState } from "../shared/schemas/GameState";
import * as C from "../shared/constants";
import { stepBall } from "../shared/physics/ballPhysics";

export function screenShake(app: Application, intensity = 15, duration = 500): void {
	const stage = app.stage;
	const startTime = Date.now();
	const shake = () => {
		const elapsed = Date.now() - startTime;
		if (elapsed >= duration) {
			stage.x = 0;
			stage.y = 0;
			app.ticker.remove(shake);
			return;
		}
		const decay = 1 - elapsed / duration;
		stage.x = (Math.random() - 0.5) * intensity * 2 * decay;
		stage.y = (Math.random() - 0.5) * intensity * 2 * decay;
	};
	app.ticker.add(shake);
}

function resize(app: Application): void {
    const scaleY = window.innerHeight / gs.HEIGHT;
    const visibleWidth = window.innerWidth / scaleY;
    
    // Resize the actual PIXI renderer to the new logical size
    app.renderer.resize(visibleWidth, gs.HEIGHT);
    
    // Scale the canvas element to fill the screen
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.transform = "none";
}

function cullOffScreen(camera: Container, viewW: number): void {
	const pivotX = camera.pivot.x;
	const leftEdge = pivotX - 512;
	const rightEdge = pivotX + viewW;
 
	for (const child of camera.children) {
		if (child.label === "noCull") continue;
		const cx = (child as any).x ?? 0;
		child.renderable = cx >= leftEdge && cx <= rightEdge;
	}
}

function initMapVisuals(isFlipped: boolean): void {
	const { WIDTH, HEIGHT, MAP_WIDTH } = gs;
	const num = Math.ceil((HEIGHT - 112) / 64);
	const bgH = Math.round((HEIGHT - 112) / num);
	for (let y = 0; y < Math.ceil((HEIGHT - 112) / 64); y++) {
		for (let x = 0; x < Math.ceil(MAP_WIDTH / bgH); x++) {
			const bg = new Sprite(Texture.from("bgPattern"));
			bg.height = bgH; bg.width = bgH;
			bg.position.set(x * bgH, 56 + y * bgH);
			if (isFlipped) { bg.scale.y = -1; bg.anchor.y = 1; }
			gs.camera.addChild(bg);
		}
	}
	for (let i = 0; i < Math.ceil(MAP_WIDTH / 512); i++) {
		const rg = new Sprite(Texture.from("redGoal"));
		rg.position.set(i * 512, 0);
		gs.camera.addChild(rg);
		const bg = new Sprite(Texture.from("blueGoal"));
		bg.position.set(i * 512, HEIGHT - 56);
		gs.camera.addChild(bg);
	}
	for (let i = 0; i < 7; i++) {
		const wl = new Sprite(Texture.from("wallSegment"));
		wl.scale.x = -1; wl.anchor.set(1, 0);
		wl.height = Math.round(HEIGHT / 7);
		wl.position.set(0, i * wl.height);
		gs.camera.addChild(wl);
		const wr = new Sprite(Texture.from("wallSegment"));
		wr.height = Math.round(HEIGHT / 7);
		wr.position.set(MAP_WIDTH - 30, i * wr.height);
		gs.camera.addChild(wr);
	}
	for (let i = 0; i < Math.round((MAP_WIDTH - 60) / 32); i++) {
		const hl = new Sprite(Texture.from("halfLineMid"));
		hl.position.set(30 + i * 32, HEIGHT / 2 - hl.height / 2);
		if (isFlipped) { hl.scale.y = -1; hl.anchor.y = 1; }
		gs.camera.addChild(hl);
	}
}

const gameContainer = document.getElementById("game-container")!;

export async function initGame(room: Colyseus.Room<GameState>): Promise<void> {
	const app = new Application();
	await app.init({
		width: gs.WIDTH,
		height: gs.HEIGHT,
		backgroundAlpha: 0,
		antialias: false,
		resolution: window.devicePixelRatio,
	});
	gs.app = app;
	gameContainer.prepend(app.canvas as HTMLCanvasElement);

	gs.camera = new Container();
	gs.HUD = new Container();
	app.stage.addChild(gs.camera);
	app.stage.addChild(gs.HUD);
	gs.camera.interactiveChildren = false;
	gs.HUD.interactiveChildren = false;

	await loadAssets();
    
	const localPaddleSchema = room.state.paddles.get(room.sessionId);
	if (localPaddleSchema?.team === 1) {
		gs.isFlipped = true;
		gs.camera.scale.y = -1;
		gs.camera.pivot.y = gs.HEIGHT / 2;
		gs.camera.y = gs.HEIGHT / 2;
	}

	initMapVisuals(gs.isFlipped);

	gs.leaderboard = new Leaderboard();

	const ua = navigator.userAgent.toLowerCase();
	const isMobile = ua.includes("mobile") || ua.includes("android");
	if (isMobile) {
		const lArrow = new Sprite(Texture.from("mobileArrow"));
		lArrow.scale.x = -1; lArrow.anchor.set(1, 0);
		lArrow.x = 30; lArrow.y = gs.HEIGHT / 2 - lArrow.height / 2;
		gs.HUD.addChild(lArrow);
		const rArrow = new Sprite(Texture.from("mobileArrow"));
        rArrow.anchor.set(1, 0);
        rArrow.x = app.renderer.width - 30;
        rArrow.y = app.renderer.height / 2 - rArrow.height / 2;
		gs.HUD.addChild(rArrow);
	}

	// HTML elements
	const mainMenu = document.getElementById("main-menu")!;
	const lobbyContent = document.getElementById("lobby-content")!;
	const lobbyPlayerList = document.getElementById("lobby-player-list")!;
	const readyBtn = document.getElementById("ready-btn")!;
	const countdownEl = document.getElementById("lobby-countdown")!;
	const gameOver = document.getElementById("game-over")!;
	const gameOverTitle = document.getElementById("game-over-title")!;
	const gameOverReason = document.getElementById("game-over-reason")!;
	const rematchBtn = document.getElementById("rematch-btn")!;
	const rematchStatus = document.getElementById("rematch-status")!;
    const hudPing = document.getElementById("hud-ping")!;
    const hudPowerups = document.getElementById("hud-powerups")!;

    type TimedAbility = "slowmo" | "inversion" | "shrinkray";
    const ABILITY_IMAGES: Record<TimedAbility, string> = {
        slowmo: "res/bricks/ability_slowmo.png",
        inversion: "res/bricks/ability_inversion.png",
        shrinkray: "res/bricks/ability_shrink.png",
    };

    function formatTimer(seconds: number): string {
        const s = Math.max(0, Math.ceil(seconds));
        return `0:${s.toString().padStart(2, "0")}`;
    }

    // Tracks live timer values so we can refresh the HUD
    const abilityTimers: Record<TimedAbility, number> = { slowmo: 0, inversion: 0, shrinkray: 0 };

    function refreshHudPowerups(): void {
        hudPowerups.innerHTML = "";
        let anyActive = false;
        (Object.keys(abilityTimers) as TimedAbility[]).forEach((key) => {
            const t = abilityTimers[key];
            if (t <= 0) return;
            anyActive = true;
            const container = document.createElement("div");
            container.className = "powerup-container";
            const img = document.createElement("div");
            img.className = "powerup-image";
            img.style.backgroundImage = `url("${ABILITY_IMAGES[key]}")`;
            const timer = document.createElement("div");
            timer.className = "powerup-timer";
            timer.textContent = formatTimer(t);
            container.appendChild(img);
            container.appendChild(timer);
            hudPowerups.appendChild(container);
        });
        hudPowerups.style.opacity = anyActive ? "1" : "0";
    }

	let isReady = false;
	let hasVotedRematch = false;

	readyBtn.addEventListener("click", () => {
		isReady = !isReady;
		if (isReady) {
			room.send("ready");
			readyBtn.textContent = "Unready";
			readyBtn.classList.add("ready");
		} else {
			room.send("unready");
			readyBtn.textContent = "Ready up!";
			readyBtn.classList.remove("ready");
		}
	});

	// Renderer maps
	const brickObjects = new Map<number, ClientBrick>();
	const paddleObjects = new Map<string, ClientPaddle>();
	const ballObjects = new Map<string, ClientBall>();

	// Interpolation targets
	// Remote paddles and all balls are interpolated toward server positions
	const paddleTargetX = new Map<string, number>();

	// Ball prediction state
	interface LocalBall { x: number; y: number; vX: number; vY: number; ownerSessionId: string; }
	const localBalls = new Map<string, LocalBall>();
	const serverBalls = new Map<string, { x: number; y: number; vX: number; vY: number }>();
	const ballOwnerTeam = new Map<string, number>();
	const BALL_CORRECTION = 200; // fallback snap

	// Local prediction state
	let localPaddleX = 0;
	let serverPaddleX = 0; // latest x received from server
	let localPSpeed = C.PADDLE_WIDTH; // updated when server sends pSpeed
	let localScaleX = 1; // updated when server sends scaleX
	let localInversion = false;

	// THROTTLE_START should sit comfortably above normal low-ping drift (5ish units).
	// THROTTLE_FULL should be above the max high-ping drift you want to tolerate.
	const THROTTLE_START = 40; // units, full speed below this gap
	const THROTTLE_FULL = 160; // units, zero speed at or beyond this gap

	// Idle lerp: when no keys are held, drift back toward the server position.
	// IDLE_LERP_DEADZONE — gaps smaller than this are ignored entirely. Prevents micro-jitter from float drift at low ping.
	// IDLE_LERP_DELAY_MS — how long to wait after releasing a key before the lerp starts. Gives the server time to finish processing the last in-flight input so serverPaddleX has settled before we chase it.
	const IDLE_LERP_DEADZONE = 8; // units, ignore gaps smaller than this
	const IDLE_LERP_DELAY_MS = 80; // ms, wait this long after last keyup before correcting
	const IDLE_LERP_STRENGTH = 0.1; // lerp factor per tick (lower = smoother)
	let idleMs = 0; // ms spent with no movement input held

    type InputAction = "left" | "right" | "releaseBall";

    const keyMap: Record<string, InputAction> = {
        ArrowRight: "right",
        KeyD: "right",
        ArrowLeft: "left",
        KeyA: "left",
        Space: "releaseBall",
    };

    const input: Record<InputAction, boolean> = {
        left: false,
        right: false,
        releaseBall: false,
    };

	// Bit 0 (1) = left, Bit 1 (2) = right, Bit 2 (4) = releaseBall
	function packInput(): number {
		let flags = 0;
		if (input.left) flags |= 1;
		if (input.right) flags |= 2;
		if (input.releaseBall) flags |= 4;
		return flags;
	}

    const sendInput = () => room.send("input", packInput());

    window.addEventListener("keydown", (e: KeyboardEvent) => setKey(e, true));
    window.addEventListener("keyup", (e: KeyboardEvent) => setKey(e, false));

    function setKey(e: KeyboardEvent, pressed: boolean) {
        const action = keyMap[e.code];
        if (!action) return;

        input[action] = pressed;
        sendInput();
    }

    let lastInputHeartbeat = 0;
    const INPUT_HEARTBEAT_MS = 33; // roughly 2 ticks @ 60 Hz

    window.addEventListener("touchstart", (e) => {
        const hasUnreleased = [...localBalls.values()].some(
            b => b.ownerSessionId === room.sessionId && b.vX === 0 && b.vY === 0
        );

        if (hasUnreleased) {
            input.releaseBall = true;
            sendInput();
            return;
        }

        input.left  = e.touches[0].pageX / window.innerWidth < 0.5;
        input.right = !input.left;
        sendInput();
    }, true);

    window.addEventListener("touchend", () => {
        input.left = input.right = input.releaseBall = false;
        sendInput();
    }, true);

    // Prevent long-press highlight on the canvas
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });

	// Schema listeners: bricks
	room.state.bricks.onAdd((brick, index) => {
		const cb = new ClientBrick(brick);
		brickObjects.set(index, cb);
		brick.listen("brickType", () => cb.update(brick));
		brick.listen("health", () => cb.update(brick));
	});
 
	room.state.bricks.onRemove((_brick, index) => {
		brickObjects.get(index)?.destroy();
		brickObjects.delete(index);
	});

	// Schema listeners: paddles
	const updateLobbyList = () => {
		lobbyPlayerList.innerHTML = "";
		room.state.paddles.forEach((p, sid) => {
			if (sid.startsWith("bot_")) return;
			const li = document.createElement("li");
			const teamLabel = p.team === 0 ? "🔵" : "🔴";
			li.textContent = `${teamLabel} ${p.username} ${p.isReady ? "✓" : "..."}`;
			if (sid === room.sessionId) li.style.fontWeight = "bold";
			lobbyPlayerList.appendChild(li);
		});
	};

	room.state.paddles.onAdd((paddle, sessionId) => {
		const isLocal = sessionId === room.sessionId;
		const cp = new ClientPaddle(paddle, isLocal);
		paddleObjects.set(sessionId, cp);

		if (isLocal) {
			// Initialise prediction from the server's starting position
			localPaddleX = paddle.x;
			localPSpeed = paddle.pSpeed;
			localScaleX = paddle.scaleX;
			localInversion = paddle.inversionEffect;

			// Sync powerup state changes to local prediction vars
			paddle.listen("pSpeed", v => { localPSpeed = v; });
			paddle.listen("scaleX", v => { localScaleX = v; });
			paddle.listen("inversionEffect", v => { localInversion = v; });

            // Sync timed ability timers to HUD
			paddle.listen("slowmoTimer", v => { abilityTimers.slowmo = v; refreshHudPowerups(); });
			paddle.listen("inversionTimer", v => { abilityTimers.inversion = v; refreshHudPowerups(); });
			paddle.listen("shrinkrayTimer", v => { abilityTimers.shrinkray = v; refreshHudPowerups(); });

			serverPaddleX = paddle.x;
			// Track server position for smooth correction in the ticker
			paddle.listen("x", v => { serverPaddleX = v; });
		} else {
			paddleTargetX.set(sessionId, paddle.x);
			paddle.listen("x", v => paddleTargetX.set(sessionId, v));
            paddle.listen("scaleX", v => { cp.paddle.scale.x = v; });
		}

		paddle.listen("score", () => gs.leaderboard?.updateFromState(room.state));
		paddle.listen("isReady", () => updateLobbyList());
		updateLobbyList();
	});

	room.state.paddles.onRemove((_p, sessionId) => {
		paddleObjects.get(sessionId)?.destroy();
		paddleObjects.delete(sessionId);
		paddleTargetX.delete(sessionId);
		updateLobbyList();
	});

	// Schema listeners: balls
	room.state.balls.onAdd((ball, ballId) => {
		const ownerPaddle = room.state.paddles.get(ball.ownerSessionId);
		const ownerTeam = ownerPaddle?.team ?? 0;
		const isLocal = ball.ownerSessionId === room.sessionId;
		const isTeammate = !isLocal && ownerTeam === (room.state.paddles.get(room.sessionId)?.team ?? 0);

		const cb = new ClientBall(ball, isLocal, isTeammate, ownerTeam);
		ballObjects.set(ballId, cb);
		ballOwnerTeam.set(ballId, ownerTeam);

		// Seed local prediction from server spawn state
		const local: LocalBall = { x: ball.x, y: ball.y, vX: ball.vX, vY: ball.vY, ownerSessionId: ball.ownerSessionId };
		localBalls.set(ballId, local);
		serverBalls.set(ballId, { x: ball.x, y: ball.y, vX: ball.vX, vY: ball.vY });

		// Track server position for drift correction
		ball.listen("x",  v => { const s = serverBalls.get(ballId); if (s) s.x  = v; });
		ball.listen("y",  v => { const s = serverBalls.get(ballId); if (s) s.y  = v; });
		ball.listen("vX", v => {
			const s = serverBalls.get(ballId); if (s) s.vX = v;
			const l = localBalls.get(ballId);  if (l) l.vX = v;
		});
		ball.listen("vY", v => {
			const s = serverBalls.get(ballId); if (s) s.vY = v;
			const l = localBalls.get(ballId);  if (l) l.vY = v;
		});
	});

	room.state.balls.onRemove((_b, ballId) => {
		ballObjects.get(ballId)?.destroy();
		ballObjects.delete(ballId);
		localBalls.delete(ballId);
		serverBalls.delete(ballId);
		ballOwnerTeam.delete(ballId);
	});

	// Server messages
	room.onMessage("shake", () => screenShake(app));
	room.onMessage("pong", () => { hudPing.textContent = `Ping: ${Date.now() - pingStart}ms`; });

	// Leaderboard state listeners
	room.state.listen("blueHealth", () => gs.leaderboard?.updateFromState(room.state));
	room.state.listen("redHealth", () => gs.leaderboard?.updateFromState(room.state));
	room.state.listen("minutes", () => gs.leaderboard?.updateFromState(room.state));
	room.state.listen("seconds", () => gs.leaderboard?.updateFromState(room.state));

	// Phase changes
	room.state.listen("phase", (phase) => {
		if (phase === "countdown" || phase === "lobby") {
			// If coming back from gameover (rematch), hide game-over overlay and reset button. Bring back main-menu for lobby UI
			if (gameOver.style.display !== "none") {
				gameOver.style.opacity = "0";
				setTimeout(() => { gameOver.style.display = "none"; }, 400);
				hasVotedRematch = false;
				rematchBtn.textContent = "Rematch";
				rematchBtn.classList.remove("ready");
				rematchStatus.textContent = "";
                mainMenu.style.display = "flex";
                mainMenu.style.opacity = "1";
			}
			lobbyContent.style.display = "flex";
            lobbyContent.style.opacity = "1";
			countdownEl.style.display = phase === "countdown" ? "block" : "none";
			readyBtn.style.display = phase === "lobby" ? "block" : "none";
			// Reset local ready state if returning to lobby from gameover
			if (phase === "lobby") {
				isReady = false;
				readyBtn.textContent = "Ready up!";
				readyBtn.classList.remove("ready");
			}
		} else if (phase === "playing") {
			mainMenu.style.opacity = "0";
			setTimeout(() => (mainMenu.style.display = "none"), 400);
		} else if (phase === "gameover") {
			const blue = room.state.blueHealth;
			const red = room.state.redHealth;
			if (blue > red) {
				gameOverTitle.textContent = "Blue Team Wins!";
			} else if (red > blue) {
				gameOverTitle.textContent = "Red Team Wins!";
			} else {
				gameOverTitle.textContent = "Draw!";
			}
			gameOverReason.textContent = room.state.gameOverReason === "time" ? "Time ran out" : "A team ran out of health";
			gameOver.style.display = "flex";
			requestAnimationFrame(() => { gameOver.style.opacity = "1"; });
			updateRematchStatus();
		}
	});
 
	rematchBtn.addEventListener("click", () => {
		hasVotedRematch = !hasVotedRematch;
		if (hasVotedRematch) {
			room.send("rematch");
			rematchBtn.textContent = "Cancel";
			rematchBtn.classList.add("ready");
		} else {
			room.send("unrematch");
			rematchBtn.textContent = "Rematch";
			rematchBtn.classList.remove("ready");
		}
	});
 
	const updateRematchStatus = () => {
		if (room.state.phase !== "gameover") return;
		let totalReal = 0;
		room.state.paddles.forEach((p, sid) => { 
			if (sid.startsWith("bot_")) return;
            totalReal++; 
        });
		const count = room.state.rematchCount;
		rematchStatus.textContent = count > 0 ? `${count} / ${totalReal} players rematching...` : "";
	};
 
	room.state.listen("rematchCount", () => updateRematchStatus());

	room.state.listen("countdownSeconds", (v) => {
		countdownEl.textContent = String(v);
	});

	// Resize
	resize(app);
	window.addEventListener("resize", () => resize(app));

	// Render loop
	const LERP_REMOTE = 0.25;
	let lastSecond = 0;
	let pingStart = 0;

	app.ticker.add((ticker) => {
		const dt = ticker.deltaTime;

        // Set paddle scale
		const myPaddle = paddleObjects.get(room.sessionId);
        if (myPaddle) myPaddle.paddle.scale.x = localScaleX;

		// Local paddle. Client authority with server-gap throttling
		if (myPaddle && room.state.phase === "playing") {
			const paddleW = C.PADDLE_WIDTH * localScaleX;
			const maxX = C.MAP_WIDTH - paddleW - 34;

			// Resolve effective direction accounting for inversion powerup
			const wantsRight = localInversion ? input.left  : input.right;
			const wantsLeft  = localInversion ? input.right : input.left;

			// Signed gap: positive means client is to the right of server. Throttling only applies when moving further from the server, never when moving back toward it.
			const gap = localPaddleX - serverPaddleX;

			if (wantsRight || wantsLeft) idleMs = 0;

			if (wantsRight) {
				// Moving right. Throttle only if client is already ahead to the right.
				const aheadGap = Math.max(0, gap); // positive when client is right of server
				const throttle = aheadGap <= THROTTLE_START ? 1 : aheadGap >= THROTTLE_FULL ? 0 : 1 - (aheadGap - THROTTLE_START) / (THROTTLE_FULL - THROTTLE_START);
				localPaddleX += localPSpeed * dt * throttle;
			} else if (wantsLeft) {
				// Moving left. Throttle only if client is already ahead to the left.
				const aheadGap = Math.max(0, -gap); // positive when client is left of server
				const throttle = aheadGap <= THROTTLE_START ? 1 : aheadGap >= THROTTLE_FULL ? 0 : 1 - (aheadGap - THROTTLE_START) / (THROTTLE_FULL - THROTTLE_START);
				localPaddleX -= localPSpeed * dt * throttle;
			} else {
				// Idle.. accumulate time since last movement, then lerp toward server.
				// The delay lets the server finish processing the last in-flight input before we start correcting, so we're not chasing a moving target.
				idleMs += ticker.elapsedMS;
				if (idleMs >= IDLE_LERP_DELAY_MS && Math.abs(gap) > IDLE_LERP_DEADZONE) {
					localPaddleX += gap * -IDLE_LERP_STRENGTH * dt;
				}
			}

			localPaddleX = Math.max(34, Math.min(maxX, localPaddleX));
			myPaddle.paddle.x = localPaddleX;
			myPaddle.syncLabelX(localPaddleX);
		}

		// Remote paddle interpolation
		paddleObjects.forEach((cp, sessionId) => {
			if (sessionId === room.sessionId) return;
			const targetX = paddleTargetX.get(sessionId);
			if (targetX !== undefined) {
				cp.paddle.x += (targetX - cp.paddle.x) * LERP_REMOTE;
				cp.syncLabelX(cp.paddle.x);
			}
		});

		// Ball prediction. Run shared physics locally, correct on large server drift
		ballObjects.forEach((cb, ballId) => {
			const local = localBalls.get(ballId);
			const server = serverBalls.get(ballId);
			if (!local) return;
 
			// Unreleased ball
			if (local.vX === 0 && local.vY === 0) {
				const isLocalBall = local.ownerSessionId === room.sessionId;
                // Local ball, snap right to middle of client paddle
				if (isLocalBall) {
					cb.sprite.x = localPaddleX + (C.PADDLE_WIDTH * localScaleX) / 2 - C.BALL_WIDTH / 2;
				} else if (server) {
					// Remote ball, lerp to the remote owner paddle
					cb.sprite.x += (server.x - cb.sprite.x) * 0.15;
					cb.sprite.y += (server.y - cb.sprite.y) * 0.15;
				}
				// Update trail even while held (stationary emission keeps the glow at rest)
				// cb.trail.update(cb.sprite.x, cb.sprite.y, C.BALL_WIDTH, C.BALL_WIDTH, dt);
				return;
			}

			const ownerTeam = ballOwnerTeam.get(ballId) ?? 0;
			const paddle = room.state.paddles.get(local.ownerSessionId) ?? null;

			stepBall(local, room.state.bricks, paddle, ownerTeam, dt, { onBrickHit: () => {} });

			// Position correction toward server.
			// Small drift (normal): gentle lerp so corrections are invisible.
			// Large drift (extreme desync): hard snap so the ball isn't lost.
			if (server) {
				const dx = server.x - local.x;
				const dy = server.y - local.y;
				if (Math.abs(dx) > BALL_CORRECTION || Math.abs(dy) > BALL_CORRECTION) {
					// Extreme case. Snap and re-seed velocity
					local.x = server.x;
                    local.y = server.y;
					local.vX = server.vX;
                    local.vY = server.vY;
				} else {
					// Normal case. Smooth correction
					local.x += dx * 0.08;
					local.y += dy * 0.08;
				}
			}

			cb.sprite.x = local.x;
			cb.sprite.y = local.y;

			// Update the ball particle trail at the final resolved position
			cb.trail.update(cb.sprite.x, cb.sprite.y, C.BALL_WIDTH, C.BALL_WIDTH, dt);
		});

		// Camera follows local paddle
		const mySchema = room.state.paddles.get(room.sessionId);
		if (mySchema) {
			const viewW = app.renderer.width;
			const target = localPaddleX - viewW / 2 + (C.PADDLE_WIDTH * localScaleX) / 2;
			const CAMERA_LERP = 0.2;
			gs.camera.pivot.x += (target - gs.camera.pivot.x) * CAMERA_LERP * dt;
			gs.camera.pivot.x = Math.max(0, Math.min(gs.MAP_WIDTH - viewW, gs.camera.pivot.x));
		}

		cullOffScreen(gs.camera, app.renderer.width);

		const now = Date.now();

		// Heartbeat: re-send held movement inputs so the server timeout never fires during normal play, and dropped stop-messages self-correct fast.
		if ((input.left || input.right) && now - lastInputHeartbeat >= INPUT_HEARTBEAT_MS) {
			lastInputHeartbeat = now;
			sendInput();
		}

		if (now - lastSecond > 1000) {
			lastSecond = now;
			pingStart = now;
			room.send("ping");
		}
	});
}
