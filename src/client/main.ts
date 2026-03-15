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
	const ratio = gs.WIDTH / gs.HEIGHT;
	let w: number, h: number;
	if (window.innerWidth / window.innerHeight >= ratio) {
		w = window.innerHeight * ratio;
		h = window.innerHeight;
	} else {
		w = window.innerWidth;
		h = window.innerWidth / ratio;
	}
	const canvas = app.canvas as HTMLCanvasElement;
	canvas.style.width = `${w}px`;
	canvas.style.height = `${h}px`;
	canvas.style.position = "absolute";
	canvas.style.left = "50%";
	canvas.style.top = "50%";
	canvas.style.transform = "translate3d(-50%, -50%, 0)";
}

function cullOffScreen(children: any[]): void {
	for (const child of children) {
		const pos = child.toGlobal(new Point(0, 0));
		child.renderable = pos.x >= -512 && pos.y >= -32 && pos.x <= gs.WIDTH && pos.y <= gs.HEIGHT;
		if (child.children?.length > 0) cullOffScreen(child.children);
	}
}

function initMapVisuals(): void {
	const { WIDTH, HEIGHT, MAP_WIDTH } = gs;
	const num = Math.ceil((HEIGHT - 112) / 64);
	const bgH = Math.round((HEIGHT - 112) / num);
	for (let y = 0; y < Math.ceil((HEIGHT - 112) / 64); y++) {
		for (let x = 0; x < Math.ceil(MAP_WIDTH / bgH); x++) {
			const bg = new Sprite(Texture.from("bgPattern"));
			bg.height = bgH; bg.width = bgH;
			bg.position.set(x * bgH, 56 + y * bgH);
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
		gs.camera.addChild(hl);
	}
}

export async function initGame(room: Colyseus.Room<GameState>): Promise<void> {
	const app = new Application();
	await app.init({
		width: gs.WIDTH,
		height: gs.HEIGHT,
		backgroundAlpha: 0,
		antialias: false,
		resolution: 1,
	});
	gs.app = app;
	document.body.appendChild(app.canvas as HTMLCanvasElement);

	gs.camera = new Container();
	gs.HUD = new Container();
	app.stage.addChild(gs.camera);
	app.stage.addChild(gs.HUD);
	gs.camera.interactiveChildren = false;
	gs.HUD.interactiveChildren = false;

	await loadAssets();
	initMapVisuals();

	gs.leaderboard = new Leaderboard(gs.WIDTH - 226, 20);

	const fpsStyle = new TextStyle({ fontFamily: "Arial", fontSize: 36, fill: "#ffffff", stroke: { color: "#000000", width: 4 } });
	const fpsText = new Text({ text: "", style: fpsStyle });
	fpsText.x = 10; fpsText.y = 10;
	gs.HUD.addChild(fpsText);

	const ua = navigator.userAgent.toLowerCase();
	const isMobile = ua.includes("mobile") || ua.includes("android");
	if (isMobile) {
		const lArrow = new Sprite(Texture.from("mobileArrow"));
		lArrow.scale.x = -1; lArrow.anchor.set(1, 0);
		lArrow.x = 30; lArrow.y = gs.HEIGHT / 2 - lArrow.height / 2;
		gs.HUD.addChild(lArrow);
		const rArrow = new Sprite(Texture.from("mobileArrow"));
		rArrow.anchor.set(1, 0);
		rArrow.x = gs.WIDTH - 30; rArrow.y = gs.HEIGHT / 2 - rArrow.height / 2;
		gs.HUD.addChild(rArrow);
	}

	// Lobby overlay elements
	const mainMenu = document.getElementById("main-menu")!;
	const lobbyContent = document.getElementById("lobby-content")!;
	const lobbyPlayerList = document.getElementById("lobby-player-list")!;
	const readyBtn = document.getElementById("ready-btn")!;
	const countdownEl = document.getElementById("lobby-countdown")!;

	let isReady = false;

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
	let serverPaddleX = 0; // latest x received from server, used for smooth correction
	let localPSpeed = C.PADDLE_WIDTH; // updated when server sends pSpeed
	let localScaleX = 1; // updated when server sends scaleX
	let localInversion = false;
	const PADDLE_SNAP_THRESHOLD = 120; // hard snap only for extreme desync

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

    const sendInput = () => room.send("input", input);

    window.addEventListener("keydown", (e: KeyboardEvent) => setKey(e, true));
    window.addEventListener("keyup", (e: KeyboardEvent) => setKey(e, false));

    function setKey(e: KeyboardEvent, pressed: boolean) {
        const action = keyMap[e.code];
        if (!action) return;

        input[action] = pressed;
        sendInput();
    }

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

	// Schema listeners: paddles
	const updateLobbyList = () => {
		lobbyPlayerList.innerHTML = "";
		room.state.paddles.forEach((p, sid) => {
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

	// Leaderboard state listeners
	room.state.listen("blueHealth", () => gs.leaderboard?.updateFromState(room.state));
	room.state.listen("redHealth", () => gs.leaderboard?.updateFromState(room.state));
	room.state.listen("minutes", () => gs.leaderboard?.updateFromState(room.state));
	room.state.listen("seconds", () => gs.leaderboard?.updateFromState(room.state));

	// Phase changes
	room.state.listen("phase", (phase) => {
		if (phase === "countdown" || phase === "lobby") {
			lobbyContent.style.display = "flex";
            lobbyContent.style.opacity = "1";
			countdownEl.style.display = phase === "countdown" ? "block" : "none";
			readyBtn.style.display = phase === "lobby" ? "block" : "none";
		} else {
			mainMenu.style.opacity = "0";
			setTimeout(() => (mainMenu.style.display = "none"), 400);
		}
	});

	room.state.listen("countdownSeconds", (v) => {
		countdownEl.textContent = String(v);
	});

	// Resize
	resize(app);
	window.addEventListener("resize", () => resize(app));

	// Render loop
	const LERP_REMOTE = 0.25;
	let lastSecond = 0;

	app.ticker.add((ticker) => {
		const dt = ticker.deltaTime;

        if (room.state.phase === "gameover") {
            return;
        }

        // Set paddle scale
		const myPaddle = paddleObjects.get(room.sessionId);
        if (myPaddle) myPaddle.paddle.scale.x = localScaleX;

		// Local paddle prediction
		if (myPaddle && room.state.phase === "playing") {
			const paddleW = C.PADDLE_WIDTH * localScaleX;
			const maxX = C.MAP_WIDTH - paddleW - 34;
			if (localInversion) {
				if (input.right) localPaddleX -= localPSpeed * dt;
				if (input.left) localPaddleX += localPSpeed * dt;
			} else {
				if (input.right) localPaddleX += localPSpeed * dt;
				if (input.left) localPaddleX -= localPSpeed * dt;
			}
			localPaddleX = Math.max(34, Math.min(maxX, localPaddleX));

			// Smooth server correction, gentle lerp so it's invisible to the player. Hard snap only if we're extremely far off
			const paddleErr = serverPaddleX - localPaddleX;
			if (Math.abs(paddleErr) > PADDLE_SNAP_THRESHOLD) {
				localPaddleX = serverPaddleX;
			} else {
				localPaddleX += paddleErr * 0.05;
			}

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
		});

		// Camera follows local paddle
		const mySchema = room.state.paddles.get(room.sessionId);
		if (mySchema) {
			const target = localPaddleX - gs.WIDTH / 2 + (C.PADDLE_WIDTH * localScaleX) / 2;
			gs.camera.pivot.x += (target - gs.camera.pivot.x) / 20;
			gs.camera.pivot.x = Math.max(0, Math.min(gs.MAP_WIDTH - gs.WIDTH, gs.camera.pivot.x));
		}

		cullOffScreen(gs.camera.children);

		const now = Date.now();
		if (now - lastSecond > 1000) {
			lastSecond = now;
			fpsText.text = `FPS: ${Math.round(app.ticker.FPS)}`;
		}
	});
}
