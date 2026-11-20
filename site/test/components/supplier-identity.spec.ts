import { describe, expect, it } from 'vitest';
import SupplierIdentity from '@/components/supplier-identity.astro';
import { renderAstro, renderAstroHtml } from '../support/render-astro';

// The values site/vitest.config.ts puts in LEGAL_SUPPLIER_NAME and LEGAL_SUPPLIER_CPF.
const TEST_CPF_DIGITS = '52998224725';
const TEST_CPF_FORMATTED = '529.982.247-25';

describe('the supplier identity block of the terms', () => {
  it('names the supplier, the masked CPF, the trade name, the city and the contact e-mail', async () => {
    const page = await renderAstro(SupplierIdentity);
    const address = page.querySelector('address');

    expect(address?.textContent).toContain('Fornecedora de Teste');
    expect(address?.textContent).toContain('***.982.247-**');
    expect(address?.textContent).toContain('Evolutiva Sistemas');
    expect(address?.textContent).toContain('Orleans/SC');
    expect(address?.querySelector('a[href="mailto:contato@lorkarium.test"]')).not.toBeNull();
  });

  it('never writes the full CPF into the HTML', async () => {
    const html = await renderAstroHtml(SupplierIdentity);

    expect(html).not.toContain(TEST_CPF_DIGITS);
    expect(html).not.toContain(TEST_CPF_FORMATTED);
  });
});
