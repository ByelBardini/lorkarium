/** The largest Socket.IO message the server accepts (its `maxHttpBufferSize`). It is sized by the
 *  largest valid command, a `drawing:createMany` of 64 freehand paths of 2000 points with every
 *  coordinate at full precision (about 4.8 MB, proven in `test/realtime-limits.spec.ts`): with
 *  Socket.IO's default of 1 MB, a valid paste dropped the connection instead of being answered. */
export const REALTIME_MESSAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Messages from this size on go compressed (`perMessageDeflate`): the snapshot and the big
 *  pastes; the small, frequent ones (the drag preview) are not worth the CPU. */
export const REALTIME_COMPRESSION_THRESHOLD_BYTES = 4096;
