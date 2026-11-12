/** The short sound of a mention or a whisper, implemented by the Web Audio adapter. `prepare`
 *  loads it ahead, so the first call is not lost to the loading (idempotent); `play` sounds it
 *  once, now; `destroy` is final. */
export interface ChatSound {
  prepare(): void;
  play(): void;
  destroy(): void;
}

/** Makes the chat sound of a room. Nothing is heard (nor the audio context created) before the
 *  first `prepare` or `play`.
 *
 *  Example: `const sound = createChatSound()` */
export type ChatSoundFactory = () => ChatSound;
