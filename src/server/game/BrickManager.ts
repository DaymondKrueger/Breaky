import { GameState, BrickSchema } from "../../shared/schemas/GameState";
import * as C from "../../shared/constants";

export enum BrickTypes {
    RED_BRICK = 0,
    BLUE_BRICK = 1,
    MYSTERY = 2,
    DYNAMITE = 3,
    INDESTRUCT = 4,
    NAPALM = 5,
    MULTIBALL = 6,
    TURBO = 7,
    SLOWMO = 8,
    INVERSION = 9,
    SHRINKRAY = 10,
    BLUE_OWNED = 11,
    RED_OWNED = 12
}

export class BrickManager {
	constructor(private state: GameState) {}

	spawnMap(): void {
		const bricksPerLine = Math.ceil((C.MAP_WIDTH - 200) / (C.BRICK_WIDTH + C.BRICK_GAP)) + 1;
		this.state.bricksPerLine = bricksPerLine;

		const brickRows: [number, number][] = [
			[C.HEIGHT / 2 - 96 - C.BRICK_HEIGHT - C.BRICK_GAP * 2, 0],
			[C.HEIGHT / 2 - 60 - C.BRICK_HEIGHT - C.BRICK_GAP, 0],
			[C.HEIGHT / 2 - 24 - C.BRICK_HEIGHT, 0],
			[C.HEIGHT / 2 + 24, 1],
			[C.HEIGHT / 2 + 60 + C.BRICK_GAP, 1],
			[C.HEIGHT / 2 + 96 + C.BRICK_GAP * 2, 1],
		];

		for (let rowIndex = 0; rowIndex < brickRows.length; rowIndex++) {
			const [rowY, team] = brickRows[rowIndex];
			for (let i = 0; i < bricksPerLine; i++) {
				const brick = new BrickSchema();
				brick.x = 40 + i * (C.BRICK_WIDTH + C.BRICK_GAP);
				brick.y = rowY;
				brick.relX = i;
				brick.relY = rowIndex;
				brick.brickType = team;
				brick.health = 3;
				if (Math.floor(Math.random() * 11) === 0) brick.brickType = BrickTypes.MYSTERY;
				if (Math.floor(Math.random() * 81) === 0) brick.brickType = BrickTypes.DYNAMITE;
				if (Math.floor(Math.random() * 76) === 0) brick.brickType = BrickTypes.INDESTRUCT;
				this.state.bricks.push(brick);
			}
		}
	}

	ownBrick(brick: BrickSchema, ownerSessionId: string): void {
		if (brick.brickType === 4) return;
		const paddle = this.state.paddles.get(ownerSessionId);
		if (!paddle) return;
		brick.brickType = paddle.team === 0 ? BrickTypes.BLUE_OWNED : BrickTypes.RED_OWNED;
		brick.health = 3;
	}

	ownBrickAt(x: number, y: number, ownerSessionId: string): void {
		if (x < 0 || y < 0 || x >= this.state.bricksPerLine || y >= 6) return;
		const brick = this.state.bricks[x + y * this.state.bricksPerLine];
		if (brick) this.ownBrick(brick, ownerSessionId);
	}

	isExplosiveBrickAt(x: number, y: number): boolean {
		if (x < 0 || y < 0 || x >= this.state.bricksPerLine || y >= 6) return false;
		const brick = this.state.bricks[x + y * this.state.bricksPerLine];
		return brick?.brickType === BrickTypes.DYNAMITE;
	}

	isOwnedByTeam(brick: BrickSchema, team: number): boolean {
		return (team === 0 && brick.brickType === BrickTypes.BLUE_OWNED) || (team === 1 && brick.brickType === BrickTypes.RED_OWNED);
	}

	explodeBrick(x: number, y: number, ownerSessionId: string, isRoot: boolean, broadcastShake: () => void): void {
		if (x < 0 || y < 0 || x >= this.state.bricksPerLine || y >= 6) return;
		if (isRoot) broadcastShake();
		this.ownBrickAt(x, y, ownerSessionId);
		const adj: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
		for (const [dx, dy] of adj) {
			const nx = x + dx, ny = y + dy;
			if (this.isExplosiveBrickAt(nx, ny)) this.explodeBrick(nx, ny, ownerSessionId, false, broadcastShake);
			this.ownBrickAt(nx, ny, ownerSessionId);
		}
	}
}
