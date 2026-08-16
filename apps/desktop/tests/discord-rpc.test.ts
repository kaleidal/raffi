import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const {
    DiscordIpcClient,
    discordSocketCandidates,
    encodeFrame,
} = require("../electron/services/discordIpc.cjs");
const { normalizeActivity } = require("../electron/services/rpc.cjs");

describe("Discord IPC", () => {
    test("encodes Discord's little-endian IPC frame", () => {
        const frame = encodeFrame(1, { cmd: "SET_ACTIVITY" });
        expect(frame.readInt32LE(0)).toBe(1);
        expect(frame.readInt32LE(4)).toBe(frame.length - 8);
        expect(JSON.parse(frame.subarray(8).toString())).toEqual({
            cmd: "SET_ACTIVITY",
        });
    });

    test("discovers native, Flatpak, Snap, and Windows endpoints", () => {
        const linux = discordSocketCandidates("linux", {
            XDG_RUNTIME_DIR: "/run/user/1000",
        });
        expect(linux).toContain("/run/user/1000/discord-ipc-0");
        expect(linux).toContain(
            "/run/user/1000/app/com.discordapp.Discord/discord-ipc-0",
        );
        expect(linux).toContain("/run/user/1000/snap.discord/discord-ipc-0");
        expect(discordSocketCandidates("win32", {})).toContain(
            "\\\\?\\pipe\\discord-ipc-0",
        );
    });

    test("handshakes and sends activity through a Discord-compatible socket", async () => {
        const directory = mkdtempSync(join(tmpdir(), "raffi-discord-ipc-"));
        const socketPath = join(directory, "discord-ipc-0");
        const previousRuntimeDir = process.env.XDG_RUNTIME_DIR;
        let resolveActivity;
        const activityReceived = new Promise((resolve) => {
            resolveActivity = resolve;
        });
        const server = createServer((socket) => {
            let buffer = Buffer.alloc(0);
            socket.on("data", (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                while (buffer.length >= 8) {
                    const opcode = buffer.readInt32LE(0);
                    const length = buffer.readInt32LE(4);
                    if (buffer.length < 8 + length) return;
                    const payload = JSON.parse(buffer.subarray(8, 8 + length).toString());
                    buffer = buffer.subarray(8 + length);
                    if (opcode === 0) {
                        socket.write(encodeFrame(1, { evt: "READY" }));
                    } else if (payload.cmd === "SET_ACTIVITY") {
                        resolveActivity(payload);
                    }
                }
            });
        });
        const client = new DiscordIpcClient({
            clientId: "test-client",
            getSocketCandidates: () => [socketPath],
            onDisconnect() {},
            onError(error) {
                throw error;
            },
        });

        try {
            await new Promise((resolve, reject) => {
                server.once("error", reject);
                server.listen(socketPath, resolve);
            });
            process.env.XDG_RUNTIME_DIR = directory;
            await client.connect();
            client.setActivity({ details: "The 100" });
            const payload = await Promise.race([
                activityReceived,
                new Promise((_, reject) => setTimeout(
                    () => reject(new Error("Activity command was not received")),
                    2_000,
                )),
            ]);
            expect(payload.cmd).toBe("SET_ACTIVITY");
            expect(payload.args.activity.details).toBe("The 100");
        } finally {
            client.destroy();
            await new Promise((resolve) => server.close(resolve));
            if (previousRuntimeDir === undefined) delete process.env.XDG_RUNTIME_DIR;
            else process.env.XDG_RUNTIME_DIR = previousRuntimeDir;
            rmSync(directory, { recursive: true, force: true });
        }
    });

    test("normalizes rich presence fields and rejects unsafe links", () => {
        expect(normalizeActivity({
            type: 3,
            statusDisplayType: 2,
            details: "The 100",
            state: "S1 E1 · 42%",
            startTimestamp: 100,
            endTimestamp: 200,
            largeImageKey: "https://images.example/poster.jpg",
            largeImageText: "The 100",
            smallImageKey: "raffi_logo",
            buttons: [
                { label: "Download Raffi", url: "https://raffi.al" },
                { label: "Nope", url: "javascript:alert(1)" },
            ],
        })).toEqual({
            type: 3,
            status_display_type: 2,
            details: "The 100",
            state: "S1 E1 · 42%",
            instance: false,
            buttons: [{ label: "Download Raffi", url: "https://raffi.al/" }],
            timestamps: { start: 100, end: 200 },
            assets: {
                large_image: "https://images.example/poster.jpg",
                large_text: "The 100",
                small_image: "raffi_logo",
            },
        });
    });
});
