import * as PIXI from "pixi.js";

// Every file imports { gs } and reads/writes directly.
export const gs = {
	// Pixi
	app: null as unknown as PIXI.Application,
	camera: null as unknown as PIXI.Container,
	HUD: null as unknown as PIXI.Container,

	// Map dimensions
	WIDTH: 1920,
	HEIGHT: 969,
	MAP_WIDTH: 8162,

	// Tints
	RED_TINT: 0xFF547C as number,
	BLUE_TINT: 0x61EAFF as number,

	// Game objects (typed as any to avoid circular imports between class files)
	bricks: [] as any[],
	paddles: [] as any[],
	playerPaddle: null as any,
	leaderboard: null as any,
	bricksPerLine: 0,

	// Input / effects
	inversionEffect: false,
	leftPressed: false,
	rightPressed: false,

	// Loop control
	runGame: false,
};
