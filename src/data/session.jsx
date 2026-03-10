import { createContext, useContext } from 'react';

/**
 * SessionContext — provides { isAdmin, currentUserId } to any child component.
 * Default value (isAdmin: true) ensures the app works if accidentally used
 * outside a provider (e.g. in tests or Storybook).
 */
export const SessionContext = createContext({ isAdmin: true, currentUserId: null });

export const useSession = () => useContext(SessionContext);
