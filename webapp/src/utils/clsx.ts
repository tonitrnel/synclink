type ValidClasses = string | { [classes: string]: boolean | undefined };

export const clsx = (
  ...classes: (ValidClasses | undefined | null | false)[]
): string => {
  return classes
    .filter((it): it is ValidClasses => Boolean(it))
    .map((it) => {
      if (typeof it !== 'object') return it;
      return Object.entries(it)
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k);
    })
    .flat()
    .join(' ');
};
