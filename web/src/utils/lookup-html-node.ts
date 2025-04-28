/**
 * 根据selector向上查找节点
 * @param node 入口节点
 * @param selector
 * @param topmostElement 最顶层节点
 */
export const lookupHTMLNode = <T extends HTMLElement = HTMLElement>(
    node: HTMLElement | null,
    selector: string | ((element: HTMLElement) => boolean),
    topmostElement = document.documentElement,
): T | null => {
    if (!node) return null;
    const match = (node: HTMLElement): boolean => {
        return typeof selector === 'string'
            ? node.matches(selector)
            : selector(node);
    };
    if (match(node)) return node as T;
    let parent = node.parentElement;
    while (true) {
        if (!parent || parent === topmostElement) return null;
        if (match(parent)) return parent as T;
        parent = parent.parentElement;
    }
};
