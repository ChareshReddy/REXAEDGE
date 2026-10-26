import React, { createContext, useContext } from 'react';

export const FinderContext = createContext({
  activeServer: null,
  activeTab: '',
  onActionNavigate: null
});

export function FinderProvider({ value, children }) {
  return <FinderContext.Provider value={value}>{children}</FinderContext.Provider>;
}

export function useFinder() {
  return useContext(FinderContext);
}
