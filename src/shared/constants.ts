// Server-side physics dimensions.
// These should match the actual pixel sizes of your sprite assets.
// Adjust if collision feels off.
export const WIDTH = 1920;
export const HEIGHT = 969;
export const MAP_WIDTH = 8162;

export const BRICK_WIDTH = 100;
export const BRICK_HEIGHT = 36;
export const BRICK_GAP = 5;

export const BALL_WIDTH = 28;
export const BALL_HEIGHT = 28;

// Default paddle width (scale.x may shrink it via shrinkray)
export const PADDLE_WIDTH = 180;
export const PADDLE_HEIGHT = 32;

// Blue team paddle top edge (paddle sits near bottom)
export const BLUE_PADDLE_Y = HEIGHT - 85;
// Red team paddle top edge (anchor.y=1 + scale.y=-1 means the sprite renders DOWNWARD from this y, so the visual rect is RED_PADDLE_Y + PADDLE_HEIGHT)
export const RED_PADDLE_Y = 53;

export const WALL_LEFT = 30;

// Ball scoring thresholds
export const GOAL_TOP = -32;
export const GOAL_BOTTOM = HEIGHT;
