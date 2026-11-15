import { useParams } from 'react-router';

/** What `/friends/:friendId` renders in specs that only check the conversation was opened.
 *
 *  Example: `{ path: '/friends/:friendId', element: <ConversationStub /> }` */
export function ConversationStub(): React.JSX.Element {
  return <p>{`Conversa com ${useParams().friendId ?? ''}`}</p>;
}
