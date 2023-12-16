import { useEffect, useState } from 'react';

type MediaQueryState = {
  matches: boolean;
  list: MediaQueryList;
};

export const useMediaQuery = (query: string): boolean => {
  const [{ list, matches }, setMatches] = useState<MediaQueryState>(() => {
    const list = window.matchMedia(query);
    return {
      matches: list.matches,
      list,
    };
  });
  useEffect(() => {
    const listener = (evt: MediaQueryListEvent) => {
      setMatches({
        list,
        matches: evt.matches,
      });
    };
    list.addEventListener('change', listener);
    return () => {
      list.removeEventListener('change', listener);
    };
  }, [list, query]);
  return matches;
};
