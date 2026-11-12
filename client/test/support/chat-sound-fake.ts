import type { ChatSound, ChatSoundFactory } from '@/chat-audio/chat-sound';

/** A chat sound the test watches: how many times it played, the preparations and the end. */
export class ChatSoundFake implements ChatSound {
  plays = 0;
  prepares = 0;
  destroyed = false;

  prepare(): void {
    this.prepares += 1;
  }

  play(): void {
    this.plays += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

/** Behind `createChatSound`: keeps every sound made.
 *
 *  Example: `expect(deps.chatSounds.latest().plays).toBe(1)` */
export class ChatSoundsFake {
  readonly made: ChatSoundFake[] = [];

  readonly create: ChatSoundFactory = () => {
    const sound = new ChatSoundFake();
    this.made.push(sound);
    return sound;
  };

  latest(): ChatSoundFake {
    const sound = this.made.at(-1);
    if (sound === undefined) throw new Error('No chat sound was made: expected at least 1.');
    return sound;
  }
}
