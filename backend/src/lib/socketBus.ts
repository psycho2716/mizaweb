import type { Server as SocketIOServer } from "socket.io";

let ioRef: SocketIOServer | null = null;

export function attachIo(io: SocketIOServer): void {
    ioRef = io;
}

export function emitAiJobEvent(jobId: string, payload: Record<string, unknown>): void {
    if (!ioRef) return;
    const room = `job:${jobId}`;
    const base = { jobId, ...payload };
    const status = typeof payload.status === "string" ? payload.status : undefined;

    if (status === "completed") {
        ioRef.to(room).emit("job:completed", base);
    } else if (status === "failed") {
        ioRef.to(room).emit("job:failed", base);
    } else {
        ioRef.to(room).emit("job:status", base);
    }
}
