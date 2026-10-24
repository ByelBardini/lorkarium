import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** What the condition tool stamps: the table's condition picked (`null`: none yet) and the rounds
 *  as typed ("" or "0" = no limit; the text stays so a wrong one can be fixed in place). */
export type ConditionToolChoice = Readonly<{ conditionId: string | null; roundsText: string }>;

export type ConditionToolStore = ConditionToolChoice &
  Readonly<{
    pick: (conditionId: string | null) => void;
    setRoundsText: (typed: string) => void;
  }>;

/** The condition and rounds of the condition tool for one room visit (the ids belong to this
 *  table, so nothing is kept in the browser): switching tools keeps them for the next time.
 *
 *  Example: `const [conditionTool] = useState(createConditionToolStore)` */
export function createConditionToolStore(): StoreApi<ConditionToolStore> {
  return createStore<ConditionToolStore>()((set) => ({
    conditionId: null,
    roundsText: '',
    pick: (conditionId) => set({ conditionId }),
    setRoundsText: (roundsText) => set({ roundsText }),
  }));
}

/** Just the choice, without the setters.
 *
 *  Example: `stampCondition(target, { board, choice: conditionChoiceOf(store.getState()), interaction })` */
export function conditionChoiceOf({
  conditionId,
  roundsText,
}: ConditionToolChoice): ConditionToolChoice {
  return { conditionId, roundsText };
}

/** React view of a slice of the condition tool's choice.
 *
 *  Example: `const conditionId = useConditionTool(store, (state) => state.conditionId)` */
export function useConditionTool<T>(
  store: StoreApi<ConditionToolStore>,
  selector: (state: ConditionToolStore) => T,
): T {
  return useStore(store, selector);
}
