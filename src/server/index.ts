import "dotenv/config";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";
import express from "express";
import type { Request, Response, NextFunction } from "express";
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

// Auth for Colyseus monitor
function monitorAuth(req: Request, res: Response, next: NextFunction): void {
	const expectedUser = process.env.MONITOR_USER;
	const expectedPass = process.env.MONITOR_PASS;
 
	// If no credentials are configured, block access entirely
	if (!expectedUser || !expectedPass) {
		res.status(403).send("Monitor credentials not configured on server.");
		return;
	}
 
	const header = req.headers.authorization;
	if (!header || !header.startsWith("Basic ")) {
		res.setHeader("WWW-Authenticate", 'Basic realm="Colyseus Monitor"');
		res.status(401).send("Authentication required.");
		return;
	}
 
	const decoded = Buffer.from(header.slice(6), "base64").toString();
	const separatorIndex = decoded.indexOf(":");
	const user = decoded.slice(0, separatorIndex);
	const pass = decoded.slice(separatorIndex + 1);
 
	if (user === expectedUser && pass === expectedPass) {
		next();
		return;
	}
 
	res.setHeader("WWW-Authenticate", 'Basic realm="Colyseus Monitor"');
	res.status(401).send("Invalid credentials.");
}

// Colyseus monitor (admin panel at /colyseus)
app.use("/colyseus", monitorAuth, monitor());

const httpServer = createServer(app);

const gameServer = new Server({ server: httpServer });

// Register game rooms
gameServer.define("game_room", GameRoom);

gameServer.listen(PORT).then(() => {
	console.log(`Game server listening on ws://localhost:${PORT}`);
	console.log(`Colyseus monitor: http://localhost:${PORT}/colyseus`);
});
