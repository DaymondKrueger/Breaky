import { GameState, PaddleSchema } from "../../shared/schemas/GameState";
import { BallManager } from "./BallManager";
import * as C from "../../shared/constants";

export class BotManager {
	// Tracks which sessionIds are bots so GameRoom can check
	private botSessions = new Set<string>();
	private nextBotId = 0;

	constructor(
		private state: GameState,
		private inputs: Map<string, { left: boolean; right: boolean }>
	) {}

	isBot(sessionId: string): boolean {
		return this.botSessions.has(sessionId);
	}

	/**
	 * Called once at game start.
	 * Counts players per team and adds bots to whichever side is short
	 * so both teams have the same count.
	 * Only touches state.paddles and spawns balls — never called in lobby.
	 */
	balanceTeams(ballManager: BallManager): void {
		const teamCount = [0, 0];
		this.state.paddles.forEach((p) => { teamCount[p.team]++; });

		const target = Math.max(teamCount[0], teamCount[1]);
		for (let team = 0; team < 2; team++) {
			while (teamCount[team] < target) {
				const sid = this.addBot(team, ballManager);
				teamCount[team]++;
				console.log(`[BotManager] Added bot ${sid} to team ${team} for balance.`);
			}
		}
	}

	/**
	 * Called when a real player leaves mid-game.
	 * Adds one bot on their team so the sides stay balanced.
	 */
	replaceLeavingPlayer(team: number, ballManager: BallManager): void {
		this.addBot(team, ballManager);
	}

	/**
	 * Update each bot's input state based on simple AI:
	 * chase the centre of their first live ball.
	 */
	updateBotInputs(): void {
		this.botSessions.forEach((sessionId) => {
			const paddle = this.state.paddles.get(sessionId);
			if (!paddle) return;

			let ballX: number | null = null;
			this.state.balls.forEach((ball) => {
				if (ballX !== null) return;
				if (ball.ownerSessionId === sessionId) ballX = ball.x;
			});

			if (ballX === null) {
				this.inputs.set(sessionId, { left: false, right: false });
				return;
			}

			const paddleCenter = paddle.x + (C.PADDLE_WIDTH * paddle.scaleX) / 2;
			this.inputs.set(sessionId, {
				left:  (ballX as number) < paddleCenter - 20,
				right: (ballX as number) > paddleCenter + 20,
			});
		});
	}

	private addBot(team: number, ballManager: BallManager): string {
		const sessionId = `bot_${this.nextBotId++}`;

		const paddle = new PaddleSchema();
		paddle.username = "Guest" + Math.floor(Math.random() * 5001);
		paddle.team = team;
		paddle.x = 200 + Math.random() * (C.MAP_WIDTH - 600);
		paddle.isReady = true;

		this.state.paddles.set(sessionId, paddle);
		this.inputs.set(sessionId, { left: false, right: false });
		this.botSessions.add(sessionId);

		ballManager.spawnBall(sessionId, paddle);
        ballManager.releaseBall(sessionId);

		return sessionId;
	}
}
