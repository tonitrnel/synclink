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
import { useLingui } from '@lingui/react';

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
      style={{ maxHeight: scrollHeight }}
    >
      <table
        ref={ref}
        role="table"
        className={clsx('w-full table-fixed border-collapse')}
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
              'border border-gray-100 bg-gray-50 p-3 text-left font-bold text-gray-700',
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
  const i18n = useLingui();
  return (
    <tbody role="rowgroup">
      {rows.length === 0 && (
        <tr className="border-l border-r border-gray-100">
          <td
            colSpan={cols.length}
            className="border border-gray-100 p-4 text-gray-400"
          >
            {i18n._('No data')}
          </td>
        </tr>
      )}
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
    <tr className={clsx('border-l border-r border-gray-100', row.className)}>
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
      className="-ml-3 inline-flex h-8 w-8 items-center justify-center align-middle text-gray-500"
      onClick={() => onExpand(row.id, !row.expanded)}
    >
      {isFunction(col.expander) ? (
        col.expander(row.expanded, row.node)
      ) : (
        <ChevronRightIcon
          className={clsx(
            'h-5 w-5 transition-transform',
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
        'box-border border-b border-gray-200 p-3 text-sm',
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
