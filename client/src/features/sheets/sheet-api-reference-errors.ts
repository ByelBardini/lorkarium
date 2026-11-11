import { SHEET_DICE_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import type { ReferenceRow } from './sheet-api-reference-content';

/** The codes a request of the frame may reject with, as the reference's table shows them. */
export const SHEET_ERROR_CODES: readonly ReferenceRow[] = [
  [
    'FORBIDDEN',
    'Quem olha não pode editar esta ficha (canEdit: false) ou a mesa recusou o pedido.',
  ],
  [
    'OFFLINE',
    'Sem conexão com o servidor. Um values.set recusado assim fica guardado e é reenviado sozinho quando a conexão volta.',
  ],
  ['NO_TOKEN', 'A ficha não está ligada a um token (token: null), então não há barra para mudar.'],
  ['BAR_NOT_FOUND', 'Nenhuma barra do token tem esse nome ou id.'],
  ['BAR_AMBIGUOUS', 'Duas ou mais barras têm esse nome: use o id (veja "Como achar a barra").'],
  [
    'RATE_LIMITED',
    `Pedidos demais em pouco tempo (dados: mais de ${SHEET_DICE_RATE.limit} em ${SHEET_DICE_RATE.windowMs / 1000} s). Espere e tente de novo.`,
  ],
  ['INVALID_DICE_EXPRESSION', 'A notação do dado não foi entendida (a message diz o porquê).'],
  [
    'PREVIEW_ONLY',
    'Na prévia do editor os dados não rolam (abra a ficha de um token na sala), e sem a mesa aberta os documentos não são lidos.',
  ],
  [
    'INVALID_MESSAGE',
    'O pedido está fora do formato: chave de valor inválida, mudança de barra errada, expressão vazia… A message cita o problema.',
  ],
  ['NOT_FOUND', 'A ficha foi fechada ou desligada enquanto o pedido estava a caminho.'],
  [
    'PERMISSION_NOT_DECLARED',
    'O modelo não declarou no manifesto a permissão que a função exige (a message diz qual). Valores, barras e dados não precisam.',
  ],
  [
    'NO_CHARACTER',
    'A ficha não é de um personagem (token solto ou sem dono): não há CA, CD nem retrato para gravar.',
  ],
  [
    'INSUFFICIENT_BAR',
    'Uma barra não tem saldo para o bars.spend; nenhuma mudou. A message cita a barra, o saldo e o custo.',
  ],
  [
    'BAR_LIMIT',
    'O dono já tem o máximo de barras: o bars.create não criou nada. A message cita a barra e o limite.',
  ],
  ['SHEET_HAS_NO_TOKEN', 'A ficha não está com ninguém: o bars.create não tem onde criar a barra.'],
  ['ASSET_NOT_FOUND', 'A imagem não existe ou quem olha não pode lê-la.'],
  [
    'DOCUMENT_NOT_FOUND',
    'O documento não existe ou não é público (oculto ou numa pasta oculta). Vale igual para o mestre.',
  ],
  ['DOCUMENT_TAB_NOT_FOUND', 'A aba não existe nesse documento ou é só do mestre.'],
  ['TOO_LARGE', 'A imagem passa do limite de tamanho.'],
  ['UNSUPPORTED_IMAGE', 'O arquivo não é uma imagem PNG, JPEG ou WebP que o servidor leia.'],
  ['UNEXPECTED', 'Resposta inesperada do servidor. Outros códigos do servidor chegam como vieram.'],
];
