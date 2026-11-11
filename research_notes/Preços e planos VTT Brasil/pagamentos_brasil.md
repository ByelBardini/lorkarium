# Recurring billing of Brazilian consumers for a small SaaS (hobbyist VTT): payment methods, gateways, tax, pricing conventions, consumer law (as of 2026-11-10)

Research note scope: ~17 search/fetch calls. Many fee figures come from aggregators/blogs because official pricing pages were truncated or not returned; each such case is flagged. Verify official pages before deciding.

## Pix Automático: status, adoption, gateway support, fees

### Takeaway

Pix Automático has been live since June 2025 and mandatory for all banks since January 2026, but adoption one year in is modest (about R$ 1.2 bi/month by May 2026, under 3 million transactions/month). Big subscription brands (Netflix, Disney+, Globoplay, Amazon) accept it. Iugu, Efí, Mercado Pago, Asaas, Pagar.me and Ebanx are cited as supporting it, but I found no published per-transaction Pix Automático fee for any gateway.

### Cited Findings

- Became mandatory for all banks in January 2026; about R$ 4.5 bi accumulated in 2026 through June, around R$ 1.2 bi/month — [Let's Money](https://www.letsmoney.com.br/noticias/pix-automatico-1-ano-1-bilhao-mes/); [Monitor Mercantil](https://monitormercantil.com.br/pix-automatico-passa-a-ser-obrigatorio-a-partir-de-hoje/)
- BC payment statistics: R$ 3.5 bi in 9.5 million transactions in 2Q26 — [Finsiders Brasil](https://finsidersbrasil.com.br/giro-noticias/pix-automatico-cresce-no-1o-semestre-de-2026-diz-bc/). This conflicts with the R$ 4.5 bi YTD figure; the difference is probably the period or method, not confirmed.
- Finsiders, 16 Jun 2026, "Um ano depois, Pix Automático ainda não pegou":
  - Monthly volume grew from R$ 568.7 mi (Jan 2026) to over R$ 1.2 bi (May 2026).
  - Monthly transactions grew from 919 thousand (Jan) to "2.870 milhões" in May. This is probably meant as about 2.87 million, and the printed figure looks like a typo.
  - B2B is under 5% of transactions but about 90% of the money moved.
  - Barriers: an initial opt-in is needed, and the debit needs real balance in the account (cheque especial/overdraft cannot be used). Consumers see no clear advantage over débito automático or a recurring card, have no economic incentive to switch, and have trust concerns.
  - Netflix, Disney+, Globoplay, Amazon, Grupo OLX, Vivo and Cemig are cited as accepting it.
  - Ebanx says it processes 38% of all Pix Automático transactions in Brazil, and that 64% of Pix Automático payers are new digital subscribers.
  - Source: [Finsiders Brasil](https://finsidersbrasil.com.br/pagamentos/pix/um-ano-depois-pix-automatico-ainda-nao-pegou-e-ha-um-motivo/)
- Itaú: Pix Automático volume rose 281% in 1H26 over the previous six months, and the number of payers who activated it rose 185%. This is single-bank data — [Let's Money](https://www.letsmoney.com.br/noticias/pix-automatico-itau-cresce-281/)
- How it works: the payer authorizes once and sets a maximum amount per charge in the bank app. No convênio (agreement) between the company and the payer's bank is needed — [Finsiders Brasil](https://finsidersbrasil.com.br/pagamentos/pix/um-ano-depois-pix-automatico-ainda-nao-pegou-e-ha-um-motivo/)
- Rule design from a BCB Fórum Pix deck (Dec 2023, may have changed since): the charge must be sent between 10 and 2 calendar days before the settlement date. Retries are allowed up to D+7, on at most three dates — [BCB Fórum Pix PDF](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Forum_Pix_Plenaria/20231207-Forum_Pix.pdf)
- Resolução BCB 425/2024 governs retries when a debit fails for insufficient funds — [Legisweb](https://www.legisweb.com.br/legislacao/?id=466705)
- Cancellation:
  - The payer can cancel at any time through their own bank, and the receiver can also cancel — [Canaltech](https://canaltech.com.br/internet/pix-automatico-tem-regras-divulgadas-pelo-banco-central-272691/)
  - Under Resolução BCB 360/2023, the payer's bank must cancel the authorization when the receiver asks — [Lex](https://www.lex.com.br/resolucao-bacen-no-360-de-7-de-dezembro-de-2023/)
- Official BCB guide to Pix Automático — [bcb.gov.br guia PDF](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/automatico/guia_pix_automatico.pdf)
- September 2026 rule changes: Resolução BCB 587 allows Pix Automático on contas-salário from 1 Jul 2027 — [Mercado & Consumo](https://mercadoeconsumo.com.br/18/09/2026/meios-de-pagamento/pix-tera-novas-regras-para-fraudes-cobranca-hibrida-e-contas-salario/)
- Gateway support:
  - Iugu offers two API models: its own recurrence engine, or the client's system runs the recurrence and Iugu only processes the charges — [Iugu guia](https://marketing.iugu.com/guiapixautomatico)
  - Efí (Gerencianet) integration for Pix Automático is documented in an ERP wiki — [HubSoft wiki](https://wiki.hubsoft.com.br/pt-br/modulos/configuracao/integracao/pix/pix_automatico/gerencianet)
  - Recurly supports Pix Automático only through Ebanx — [Recurly docs](https://docs.recurly.com/recurly-subscriptions/docs/pix-automatico)
  - Adyen supports it — [Adyen](https://www.adyen.com/pt_BR/centro-de-conhecimento/pix-automatico-jornada-adyen-proximos-passos)
  - A blog table lists Mercado Pago, Asaas and Pagar.me as available for D2C sites. This is not a primary source — [GoSmarter](https://gosmarter.com.br/?p=13745)
- Cost: a PagBrasil case study claims Pix Automático cost about 50% less than card. This is a vendor claim — [Let's Money](https://www.letsmoney.com.br/noticias/pagbrasil-pix-automatico-um-ano-recorrencia/)

### Inferences

- For a hobbyist SaaS, Pix Automático is a useful extra option for card-less users, but it cannot be the only way to pay monthly: most consumers still haven't opted in, and a debit fails when the payer's balance is low.
- Gateways will probably price Pix Automático like an ordinary Pix receipt (a fixed fee of about R$ 1–2, or about 1%), but this is not confirmed.

### Gaps

- No official per-gateway Pix Automático fee was found: Asaas's pricing page did not list it, and Mercado Pago, Efí, Iugu and Pagar.me pages were not checked or returned no fee.
- No official BCB count of active authorizations or of receivers.
- The current text of the prior-notification rules (IN BCB 513/2024 and the user-experience minimum-requirements manual) was not read.

## Gateways for recurring billing: fees for card, Pix, boleto, parcelamento, monthly fees

### Takeaway

Rough market range: recurring card about 3–5% plus R$ 0.40–0.50 per charge, Pix 0–1.2% or R$ 1–2 fixed, boleto R$ 1.8–3.5. None of the gateways found charges a monthly fee by default. The infoproduct platforms (Hotmart, Kiwify, Eduzz) cost far more per sale (5–10% plus R$ 1–2.49).

### Cited Findings

**Asaas**

- Third-party read of 16 Oct 2026, standard fees: R$ 1.99 per Pix or boleto received, card à vista R$ 0.49 + 2.99%. Promo for 3 months: R$ 0.99 per Pix/boleto, card R$ 0.49 + 1.99%. No monthly fee and no setup fee — [Quasa](https://quasa.io/pt/media/asaas-ou-iugu-tarifa-publicada-vence-ate-o-volume-pedir-proposta)
- The official pricing page (fetched 10 Nov 2026) showed Pix and boleto at R$ 2.15 / R$ 1.08. The page doesn't say which is standard and which is promo; the lower one is likely promo. Debit card: R$ 0.35 + 1.89%. Account and charge management are free, with "zero mensalidade e taxa de emissão" — [Asaas preços](https://www.asaas.com/precos-e-taxas)
- The search snippet of the same page shows Pix R$ 1.99 / promo R$ 0.99 for 3 months. It also says installment and subscription fees apply to the total sale value — [Asaas preços](https://www.asaas.com:443/precos-e-taxas). The two reads of this page conflict on Pix price, probably because the price changed or a promo varies.
- Partner page (promo): boleto R$ 1.79, Pix R$ 0.00, credit card 2.75% + R$ 0.49 — [Asaas parceiros](https://asaas.com/parceiros/startuplife)
- Recurring card: the card is charged on each due date. Card money arrives 32 days after each installment is confirmed; boleto money in 1 business day — [Asaas cartão](https://www.asaas.com/cobranca-cartao)

**Mercado Pago**

- Recurring card fee depends on how fast you take the money: 4.99% immediate, 4.49% in 14 days, 3.99% in 30 days — [Mercado Pago blog](https://www.mercadopago.com.br/blog/como-receber-pagamentos-recorrentes)
- Subscription plans accept card, Pix and boleto, with automatic retries — [MP developers](https://www.mercadopago.com.br/developers/pt/docs/subscription-plans/landing)
- Third-party calculator: Pix on payment links from 0.99%, Pix QR free — [Calculadora de Taxas](https://www.calculadoradetaxas.com.br/mercado-pago)
- Official fee table — [MP tabela](https://www.mercadopago.com.br/knowledge-hub/tabela-taxas-tarifas_45243). Not read.

**Stripe Brasil**

- Card 3.99% + R$ 0.50 per transaction, from older/third-party sources — [Remessa Online](https://www.remessaonline.com.br/blog/stripe/); [Startups.com.br](https://startups.com.br/negocios/sem-alarde-stripe-comeca-finalmente-a-atender-empresas-brasileiras-mas-ainda-em-beta/)
- Sources conflict on whether Brazilian Stripe accounts accept Pix and boleto natively — [Tecnoblog comunidade](https://tecnoblog.net/comunidade/t/stripe-chegou-no-brasil-uma-mudanca-no-mercado-ou-mais-do-mesmo/13148)
- For Brazilian accounts, Stripe fees include indirect taxes — [Stripe support](https://support.stripe.com/questions/taxes-on-stripe-fees-for-brazil-based-businesses)
- Billing features page — [Stripe Billing BR](https://stripe.com/br/billing/subscriptions). It lists no fees; Stripe Billing usually adds about 0.7% of billing volume, but this was not verified for Brazil.

**Pagar.me**

- Aggregator figures: card 3.99% + R$ 0.40, boleto R$ 3.49 — [Nuvemshop](https://www.nuvemshop.com.br/blog/gateway-de-pagamento-mais-barato/)
- Another aggregator: Pix 1.19%, card à vista 4.39% received in 15 days, boleto R$ 3.49 — [iDinheiro](https://www.idinheiro.com.br/negocios/melhores-gateways-de-pagamento/)
- The two aggregators conflict.

**PagBank**

- July 2026 aggregator figures: credit à vista 2.92%, credit 12x 12.36%, Pix free. These are the lowest tiers and vary with volume and how fast the money is received — [Calculadora de Taxas](https://www.calculadoradetaxas.com.br/pagbank)
- Another source says PagBank does charge on Pix — [cartoesdecredito.me](https://www.cartoesdecredito.me/contas/taxas-cobradas-nos-apps-de-pagamentos-em-2026/)

**Iugu, Efí, Vindi**

- No fee figures found. Iugu is listed among the cheapest gateways without numbers, and Vindi belongs to Totvs — [Nuvemshop](https://www.nuvemshop.com.br/blog/gateway-de-pagamento/)

**Hotmart**

- 9.9% + R$ 1.00 per sale. The fixed part rises to R$ 2.49 on 21 Sep 2026.
- Subscriptions: R$ 2.49 on the first charge plus R$ 0.50 on each renewal (alongside the %).
- Can drop to 8.9% for high revenue.
- Source: [Vini Ensina](https://viniensina.com.br/?p=4267); [Freelas em Crise](https://www.freelasemcrise.com.br/blog/hotmart-kiwify-eduzz-comparativo). Blogs, some with affiliate links.

**Kiwify**

- 8.99% + R$ 2.49 per approved sale, no monthly fee — same sources as Hotmart.

**Eduzz**

- Direct sale 4.9% + R$ 2.49, or 4.9% + R$ 1 in other sources (conflict). Affiliate sale 8.9% + R$ 2.49.
- Withdrawal fees: Eduzz R$ 9, Hotmart R$ 1.99, Kiwify R$ 3.67.
- Source: [HeroSpark](https://herospark.com/guias/taxas-e-margem); [Tactus](https://tactus.com.br/taxas-da-eduzz/amp/)

### Inferences

- Example monthly cost on a R$ 19.90 plan:
  - Asaas card at 2.99% + R$ 0.49 is about R$ 1.08, or 5.4% of the price.
  - Asaas Pix at R$ 1.99 is 10% of the price.
  - Hotmart at 9.9% + R$ 2.49 is about R$ 4.46, or 22% of the price.
- Fixed per-charge fees make very cheap monthly plans proportionally expensive. This pushes toward semiannual or annual plans, or toward Pix percentage pricing where available.
- For a developer-built SaaS, API-first gateways (Asaas, Pagar.me, Iugu, Mercado Pago, Stripe) fit better than infoproduct platforms, which are built for courses.
- Parcelamento (installments) of annual plans: when the seller absorbs installments ("sem juros"), the gateway charges a higher installment rate or an anticipation discount. PagBank's 12.36% for 12x is a reference point for the cost of offering 12x sem juros with immediate receipt.

### Gaps

- Official installment tables (2–6x, 7–12x) for Asaas, Mercado Pago and Pagar.me not retrieved.
- No fees found for Efí, Iugu, Vindi or PagBank recurring.
- Stripe Brasil's official current pricing for Pix, boleto and Billing not confirmed.

## Tax: MEI, Simples Nacional, ISS on SaaS, NFS-e, IBS/CBS 2026, IOF on USD charges

### Takeaway

Software development and SaaS are not allowed as MEI activities. A solo dev selling SaaS normally opens an ME in the Simples Nacional:

- SaaS / standard software licensing usually falls in Anexo V (about 15.5% initial rate).
- It moves to Anexo III if Fator R (payroll/pro-labore to revenue) is at least 28%.

The STF settled that ISS (not ICMS) applies to software licensing, including SaaS. The 2026 IBS/CBS phase is a 1% test that is offset against PIS/Cofins; several sources say Simples companies are not subject to it in 2026. Brazilians paying a foreign service in USD by card pay 3.5% IOF.

### Cited Findings

- No software-development activity is on the MEI list of allowed occupations. Using a permitted CNAE to cover it can lead to retroactive exclusion and fines — [Contabilidade.com](https://contabilidade.com/blog/dev-pode-ser-mei-em-2026-veja-como-abrir-seu-cnpj-corretamente-e-pagar-menos-impostos/); [Contabilidade.com](https://contabilidade.com/blog/programador-pode-ser-mei)
- CNAE for SaaS — sources diverge:
  - 6203-1/00 (licensing of non-customizable software) for standard SaaS — [Agilize](https://artigos.agilize.com.br/cnae-desenvolvedor-software-simples-nacional/)
  - 6202-3/00 or 6201-5/00 suggested by other articles — [Agilize](https://agilize.com.br/artigos/melhor-cnae-para-programador-2026); [Contabilivre](https://www.contabilivre.com.br/blog/?p=4610)
- Licensing of non-customizable software (SaaS) is in Anexo V with an initial rate of about 15.5%, and can move to Anexo III when Fator R is at least 28% — [Agilize](https://artigos.agilize.com.br/cnae-desenvolvedor-software-simples-nacional/)
- STF case law on ISS:
  - Tema 590 (RE 688223, judged 06/12/2021): ISS applies to licensing or right-of-use of custom software, under subitem 1.05 of LC 116/03.
  - ADIs 1945 and 5659: whether software is standard or custom is irrelevant; ISS applies, not ICMS.
  - The court recognized service provision in the SaaS model. Support and updates can be split out under subitems 1.03 and 1.07.
  - Source: [Mattos Filho](https://www.mattosfilho.com.br/unico/stf-iss-licenciamento-de-softwares/); [Trilhante Tema 590](https://informativos.trilhante.com.br/temas-stf/tema-590-stf); [Senado ADI 5659](https://legis.senado.leg.br/norma/34722497/publicacao/34722533)
- 2026 IBS/CBS test phase (LC 214/2025): CBS 0.9% plus IBS 0.1% = 1%, offset against PIS/Cofins, so there is no net increase — [BMA](https://www.bmalaw.com.br/conteudo/direito-tributario/bma-review/bma-review-89/bma-review-89-estreia-do-ibs-e-cbs-papel-estrategico-das-obrigacoes-acessorias/pdf); [Cora](https://www.cora.com.br/blog/reforma-tributaria/)
- Simples Nacional and MEI companies are not subject to the test rates in 2026 — [Brasil 61](https://brasil61.com/n/reforma-tributaria-veja-as-principais-mudancas-cacb260110); [Cora](https://www.cora.com.br/blog/reforma-tributaria/)
- The national-standard NFS-e now carries CBS/IBS fields for all regimes — [Monitor Mercantil](https://monitormercantil.com.br/os-impactos-da-reforma-tributaria-no-simples-nacional/)
- Sources conflict on the date the CBS/IBS fields become mandatory: from 01/04 per [HubSoft](https://wiki.hubsoft.com.br/pt-br/modulos/nota-fiscal/reforma-tributaria), versus an adaptation period without penalties per [BPMoney](https://bpmoney.com.br/?p=388804)
- In SaaS, payroll does not generate IBS/CBS credits, which matters for B2B buyers (not for consumer sales) — [AmdJus](https://amdjus.com.br/reforma-tributaria-2026-credito-fiscal-vira-fator-de-competitividade-em-saas/)
- Sebrae ebook on the reform for small businesses — [Sebrae](https://sebrae.com.br/Sebrae/Portal%20Sebrae/Reforma%20tributaria/CTDs/Reforma_Tribut%C3%A1ria_Pequenos_Neg%C3%B3cios_-_ebook.pdf)
- IOF on international card purchases (credit, debit, prepaid) is 3.5% since mid-2025:
  - Rate rose from 3.38%; Decreto 12.499/2025.
  - STF in ADC 96 (16 Jul 2025) upheld the decree, except for risco sacado.
  - No reduction schedule is currently in force; the older phase-down to 0% by 2028 was interrupted.
  - Source: [ARQ Finance](https://arqfinance.com/articles/aliquota-iof-compras-exterior-cartao); [InfoMoney](https://www.infomoney.com.br/?p=2909239)
- Some banks waive this IOF, e.g. BTG (from Aug 2025) and Nubank, per ARQ Finance — [BP Money](https://bpmoney.com.br/negocios/empresas/btg-pactual-anuncia-iof-zero-para-compras-internacionais/)

### Inferences

- A Brazilian VTT charging in BRL through a Brazilian CNPJ has a structural price edge over foreign VTTs charging in USD (Roll20, Foundry, D&D Beyond). The Brazilian user saves the 3.5% IOF plus the card's FX spread, and can pay by Pix or boleto, which foreign VTTs usually don't offer.
- Expected all-in tax for a solo SaaS in the Simples: about 15.5% of revenue in Anexo V. Paying a pro-labore to reach Fator R ≥ 28% would allow Anexo III, which starts at 6% (the 6% figure is general knowledge, not verified in this research). A contador should confirm.
- The NFS-e national standard means an NFS-e per charge (or per period). Many gateways (e.g. Asaas) offer automatic NFS-e issuance tied to the charge; Asaas's fee for that was not found.

### Gaps

- The official Receita/Portal do Empreendedor MEI occupation list was not checked directly; only accounting blogs.
- The ISS rate for SaaS in a specific municipality was not researched. The 2–5% band is general knowledge, not verified here.
- The current Simples Anexo III/V brackets were not read from an official table.
- How the Simples will handle IBS/CBS from 2027 onward was not researched.

## Brazilian pricing conventions: R$ x,90 prices, annual Pix discount, 12x sem juros, semiannual plans

### Takeaway

Real-world reference prices consistently end in ,90 (R$ 12,90, R$ 19,90, R$ 23,90, R$ 44,90). Annual plans are typically priced at about 10 months of the monthly price (Spotify: R$ 239/year vs R$ 23,90/month, about 17% off). I found no sourced data on how common semiannual plans are or on typical extra discounts for Pix.

### Cited Findings

- Spotify Individual R$ 23,90/month and annual R$ 239 (about R$ 19,92/month). Universitário R$ 12,90, Duo R$ 31,90, Família R$ 40,90 — [Spotify BR prepaid](https://www.spotify.com/br/promo/prepaid/)
- Crunchyroll Fan R$ 19,90 and Mega Fan R$ 24,90 (after the Feb 2026 increase); Netflix R$ 20,90 / R$ 44,90 / R$ 59,90 — [Game Over Drive](https://gameoverdrive.com.br/quanto-custa-todos-streamings-2026/)
- Game Pass Ultimate R$ 76,90, Premium R$ 59,90, Essential R$ 43,90, but PC Game Pass R$ 59,99 — [Estado de Minas](https://www.em.com.br/tecnologia/2026/04/7402947-xbox-game-pass-reduz-preco-no-brasil-apos-alta-polemica.html). This shows ,90 is dominant though not universal.
- Asaas notes that installment and subscription fees apply to the total sale value — [Asaas preços](https://www.asaas.com:443/precos-e-taxas). This matters when offering 12x on an annual plan.
- PagBank credit 12x costs 12.36% — [Calculadora de Taxas](https://www.calculadoradetaxas.com.br/pagbank). This is the cost basis for absorbing "12x sem juros".

### Inferences

- A defensible structure for a Brazilian hobbyist SaaS:
  - Monthly at R$ x,90.
  - Annual at about 10x the monthly price, paid à vista by Pix or card.
  - Annual also offered in "até 12x" on card. "Sem juros" costs about 12% if the money is taken at once, or about 3–4% if received per installment.
- Semiannual plans are common in gyms and courses in Brazil (general knowledge, not sourced here). They are a middle option that cuts the per-charge fixed fee.

### Gaps

- No source found for the prevalence of semiannual plans, for the typical "desconto no Pix" on annual plans (often cited informally as 5–10%), or for consumer research on R$ x,90 pricing.

## Reference prices of digital subscriptions in Brazil (2026)

### Takeaway

Entry-level digital subscriptions in Brazil sit at about R$ 13–27/month; premium tiers run R$ 45–77. A hobbyist VTT at R$ 9,90–19,90/month would be in the lowest band.

### Cited Findings

- **Netflix:**
  - 2026 comparison: Padrão com anúncios R$ 20,90, Padrão sem anúncios R$ 44,90, Premium R$ 59,90 — [Game Over Drive](https://gameoverdrive.com.br/quanto-custa-todos-streamings-2026/)
  - A later increase of up to 13% (Tecnoblog, undated, mentions Upfront 2026): com anúncios R$ 25,90, Premium R$ 71,90 — [Tecnoblog](https://tecnoblog.net/noticias/netflix-fica-mais-cara-no-brasil-premium-chega-a-r-7190/). This is probably the current price; to confirm.
  - Netflix has no annual plan in Brazil (general knowledge).
- **Spotify:** Individual R$ 23,90/month or R$ 239/year; Universitário R$ 12,90; Duo R$ 31,90; Família R$ 40,90. The last Brazilian increase was Aug/Sep 2025 — [Spotify BR](https://www.spotify.com/br/promo/prepaid/); [Tecnoblog](https://tecnoblog.net/noticias/spotify-premium-fica-mais-caro-no-brasil-veja-os-novos-precos/)
- **YouTube Premium:** individual R$ 26,90; another plan R$ 53,90. Undated, possibly outdated — [Fast Company Brasil](https://fastcompanybrasil.com/money/streaming-no-brasil-veja-quanto-custa-assinar-os-maiores-servicos-juntos/)
- **Xbox Game Pass** (since 21 Apr 2026):
  - Ultimate R$ 76,90/month, down from R$ 119,90 after a backlash with Procon complaints.
  - PC Game Pass R$ 59,99; Premium R$ 59,90; Essential R$ 43,90.
  - Source: [Estado de Minas](https://www.em.com.br/tecnologia/2026/04/7402947-xbox-game-pass-reduz-preco-no-brasil-apos-alta-polemica.html); [Tecnoblog](https://tecnoblog.net/noticias/xbox-game-pass-ultimate-fica-36-mais-barato-no-brasil/); [Hardware.com.br](https://www.hardware.com.br/?p=332306)
- **Crunchyroll:** Fan R$ 19,90/month, Mega Fan R$ 24,90/month (Feb 2026) — [Game Over Drive](https://gameoverdrive.com.br/quanto-custa-todos-streamings-2026/)

### Inferences

- The Game Pass case (a 100% increase followed by a partial rollback in 2026) shows that Brazilian gamers are price-sensitive and react strongly to steep increases.

### Gaps

- Discord Nitro, Duolingo Super/Max and Canva Pro BRL prices were not found within this research budget; check discord.com, duolingo.com and canva.com/pt_br/precos.
- Annual prices for YouTube Premium, Crunchyroll and Game Pass not found.

## Consumer protection: 7-day withdrawal right, auto-renewal and cancellation, LGPD

### Takeaway

CDC art. 49 gives a 7-day right of withdrawal (direito de arrependimento) with refund for online contracts. Auto-renewal is not banned, but it is considered abusive without clear, prior, informed consent. Cancellation must be offered through the same channel used to sign up. I found no new Senacon regulation from 2024–2026 specific to digital subscriptions; a bill requiring 30-day notice before renewals of 12 months or more was approved in a Câmara committee and is not law.

### Cited Findings

- Auto-renewal without the customer's express, informed consent is considered abusive, and Idec argues consent should always be express — [Idec](https://idec.org.br/em-acao/em-foco/renovacao-automatica-de-assinaturas-e-considerada-pratica-abusiva); [MPMG administrative decision](https://www.mpmg.mp.br/data/files/33/95/26/46/AEE9C9103E1129C9B9A8F9C2/Dec%20Adm_CDC_Realizar%20a%20renovacao%20automatica%20e_anonymous.pdf)
- Cancellation:
  - Online contracting must allow cancellation by the same channel.
  - Refusing or making cancellation excessively hard is an abusive practice.
  - Within 7 days of an online contract the arrependimento right guarantees a refund; after that, refunds of months already charged depend on company policy.
  - Source: [Guardar Dinheiro](https://www.guardardinheiro.com.br/blog/como-cancelar-assinaturas-direitos); [InfoMoney](https://www.infomoney.com.br/?p=3109974)
- Decreto 11.034/2022 (the SAC decree) requires immediate cancellation, but only for regulated services such as telecom, pay-TV, banks and health plans — [Correio Braziliense](https://www.correiobraziliense.com.br/cidades-df/2025/10/7273075-contrato-renovado-sem-sua-autorizacao-saiba-o-que-fazer.html)
- Pending bill: renewals of 12 months or more would need at least 30 days' notice. Approved in the Câmara consumer committee; final status not confirmed — [Guardar Dinheiro](https://www.guardardinheiro.com.br/blog/como-cancelar-assinaturas-direitos)
- Pix Automático: the payer can revoke the authorization any time through their own bank — [Canaltech](https://canaltech.com.br/internet/pix-automatico-tem-regras-divulgadas-pelo-banco-central-272691/)

### Inferences

- Practical compliance for a VTT:
  - Self-service cancellation in the app.
  - Clear auto-renewal disclosure at checkout.
  - Refunds within 7 days of the first payment.
  - A renewal reminder email before annual renewals. This is good practice anticipating the bill, and an annual plan gives the strongest reason to send one.
- Free trials of 7 days don't remove the arrependimento right on the first paid charge (InfoMoney discusses this).
- LGPD: if card data is tokenized by the gateway (PCI scope stays with the gateway), the SaaS stores only the token, payment status, CPF/CNPJ for the NFS-e and email. Collecting CPF for the nota fiscal needs a legal basis (legal obligation) and a disclosure in the privacy policy. These are inferences; no LGPD-specific payment source was retrieved.

### Gaps

- No ANPD/LGPD guidance on payment data was retrieved.
- No current Senacon/Procon 2024–2026 normative act on digital subscriptions was found; consumidor.gov.br and the Ministério da Justiça site were not checked.
- The exact text and number of the 30-day-notice bill (PL) were not identified.
