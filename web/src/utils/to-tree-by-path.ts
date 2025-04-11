import type { TreeNode } from '~/components/ui/tree';

export const toTreeByPath = <T extends { path: string }, R>(
  data: T[],
  mapper: (item: T, name: string) => TreeNode<R>,
): TreeNode<R>[] => {
  const map = new Map<string, TreeNode<R>>([['/', { id: 'root', children: [], data: undefined as R }]]);
  const addPath = (parts: string[], item: T) => {
    const name = parts.pop()!;
    const parentKey = parts.join('/');
    const key = `${parentKey ? parentKey + '/' : ''}${name}`;
    const obj = mapper(item, name);
    map.set(key, obj);
    const parent = map.get(parentKey || '/');
    // console.log(
    //   `parentKey: "${parentKey || '/'}" key: "${key}" path: "${item.path}"`,
    // );
    if (!parent) {
      return void 0;
    }
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(obj);
  };
  data.forEach((item) => {
    const parts = item.path.split('/');
    if (parts.at(-1) == '') {
      parts.pop();
    }
    if (parts.length == 0) return void 0;
    addPath(parts, item);
  });
  return map.get('/')?.children ?? [];
};
