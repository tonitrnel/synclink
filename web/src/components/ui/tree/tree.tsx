export interface TreeNode<T = unknown> {
    id: string;
    data: T;
    children?: TreeNode<T>[] | undefined;
    className?: string;
    leaf?: boolean | undefined;
}
