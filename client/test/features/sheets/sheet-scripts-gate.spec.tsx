import { PLAN_LIMITS, type PlanLimits } from '@lorkarium/contracts';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sheetScriptsNotice, useSheetScriptsNotice } from '@/features/sheets/sheet-scripts-gate';
import type { SheetSource } from '@/sheet-sandbox/sheet-srcdoc';
import { onTablePlan } from '../../support/table-plan';

describe('sheetScriptsNotice', () => {
  it('on a Grátis table it says the scripts do not run and where they do', () => {
    expect(sheetScriptsNotice(PLAN_LIMITS.free)).toBe(
      'Os scripts deste modelo não rodam no plano Grátis. Disponível no plano Narrador',
    );
  });

  it('on an Apoiador table it names that plan', () => {
    expect(sheetScriptsNotice(PLAN_LIMITS.apoiador)).toBe(
      'Os scripts deste modelo não rodam no plano Apoiador. Disponível no plano Narrador',
    );
  });

  it.each(['narrador', 'lenda', 'amigo_do_dono'] as const)(
    'on a %s table the scripts run',
    (plan) => {
      expect(sheetScriptsNotice(PLAN_LIMITS[plan])).toBeNull();
    },
  );

  it('with no table limits known nothing is stopped', () => {
    expect(sheetScriptsNotice(null)).toBeNull();
  });
});

describe('useSheetScriptsNotice', () => {
  const HTML = { path: 'index.html', content: '<p>Lyra</p>' };
  const WITH_JS: SheetSource = { files: [HTML, { path: 'a.js', content: 'lorkarium.ready();' }] };

  function noticeOf(limits: PlanLimits, source: SheetSource | null): string | undefined {
    const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) =>
      onTablePlan(limits, children);
    return renderHook(() => useSheetScriptsNotice(source), { wrapper }).result.current;
  }

  it('a template with JS on a Grátis table gets the notice', () => {
    expect(noticeOf(PLAN_LIMITS.free, WITH_JS)).toBe(
      'Os scripts deste modelo não rodam no plano Grátis. Disponível no plano Narrador',
    );
  });

  it('a template with no JS on a Grátis table has nothing left out, so no notice', () => {
    expect(noticeOf(PLAN_LIMITS.free, { files: [HTML] })).toBeUndefined();
  });

  it('no template yet means no notice', () => {
    expect(noticeOf(PLAN_LIMITS.free, null)).toBeUndefined();
  });

  it('a template with JS on a Lenda table runs it', () => {
    expect(noticeOf(PLAN_LIMITS.lenda, WITH_JS)).toBeUndefined();
  });
});
