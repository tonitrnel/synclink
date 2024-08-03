import {
  FC,
  forwardRef,
  HTMLAttributes,
  memo,
  ReactElement,
  ReactNode,
  Ref,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { TreeNode } from '../tree/tree';
import { clsx } from '~/utils/clsx';
import { isFunction } from '@painted/shared';
import { ChevronRightIcon } from 'icons';
import { withProduce } from '~/utils/with-produce';

interface TreeTableProps<T> {
  records: TreeNode<T>[];
  columns: Col<T>[];
  scrollHeight?: string;
}

interface Row<T = unknown> {
  id: string;
  node: TreeNode<T>;
  indent: number;
  leaf: boolean;
  className?: string;
  expanded: boolean;
}
interface Col<T = unknown> {
  key: string;
  className?: string;
  headerClassName?: string;
  header?: ReactNode;
  expander?: boolean | ((expanded: boolean, record: TreeNode<T>) => ReactNode);
  render?: (record: TreeNode<T>) => ReactNode;
}
const TreeTableImpl = <T,>(
  {
    records,
    columns,
    className,
    scrollHeight,
    ...props
  }: TreeTableProps<T> & HTMLAttributes<HTMLTableElement>,
  ref: Ref<HTMLTableElement>,
) => {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const rows = useMemo(() => {
    const rows: Row[] = [];
    const stack = [...records.toReversed()];
    const indentStack: number[] = [];
    while (stack.length > 0) {
      const item = stack.pop()!;
      if (indentStack.length > 0) {
        if (indentStack[indentStack.length - 1] == 0) {
          indentStack.pop();
        } else {
          indentStack[indentStack.length - 1] -= 1;
        }
      }
      const expanded = expandedIds.includes(item.id);
      rows.push({
        id: item.id,
        node: item,
        className: item.className,
        indent: indentStack.length,
        leaf: item.leaf || false,
        expanded,
      });
      if (item.children && item.children.length > 0 && !item.leaf && expanded) {
        indentStack.push(item.children.length);
        stack.push(...item.children.toReversed());
      }
    }
    return rows;
  }, [expandedIds, records]);
  const onExpand = useCallback((id: string, expanded: boolean) => {
    withProduce(setExpandedIds, (ids) => {
      const idx = ids.indexOf(id);
      if (expanded && idx < 0) {
        ids.push(id);
        return void 0;
      }
      if (!expanded && idx >= 0) {
        ids.splice(idx, 1);
        return void 0;
      }
    });
  }, []);
  return (
    <div
      className={clsx(scrollHeight && 'overflow-y-scroll', className)}
      style={{ height: scrollHeight }}
    >
      <table
        ref={ref}
        role="table"
        className={clsx('w-full border-collapse table-fixed')}
        {...props}
      >
        <TableHead
          cols={columns as Col[]}
          scrollable={scrollHeight !== undefined}
        />
        <TableBody rows={rows} cols={columns as Col[]} onExpand={onExpand} />
      </table>
    </div>
  );
};
export const TreeTable = forwardRef(TreeTableImpl) as <T>(
  props: TreeTableProps<T> &
    HTMLAttributes<HTMLTableElement> & { ref?: Ref<HTMLTableElement> },
) => ReactElement;

const TableHead: FC<{
  cols: Col[];
  scrollable?: boolean;
}> = memo(({ cols, scrollable }) => {
  return (
    <thead role="rowgroup">
      <tr role="row">
        {cols.map((col) => (
          <th
            role="columnheader"
            key={col.key}
            className={clsx(
              'p-3 border-b-[1px] text-left border-gray-200 font-bold text-gray-700 bg-gray-50',
              scrollable && 'sticky top-0',
              col.className,
              col.headerClassName,
            )}
          >
            {col.header}
          </th>
        ))}
      </tr>
    </thead>
  );
});
const TableBody: FC<{
  rows: Row[];
  cols: Col[];
  onExpand(id: string, expanded: boolean): void;
}> = memo(({ rows, cols, onExpand }) => {
  return (
    <tbody role="rowgroup">
      {rows.map((row) => (
        <TableBodyRow
          key={String(row.id)}
          row={row}
          cols={cols}
          onExpand={onExpand}
        />
      ))}
    </tbody>
  );
});
const TableBodyRow: FC<{
  row: Row;
  cols: Col[];
  onExpand(id: string, expanded: boolean): void;
}> = memo(({ row, cols, onExpand }) => {
  return (
    <tr className={clsx('', row.className)}>
      {cols.map((col) => (
        <TableBodyCol key={col.key} col={col} row={row} onExpand={onExpand} />
      ))}
    </tr>
  );
});
const TableBodyCol: FC<{
  col: Col;
  row: Row;
  onExpand(id: string, expanded: boolean): void;
}> = memo(({ col, row, onExpand }) => {
  const expander = col.expander && !row.leaf && (
    <button
      className="inline-flex w-8 h-8 -ml-3 align-middle justify-center items-center text-gray-500"
      onClick={() => onExpand(row.id, !row.expanded)}
    >
      {isFunction(col.expander) ? (
        col.expander(row.expanded, row.node)
      ) : (
        <ChevronRightIcon
          className={clsx(
            'w-5 h-5  transition-transform',
            row.expanded && 'rotate-90',
          )}
        />
      )}
    </button>
  );
  const indent = row.indent > 0 && col.expander && (
    <span
      className="inline-block align-middle"
      style={{ width: `${row.indent + (expander ? 0 : 1.25)}rem` }}
      data-indent={row.indent}
    />
  );
  return (
    <td
      role="cell"
      className={clsx(
        'p-3 border-b border-gray-200 text-sm box-border',
        col.className,
      )}
    >
      {indent}
      {expander}
      {col.render
        ? col.render(row.node)
        : String((row.node.data as Record<string, unknown>)[col.key])}
    </td>
  );
});

export type { TreeTableProps, Col as TreeTableColumn };
