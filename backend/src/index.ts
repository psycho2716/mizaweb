import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import { app } from "./app";
import { env } from "./config/env";
import { initializePersistence } from "./integrations/supabase/persistence";
import { setRealtimeServer } from "./lib/realtime";

const server = createServer(app);
const io = new SocketServer(server, {
    cors: {
        origin: env.FRONTEND_URL,
        credentials: true
    }
});

io.on("connection", (socket) => {
    socket.on("join:channel", (channel: string) => {
        socket.join(channel);
    });
});

setRealtimeServer(io);

async function startServer(): Promise<void> {
    await initializePersistence();
    server.listen(env.PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`API running at http://localhost:${env.PORT}`);
    });
}

void startServer();
