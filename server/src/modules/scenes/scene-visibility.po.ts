import { pgEnum } from 'drizzle-orm/pg-core';

// Who sees a library item: only the master (private) or every member (public). In a file of its
// own because scenes.po.ts imports scene-folders.po.ts, whose table needs this enum while loading.
export const sceneVisibility = pgEnum('scene_visibility', ['private', 'public']);
