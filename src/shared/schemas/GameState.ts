import { Schema, MapSchema, defineTypes } from "@colyseus/schema";

export class Player extends Schema {
  x: number = 0;
  y: number = 0;
  speed: number = 5;
  name: string = "";
  score: number = 0;
}

defineTypes(Player, {
  x: "number",
  y: "number",
  speed: "number",
  name: "string",
  score: "number",
});

export class GameState extends Schema {
  players = new MapSchema<Player>();
  tickRate: number = 60;
}

defineTypes(GameState, {
  players: { map: Player },
  tickRate: "number",
});
