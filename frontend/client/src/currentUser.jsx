import { createContext, useContext } from 'react';

export const CurrentUserContext = createContext(null);

export function useCurrentUser(fallback = 'Staff') {
  const user = useContext(CurrentUserContext);
  const displayName = user?.displayName || [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ') || user?.username || fallback;
  const words = displayName.trim().split(/\s+/);
  const initials = words.length > 1 ? words[0][0] + words.at(-1)[0] : displayName.slice(0, 2);
  return { displayName, initials: initials.toUpperCase(), username: user?.username || '', role: user?.role || fallback };
}
