import { useCallback, useReducer, useRef } from 'react';
import type { Marker, MarkerStyle } from '../types';
import { historyReducer } from '../core/history';
import type { Snapshot } from '../core/history';

export function useHistory(defaults: MarkerStyle) {
  const [history, dispatch] = useReducer(historyReducer, {
    items: [],
    defaults,
    past: [],
    future: [],
  });
  const current = useRef(history);
  current.current = history;
  const commit = useCallback((update: Marker[] | ((items: Marker[]) => Marker[])) => {
    dispatch({
      type: 'commit',
      update: (state) => ({
        ...state,
        items: typeof update === 'function' ? update(state.items) : update,
      }),
    });
  }, []);
  const commitSnapshot = useCallback(
    (update: (state: Snapshot, baseline: Snapshot) => Snapshot, group?: object) =>
      dispatch({ type: 'commit', update, group }),
    [],
  );
  const replace = useCallback((items: Marker[]) => dispatch({ type: 'replace', items }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  return { ...history, commit, commitSnapshot, replace, undo, redo, current };
}
