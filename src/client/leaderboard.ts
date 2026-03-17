import { gs } from "./state";
import type { GameState } from "../shared/schemas/GameState";

export class Leaderboard {
    // Health elements
    private blueTeamHealthPercentText: HTMLElement = document.getElementById("blue-team-health-percent")!;
    private redTeamHealthPercentText: HTMLElement = document.getElementById("red-team-health-percent")!;
    private blueTeamHealthBarFill: HTMLElement = document.getElementById("blue-team-bar-fill")!;
    private redTeamHealthBarFill: HTMLElement = document.getElementById("red-team-bar-fill")!;

    // Timer element
    private timerText: HTMLElement = document.getElementById("match-timer")!;

	// Called by main.ts whenever relevant server state changes
	updateFromState(state: GameState): void {
		// Health bars
		this.blueTeamHealthBarFill.style.width = `${state.blueHealth}%`;
		this.blueTeamHealthPercentText.innerText = `${state.blueHealth}%`;
		this.redTeamHealthBarFill.style.width = `${state.redHealth}%`;
		this.redTeamHealthPercentText.innerText = `${state.redHealth}%`;

		// Timer
		this.timerText.innerText = `${state.minutes}:${String(state.seconds).padStart(2, "0")}`;

		// Sort paddles by score and display top 4
		const sorted: { username: string; score: number; myTint: number }[] = [];
		state.paddles.forEach((paddle) => {
			sorted.push({
				username: paddle.username,
				score: paddle.score,
				myTint: paddle.team === 0 ? gs.BLUE_TINT : gs.RED_TINT,
			});
		});
		sorted.sort((a, b) => b.score - a.score);

		const labels = ["1st", "2nd", "3rd", "4th"];
        for (let i = 0; i < 4; i++) {
            const nameEl = document.getElementById(`score-${i + 1}-name`)!;
            const amtEl = document.getElementById(`score-${i + 1}-amt`)!;
            if (!nameEl || !amtEl) continue;

            const p = sorted[i];
            if (p) {
                const teamClass = p.myTint === gs.BLUE_TINT ? "blue" : "red";
                nameEl.innerText = `${labels[i]} ${p.username}`;
                amtEl.innerText = String(p.score);
                nameEl.classList.remove("blue", "red");
                nameEl.classList.add(teamClass);
                amtEl.classList.remove("blue", "red");
                amtEl.classList.add(teamClass);
            } else {
                nameEl.innerText = labels[i];
                amtEl.innerText = "0";
                nameEl.classList.remove("blue", "red");
                amtEl.classList.remove("blue", "red");
            }
        }
	}
}
