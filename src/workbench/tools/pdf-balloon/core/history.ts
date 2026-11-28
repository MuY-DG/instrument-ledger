import type { Marker, MarkerStyle } from '../types';

export interface Snapshot {
  items: Marker[];
  defaults: MarkerStyle;
}
export interface History extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
  group?: object;
  baseline?: Snapshot;
}
export type HistoryAction =
  | { type: 'commit'; update: (current: Snapshot, baseline: Snapshot) => Snapshot; group?: object }
  | { type: 'replace'; items: Marker[] }
  | { type: 'undo' | 'redo' };

export function historyReducer(state: History, action: HistoryAction): History {
  const snapshot = { items: state.items, defaults: state.defaults };
  if (action.type === 'replace')
    return { items: action.items, defaults: state.defaults, past: [], future: [] };
  if (action.type === 'commit') {
    const continuing = !!action.group && action.group === state.group;
    const baseline = continuing ? state.baseline! : snapshot;
    const next = action.update(snapshot, baseline);
    if (next.items === state.items && next.defaults === state.defaults) return state;
    return {
      ...next,
      past: continuing ? state.past : [...state.past.slice(-79), snapshot],
      future: [],
      group: action.group,
      baseline: action.group ? baseline : undefined,
    };
  }
  if (action.type === 'undo') {
    if (!state.past.length) return { ...state, group: undefined, baseline: undefined };
    return {
      ...state.past.at(-1)!,
      past: state.past.slice(0, -1),
      future: [snapshot, ...state.future].slice(0, 80),
    };
  }
  if (!state.future.length) return { ...state, group: undefined, baseline: undefined };
  return {
    ...state.future[0],
    past: [...state.past, snapshot].slice(-80),
    future: state.future.slice(1),
  };
}
