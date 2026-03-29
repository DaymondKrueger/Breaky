import { Schema, MapSchema, ArraySchema, defineTypes } from "@colyseus/schema";

export class BrickSchema extends Schema {
	brickType: number = 0;
	health: number = 3;
	x: number = 0;
	y: number = 0;
	relX: number = 0;
	relY: number = 0;
}
defineTypes(BrickSchema, {
	brickType: "uint8",
	health: "uint8",
	x: "float32",
	y: "float32",
	relX: "float32",
	relY: "float32",
});

export class BallSchema extends Schema {
	x: number = 0;
	y: number = 0;
	vX: number = 0;
	vY: number = 0;
	ownerSessionId: string = "";
    napalmQueued: boolean = false; // queues up napalm to activate next time ball hits paddle
    napalmActive: boolean = false; // if napalm is active
}
defineTypes(BallSchema, {
	x: "float32",
	y: "float32",
	vX: "float32",
	vY: "float32",
	ownerSessionId: "string",
    napalmQueued: "boolean",
    napalmActive: "boolean",
});

export class PaddleSchema extends Schema {
	x: number = 0;
	team: number = 0;
	score: number = 0;
	username: string = "";
	playerId: string = "";
	scaleX: number = 1;
	pSpeed: number = 14.16;
	inversionEffect: boolean = false;
	multiballs: number = 0;
	isReady: boolean = false;
	slowmoTimer: number = 0;
	inversionTimer: number = 0;
	shrinkrayTimer: number = 0;
}
defineTypes(PaddleSchema, {
	x: "float32",
	team: "uint8",
	score: "uint16",
	username: "string",
	playerId: "string",
	scaleX: "float32",
	pSpeed: "float32",
	inversionEffect: "boolean",
	multiballs: "uint8",
	isReady: "boolean",
	slowmoTimer: "uint8",
	inversionTimer: "uint8",
	shrinkrayTimer: "uint8",
});

export class GameState extends Schema {
	paddles = new MapSchema<PaddleSchema>();
	balls = new MapSchema<BallSchema>();
	bricks = new ArraySchema<BrickSchema>();
	bricksPerLine: number = 0;
	blueHealth: number = 100;
	redHealth: number = 100;
	minutes: number = 5;
	seconds: number = 0;
	// "lobby" | "countdown" | "playing" | "gameover"
	phase: string = "lobby";
	countdownSeconds: number = 5;
	rematchCount: number = 0;
	gameOverReason: string = "";
	hostPlayerId: string = "";
}
defineTypes(GameState, {
	paddles: { map: PaddleSchema },
	balls: { map: BallSchema },
	bricks: [BrickSchema],
	bricksPerLine: "uint8",
	blueHealth: "uint8",
	redHealth: "uint8",
	minutes: "uint8",
	seconds: "uint8",
	phase: "string",
	countdownSeconds: "uint8",
    rematchCount: "uint8",
	gameOverReason: "string",
	hostPlayerId: "string",
});
