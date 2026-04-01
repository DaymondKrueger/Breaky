import { Assets } from "pixi.js";

const ASSET_MANIFEST = [
	{ alias: "wallSegment", src: "res/wallsegment.png" },
	{ alias: "redGoal", src: "res/goal_redTeam.png" },
	{ alias: "blueGoal", src: "res/goal_blueTeam.png" },
	{ alias: "bgPattern", src: "res/bgPattern2.png" },
	{ alias: "defaultPaddle", src: "res/paddle_default.png" },
	{ alias: "playerBall", src: "res/ball_player.png" },
	{ alias: "halfLineEnd", src: "res/halfLine_end.png" },
	{ alias: "halfLineMid", src: "res/halfLine_tile.png" },

	// Bricks
	{ alias: "brickT1", src: "res/bricks/brick_t1.png" },
	{ alias: "brickT2", src: "res/bricks/brick_t2.png" },
	{ alias: "brickT3", src: "res/bricks/brick_t3.png" },
	{ alias: "brickBlue_owned", src: "res/bricks/brickBlue_owned.png" },
	{ alias: "brickRed_owned", src: "res/bricks/brickRed_owned.png" },
	{ alias: "dynamiteBrick", src: "res/bricks/brick_dynamite.png" },
	{ alias: "indestructBrick", src: "res/bricks/brick_indestruct.png" },
	{ alias: "mysteryBrick", src: "res/bricks/brick_mysteryBox.png" },

	// Power-up bricks
	{ alias: "napalmBrick", src: "res/bricks/ability_napalm.png" },
	{ alias: "multiballBrick", src: "res/bricks/ability_multiball.png" },
	{ alias: "turboBrick", src: "res/bricks/ability_turbo.png" },
	{ alias: "slowmoBrick", src: "res/bricks/ability_slowmo.png" },
	{ alias: "inversionBrick", src: "res/bricks/ability_inversion.png" },
	{ alias: "shrinkrayBrick", src: "res/bricks/ability_shrink.png" },
	{ alias: "magnetBrick", src: "res/bricks/ability_magnet.png" },
	{ alias: "turretBrick", src: "res/bricks/ability_turret.png" },
	{ alias: "pewpewBrick", src: "res/bricks/ability_pewpew.png" },

	// HUD
	{ alias: "leaderboard_bg", src: "res/leaderboard_bg.png" },
	{ alias: "healthBar", src: "res/leaderboard_healthbar.png" },

    // VFX spritesheets
	{ alias: "napalmTrail", src: "res/vfx/fx_napalmTrail.png" },
	{ alias: "sparkWall2", src: "res/vfx/fx_sparkWall2.png" },
	{ alias: "sparkWall3", src: "res/vfx/fx_sparkWall3.png" },
	{ alias: "sparkWall4", src: "res/vfx/fx_sparkWall4.png" },
	{ alias: "sparkWall7", src: "res/vfx/fx_sparkWall7.png" },
	{ alias: "sparkWall8", src: "res/vfx/fx_sparkWall8.png" },
	{ alias: "explosion", src: "res/vfx/fx_tnt.png" },
];

let registered = false;
 
export async function loadAssets(): Promise<void> {
	if (!registered) {
		Assets.add(ASSET_MANIFEST);
		registered = true;
	}
	await Assets.load(ASSET_MANIFEST.map((a) => a.alias));
}
