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
    .join(' ')
    .replace(/\s+/g, ' ');
};

type ClassVariantConfigurations = Record<string, Record<string, string>>;
type CompoundClassVariant<T> = {
  combinations: {
    [K in keyof T]?: keyof T[K] | Array<keyof T[K]>;
  };
  classes: string;
};
type DefaultClassVariant<T extends ClassVariantConfigurations> = {
  [P in keyof T]: keyof T[P];
};
type ClassVariantProps<T> = {
  [P in keyof T]?: keyof T[P];
};
export type VariantProps<T> = T extends (
  props: ClassVariantProps<infer Variants>,
) => string
  ? ClassVariantProps<Variants>
  : never;

// Port https://github.com/joe-bell/cva
/**
 * 根据提供的配置和属性生成 CSS 类名。支持单一变体和复合变体的配置。
 * @param base 基础类名，所有生成的类名都会包含这个基础类名
 * @param config 配置对象，包含三个属性：
 * @param config.variants 定义单一变体的配置，每个键对应一个变体名称，每个值是该变体的可能值对应的类名
 * @param config.compoundVariants：定义复合变体的配置，每个元素是一个对象，包含变体组合和对应的类名
 * @param config.defaultVariants：默认变体配置，当属性中未指定某个变体时使用的默认值。
 * @returns 所有适用的CSS类名
 * @example ```typescript
 * clsv('flex', {
 *   variants: {
 *     size: {
 *       sm: '...',
 *       md: '...',
 *       lg: '...',
 *     },
 *     variant: {
 *       contained: '...',
 *       outlined: '...',
 *       text: '...',
 *     },
 *   },
 *   compoundVariants: [
 *     {
 *       combinations: {
 *         size: 'sm',
 *         variant: 'text',
 *       },
 *       classes: '...',
 *     },
 *   ],
 *   defaultVariants: {
 *     variant: 'text',
 *     size: 'md',
 *   },
 * });
 * ```
 */
export const clsv = <T extends ClassVariantConfigurations>(
  base: string,
  config: {
    variants: T;
    compoundVariants?: CompoundClassVariant<T>[];
    defaultVariants: DefaultClassVariant<T>;
  },
) => {
  const cache = new Map<string, string>();
  return (props: ClassVariantProps<T>): string => {
    const cacheKey = Object.entries(props)
      .map(([k, v]) => `${k}=${v}`)
      .join(';');
    if (cache.has(cacheKey)) return `${base} ${cache.get(cacheKey)!}`;
    const basicClasses = (
      Object.entries(config.variants) as Array<
        [keyof T, Record<string, string>]
      >
    ).reduce<string>((accumulatedClasses, [variantName, variants]) => {
      const selectedVariant =
        props[variantName] || config.defaultVariants[variantName];
      return accumulatedClasses + ' ' + variants[selectedVariant as string];
    }, '');
    const compoundClasses = config.compoundVariants?.reduce(
      (accumulatedClasses, { combinations, classes }) => {
        for (const [key, value] of Object.entries(combinations)) {
          const selectedValue = props[key] || config.defaultVariants[key];
          if (Array.isArray(value) && value.includes(selectedValue)) {
            return accumulatedClasses + ' ' + classes;
          }
          if (value == selectedValue) {
            return accumulatedClasses + ' ' + classes;
          }
        }
        return accumulatedClasses;
      },
      '',
    );
    cache.set(cacheKey, clsx(basicClasses, compoundClasses));
    return clsx(base, cache.get(cacheKey));
  };
};
