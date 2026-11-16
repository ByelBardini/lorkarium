import { profileLookupParamsDto, type ProfileCardDto } from '@lorkarium/contracts';
import { useState } from 'react';
import type { ProfileCardApi } from '@/services/profile-card-api';
import { profileLookupFailureText } from './profile-card-text';
import type { ProfileLookupFormProps } from './profile-lookup-field';

export type ProfileLookupOptions = Readonly<{
  api: ProfileCardApi;
  /** The @ of the card on screen (`null` while it loads): looking it up again asks nothing. */
  shownUsername: string | null;
  onFound: (card: ProfileCardDto) => void;
}>;

export type ProfileLookup = Readonly<{
  form: ProfileLookupFormProps;
  /** Back to an empty field without the sentence: the modal closing. */
  reset: () => void;
}>;

/** The state of "Buscar @usuário", held by the modal so the field keeps the @ it found while the
 *  card under it is swapped: the exact @ (with or without "@", any case) on Enter; found, the card
 *  goes to `onFound` and the field reads its @; not found, the sentence and the card stays. A text
 *  outside the @ format is "not found" without asking the server.
 *
 *  Example: `const lookup = useProfileLookup({ api, shownUsername: card.username, onFound: setFound });` */
export function useProfileLookup(options: ProfileLookupOptions): ProfileLookup {
  const [typed, setTyped] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const found = (username: string): void => {
    setTyped(username);
    setRefusal(null);
  };
  const lookUp = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const text = typed.trim();
    if (text === '') return;
    const username = profileLookupParamsDto.safeParse({ username: text }).data?.username;
    if (username === undefined) return setRefusal(notFoundText(text));
    if (username === options.shownUsername) return found(username);
    const result = await options.api.cardByUsername(username);
    if (!result.ok) return setRefusal(profileLookupFailureText(result.failure, text));
    found(result.value.username);
    options.onFound(result.value);
  };
  const form = { typed, onType: setTyped, onSubmit: lookUp, refusal };
  return { form, reset: () => found('') };
}

function notFoundText(text: string): string {
  return profileLookupFailureText({ kind: 'user_not_found' }, text);
}
