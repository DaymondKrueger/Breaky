import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import express from "express";
import cors from "cors";
import path from "path";
import { createServer } from "http";
import { GameRoom } from "./rooms/GameRoom";

const PORT = Number(process.env.PORT) || 3000;

const app = express();

app.use(cors());
app.use(express.json());

// Serve static client files in production
app.use(express.static(path.join(process.cwd(), "dist/client")));

// Colyseus monitor (admin panel at /colyseus)
app.use("/colyseus", monitor());

const httpServer = createServer(app);

const gameServer = new Server({ server: httpServer });

// Register game rooms
gameServer.define("game_room", GameRoom);

gameServer.listen(PORT).then(() => {
	console.log(`Game server listening on ws://localhost:${PORT}`);
	console.log(`Colyseus monitor: http://localhost:${PORT}/colyseus`);
});
