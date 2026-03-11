import { Application, Container, Sprite, Text, TextStyle, Texture, Point, Ticker } from "pixi.js";
import { gs } from "./state";
import { loadAssets } from "./assets";
import { Brick } from "./brick";
import { Paddle } from "./paddle";
import { Leaderboard } from "./leaderboard";

// Replaces TweenMax.to(stage, ...) calls from the original explode() in ball.js
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

// Map init (bricks, walls, background)
function initMap(): void {
	const { WIDTH, HEIGHT, MAP_WIDTH } = gs;
	const brickGap = 5, brickH = 36;
	const ugMax = 2.5, ugMin = -2.5;
	const rng = () => Math.floor(Math.random() * (ugMax + 1)) + ugMin;

	// Background tiles
	const num  = Math.ceil((HEIGHT - 112) / 64);
	const bgH  = Math.round((HEIGHT - 112) / num);
	for (let y = 0; y < Math.ceil((HEIGHT - 112) / 64); y++) {
		for (let x = 0; x < Math.ceil(MAP_WIDTH / bgH); x++) {
			const bg = new Sprite(Texture.from("bgPattern"));
			bg.height = bgH; bg.width = bgH;
			bg.position.set(x * bgH, 56 + y * bgH);
			gs.camera.addChild(bg);
		}
	}

	// Goal segments
	for (let i = 0; i < Math.ceil(MAP_WIDTH / 512); i++) {
		const rg = new Sprite(Texture.from("redGoal"));
		rg.position.set(i * 512, 0);
		gs.camera.addChild(rg);
		const bg = new Sprite(Texture.from("blueGoal"));
		bg.position.set(i * 512, HEIGHT - 56);
		gs.camera.addChild(bg);
	}

	// Left walls
	for (let i = 0; i < 7; i++) {
		const w = new Sprite(Texture.from("wallSegment"));
		w.scale.x = -1; w.anchor.set(1, 0);
		w.height = Math.round(HEIGHT / 7);
		w.position.set(0, i * w.height);
		gs.camera.addChild(w);
	}

	// Right walls
	for (let i = 0; i < 7; i++) {
		const w = new Sprite(Texture.from("wallSegment"));
		w.height = Math.round(HEIGHT / 7);
		w.position.set(MAP_WIDTH - 30, i * w.height);
		gs.camera.addChild(w);
	}

	// Half-line
	for (let i = 0; i < Math.round((MAP_WIDTH - 60) / 32); i++) {
		const hl = new Sprite(Texture.from("halfLineMid"));
		hl.position.set(30 + i * 32, HEIGHT / 2 - hl.height / 2);
		gs.camera.addChild(hl);
	}

	// Bricks - 6 rows (3 red top, 3 blue bottom)
	gs.bricksPerLine = Math.ceil((MAP_WIDTH - 200) / (100 + brickGap)) + 1;
	const brickRows: [number, number, number][] = [
		[HEIGHT / 2 - 96 - brickH - brickGap * 2, 0, 0],
		[HEIGHT / 2 - 60 - brickH - brickGap, 0, 1],
		[HEIGHT / 2 - 24 - brickH, 0, 2],
		[HEIGHT / 2 + 24, 1, 3],
		[HEIGHT / 2 + 60 + brickGap, 1, 4],
		[HEIGHT / 2 + 96 + brickGap * 2, 1, 5],
	];
	for (const [rowY, team, rowIndex] of brickRows) {
		for (let i = 0; i < gs.bricksPerLine; i++) {
			const ug = rng();
			new Brick(40 + i * (100 + brickGap) + ug, rowY + ug, team, i, rowIndex);
		}
	}
}

// Main entry
export async function initGame(): Promise<void> {
	const app = new Application();
	await app.init({
		width: gs.WIDTH,
		height: gs.HEIGHT,
		backgroundAlpha: 0,
		antialias: true,
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

	// Load all textures before creating any sprites
	await loadAssets();

	initMap();

	// Bot paddles
	for (let j = 0; j < 4; j++) {
		const p = new Paddle(100 + Math.round(Math.random() * (gs.MAP_WIDTH - 500)), 1, true, `Guest${Math.floor(Math.random() * 5001)}`);
		gs.paddles.push(p);
	}
	for (let j = 0; j < 5; j++) {
		const p = new Paddle(100 + Math.round(Math.random() * (gs.MAP_WIDTH - 500)), 2, true, `Guest${Math.floor(Math.random() * 5001)}`);
		gs.paddles.push(p);
	}

	// Player paddle
	const usernameInput = document.getElementById("game-username") as HTMLInputElement | null;
	const username = usernameInput?.value || `Guest${Math.floor(Math.random() * 5001)}`;
	gs.playerPaddle = new Paddle(100 + Math.round(Math.random() * (gs.MAP_WIDTH - 500)), 0, false, username);
	gs.paddles.push(gs.playerPaddle);

	// FPS counter
	const fpsStyle = new TextStyle({ fontFamily: "Arial", fontSize: 36, fill: "#ffffff", stroke: { color: "#000000", width: 4 } });
	const fpsText = new Text({ text: "", style: fpsStyle });
	fpsText.x = 10; fpsText.y = 10;
	gs.HUD.addChild(fpsText);

	// Leaderboard
	gs.leaderboard = new Leaderboard(gs.WIDTH - 226, 20);

	// Mobile arrows
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

	resize(app);
	window.addEventListener("resize", () => resize(app));

	// Input
	window.addEventListener("keydown", (e) => {
		if (e.keyCode === 39 || e.keyCode === 68) gs.rightPressed = true;
		if (e.keyCode === 37 || e.keyCode === 65) gs.leftPressed  = true;
	});
	window.addEventListener("keyup", (e) => {
		if (e.keyCode === 39 || e.keyCode === 68) gs.rightPressed = false;
		if (e.keyCode === 37 || e.keyCode === 65) gs.leftPressed  = false;
	});
	window.addEventListener("touchstart", (e) => {
		gs.leftPressed  = e.touches[0].pageX / window.innerWidth < 0.5;
		gs.rightPressed = !gs.leftPressed;
	}, true);
	window.addEventListener("touchend", () => {
		gs.leftPressed = gs.rightPressed = false;
	}, true);

	// Game loop
	let timer = 0;
	let timerStarted = false;

	app.ticker.add((ticker: Ticker) => {
		if (!gs.runGame) return;

		if (!timerStarted) { 
			timer = Date.now(); 
			timerStarted = true; 
		}

		for (const p of gs.paddles) p.update(ticker.deltaTime);

		// Camera scroll to follow player
		const target = gs.playerPaddle.paddle.x - gs.WIDTH / 2 + gs.playerPaddle.paddle.width / 2;
		gs.camera.pivot.x += ticker.deltaTime * ((target - gs.camera.pivot.x) / 20);
		gs.camera.pivot.x = Math.max(0, Math.min(gs.MAP_WIDTH - gs.WIDTH, gs.camera.pivot.x));

		cullOffScreen(gs.camera.children);

		// Per-second updates
		if (Date.now() - timer > 1000) {
			timer += 1000;
			gs.leaderboard.updatePerSecond();
			fpsText.text = `FPS: ${Math.round(app.ticker.FPS)}`;
		}
	});

	gs.runGame = true;
}
