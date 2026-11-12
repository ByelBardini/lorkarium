import { PLAN_LIMITS, type PlanLimits } from '@lorkarium/contracts';
import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCustomColorLock } from '@/components/color-picker/custom-color-locks';
import { usePlanLimits } from '@/features/plans/use-plan-limits';
import {
  AccountPlanProvider,
  TablePlanLimitsProvider,
} from '@/features/plans/plan-limits-providers';
import { testDependencies } from '../../support/app-dependencies';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';

const FREE_ACCOUNT = { ...ANA, plan: 'free' as const, limits: PLAN_LIMITS.free };

function Around({
  customization,
  table,
  children,
}: Readonly<{ customization: boolean; table: PlanLimits; children: React.ReactNode }>) {
  return (
    <AccountPlanProvider account={{ ...FREE_ACCOUNT, customization }}>
      <TablePlanLimitsProvider
        openTables={testDependencies().openTables}
        campaign={{ id: VHARN.id, limits: table }}
      >
        {children}
      </TablePlanLimitsProvider>
    </AccountPlanProvider>
  );
}

function Locks() {
  return (
    <>
      <p>{`conta: ${useCustomColorLock('account') ?? 'livre'}`}</p>
      <p>{`mesa: ${useCustomColorLock('table') ?? 'livre'}`}</p>
    </>
  );
}

describe('usePlanLimits', () => {
  it('outside the providers neither is known', () => {
    const { result } = renderHook(() => usePlanLimits());
    expect(result.current).toEqual({ account: null, table: null });
  });

  it('inside, the account and the route table limits', () => {
    const { result } = renderHook(() => usePlanLimits(), {
      wrapper: ({ children }) => (
        <Around customization={false} table={PLAN_LIMITS.narrador}>
          {children}
        </Around>
      ),
    });
    expect(result.current.account?.plan).toBe('free');
    expect(result.current.table).toBe(PLAN_LIMITS.narrador);
  });
});

describe('the custom color locks given by the plans', () => {
  it('a free account on a Narrador table: only the account is locked', () => {
    render(
      <Around customization={false} table={PLAN_LIMITS.narrador}>
        <Locks />
      </Around>,
    );
    expect(screen.getByText('conta: Disponível no Apoiador')).toBeInTheDocument();
    expect(screen.getByText('mesa: livre')).toBeInTheDocument();
  });

  it('an Apoiador on a free table: only the table is locked', () => {
    render(
      <Around customization table={PLAN_LIMITS.free}>
        <Locks />
      </Around>,
    );
    expect(screen.getByText('conta: livre')).toBeInTheDocument();
    expect(screen.getByText('mesa: Disponível no Narrador')).toBeInTheDocument();
  });
});
