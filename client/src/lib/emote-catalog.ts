/** A smiley is drawn at the text's size; a meme a little bigger. */
export type EmoteKind = 'smiley' | 'meme';

/** One picture the chat draws in place of its codes. `id` names the image file
 *  (`src/emotes/images/<id>.png`); the first code is the one the picker inserts. */
export type Emote = Readonly<{
  id: string;
  kind: EmoteKind;
  codes: readonly string[];
  /** Words the picker and the `:` list also find it by (pt-BR). */
  keywords: readonly string[];
}>;

function smiley(id: string, codes: readonly string[], keywords: readonly string[]): Emote {
  return { id, kind: 'smiley', codes, keywords };
}

function meme(id: string, codes: readonly string[]): Emote {
  return { id, kind: 'meme', codes, keywords: [] };
}

/** Every smiley, in the picker's order. */
export const SMILEYS: readonly Emote[] = [
  smiley('smile', ['=)', ':-)', ':)', ':]', '=]', ':smile:'], ['sorriso']),
  smiley('frown', ['=(', ':-(', ':(', ':[', '=[', ':sad:'], ['triste']),
  smiley(
    'surprised',
    [':O', ':-O', ':-o', ':o', '=O', '=0', ':0', ':-0', '=o', ':wow:'],
    ['espantado'],
  ),
  smiley('grin', [':-D', ':D', '=D', ':grin:'], ['sorrisao']),
  smiley('tongue', [':-P', ':P', ':-p', ':p', '=p', '=P', ':tongue:'], ['lingua']),
  smiley('wink', [';)', ';-)', ';]', ':wink:'], ['piscada']),
  smiley('giggle', [':3', '=3', ':-3', ':giggle:'], ['risadinha']),
  smiley('kiss', ['=*', ':*', ':-*', ':kiss:'], ['beijo']),
  smiley('sunglasses', ['8-)', '8)', 'B-)', 'B)', '8D', ':cool:'], ['oculos']),
  smiley('flushed', ['o.O', 'O.o', 'oO', 'Oo', ':flushed:'], ['confuso']),
  smiley('pacman', [':v', ':V', '=v', '=V', ':-v', ':-V', ':pacman:'], []),
  smiley('expressionless', ['-_-', ':meh:'], ['sem paciencia']),
  smiley('angel', ['O:)', 'O:-)', 'O=D', 'O=)', ':angel:'], ['anjo']),
  smiley('devil', ['3:)', '(6)', '3:-)', '3=)', '3=]', ':devil:'], ['capetinha']),
  smiley('unsure', ['=/', ':/', '=\\', ':\\', ':-\\', ':-/', ':unsure:'], ['incerto']),
  smiley('tear', ["='(", ":'(", ':cry:'], ['choro']),
  smiley('happy', ['^_^', '^^', ':happy:'], ['feliz']),
  smiley('sob', ['T.T', ':sob:'], ['chorando']),
  smiley('laugh', ['xD', 'XD', ':laugh:'], ['rindo']),
  smiley('starstruck', ['*.*', ':starstruck:'], ['encantado']),
  smiley('heart', ['<3', 'S2', ':heart:'], ['coracao']),
  smiley('poop', [':poop:'], ['coco']),
  smiley('thumbs-up', ['(Y)', '(y)', ':like:'], ['joinha']),
  smiley('thumbs-down', [':dislike:'], ['deslike']),
  smiley('eyes', [':eyes:'], ['olhos']),
];

/** Every meme, in the picker's order. */
export const MEMES: readonly Emote[] = [
  meme('trollface', [':trollface:', ':troll:']),
  meme('okayface', [':okayface:', ':okay:']),
  meme('lolface', [':lolface:', ':lol:']),
  meme('megusta', [':megusta:', ':megustaface:']),
  meme('pokerface', [':pokerface:', ':pf:']),
  meme('genius', [':geniusface:', ':genius:']),
  meme('yeahh', [':yeahh:']),
  meme('truestory', [':truestory:', ':truestoryface:']),
  meme('kiddingme', [':tazuando:', ':serio?:', ':kiddingme:', ':kiddingmeface:', ':kidme:']),
  meme('foreveralone', [':foreveralone:', ':foreveraloneface:', ':alone:']),
  meme('notbad', [':notbad:']),
  meme('rageguy', [':rageface:', ':rage:']),
  meme('vish', [':vishface:', ':vish:']),
  meme('yaoming', [':naoligo:', ':nemligo:', ':yao:', ':ming:', ':yaoming:']),
  meme('wtf', [':wtf:']),
  meme('ohgodwhy', [':ohgodwhy:', ':godwhy:', ':ohgod:', ':ohwhygod:', ':whygod:']),
  meme('disdain', [':desprezo:', ':desprezoinfinito:']),
  meme('awyeah', [':awyeah:', ':awyeahh:']),
  meme('huehue', [':huehue:', ':hue:', ':hu3:']),
  meme('dinofauro', [':dinofauro:', ':fauro:', ':dino:']),
  meme('doge', [':doge:']),
  meme('pikachu', [':pikachu:']),
];

/** Smileys first, then memes. */
export const EMOTES: readonly Emote[] = [...SMILEYS, ...MEMES];

/** A `:name:` code: matched without case (`:Troll:` is `:troll:`), and the only kind the `:`
 *  list offers.
 *
 *  Example: `isNamedEmoteCode(':troll:') // true; isNamedEmoteCode(':)') // false` */
export function isNamedEmoteCode(code: string): boolean {
  return /^:[^\s:]{2,}:$/u.test(code);
}
