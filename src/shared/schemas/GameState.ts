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
	brickType: "number",
	health: "number",
	x: "number",
	y: "number",
	relX: "number",
	relY: "number",
});

export class BallSchema extends Schema {
	x: number = 0;
	y: number = 0;
	vX: number = 0;
	vY: number = 0;
	ownerSessionId: string = "";
}
defineTypes(BallSchema, {
	x: "number",
	y: "number",
	vX: "number",
	vY: "number",
	ownerSessionId: "string",
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
	x: "number",
	team: "number",
	score: "number",
	username: "string",
	playerId: "string",
	scaleX: "number",
	pSpeed: "number",
	inversionEffect: "boolean",
	multiballs: "number",
	isReady: "boolean",
	slowmoTimer: "number",
	inversionTimer: "number",
	shrinkrayTimer: "number",
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
}
defineTypes(GameState, {
	paddles: { map: PaddleSchema },
	balls: { map: BallSchema },
	bricks: [BrickSchema],
	bricksPerLine: "number",
	blueHealth: "number",
	redHealth: "number",
	minutes: "number",
	seconds: "number",
	phase: "string",
	countdownSeconds: "number",
    rematchCount: "number",
	gameOverReason: "string",
});
