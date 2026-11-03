import { useCallback, useEffect, useState } from 'react';

const KEY = 'leadlane.chat.v2';
const MAX_MESSAGES = 100;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

/**
 * One chat window per client. Messages are kept per tenant (in the browser only) so switching clients
 * shows that client's chat and never mixes answers of different clients.
 */
export function useChat(tenant) {
  const [byTenant, setByTenant] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(byTenant));
    } catch {
      /* storage blocked or full: chat just won't survive a reload */
    }
  }, [byTenant]);

  const add = useCallback((t, message) => {
    setByTenant((all) => ({ ...all, [t]: [...(all[t] ?? []), message].slice(-MAX_MESSAGES) }));
  }, []);

  const clear = useCallback((t) => {
    setByTenant((all) => {
      const { [t]: _removed, ...rest } = all;
      return rest;
    });
  }, []);

  return { messages: byTenant[tenant] ?? [], add, clear };
}
