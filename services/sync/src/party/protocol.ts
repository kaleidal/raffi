export const PARTY_PROTOCOL = "raffi-party";

export type PlaybackState = {
  position: number;
  playing: boolean;
  at: number;
};

export type ClientMessage =
  | { type: "ping"; sent: number }
  | { type: "state"; position: number; playing: boolean };

export type ServerMessage =
  | { type: "welcome"; host: boolean; state: PlaybackState; members: number }
  | { type: "pong"; sent: number; server: number }
  | { type: "state"; state: PlaybackState }
  | { type: "members"; count: number }
  | { type: "ended"; reason: "host_left" | "expired" };

export const readClientMessage = (raw: string | ArrayBuffer): ClientMessage | null => {
  if (typeof raw !== "string") return null;
  let message: Partial<ClientMessage>;
  try {
    message = JSON.parse(raw);
  } catch {
    return null;
  }
  if (message.type === "ping" && Number.isFinite(message.sent)) return message as ClientMessage;
  if (message.type === "state" && Number.isFinite(message.position) && typeof message.playing === "boolean") {
    return message as ClientMessage;
  }
  return null;
};
