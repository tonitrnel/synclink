import { FC, HTMLAttributes, memo, useMemo } from 'react';
import { useEntity } from '../hooks/use-entity.ts';
import { Metadata } from './metadata';
import { CustomMenuSlot, Menu } from './menu';
import { openViewer, supportsFileViewer } from '~/components/viewer-dialog';
import { EyeIcon } from 'lucide-react';
import { useLingui } from '@lingui/react';
import { clsx } from '~/utils/clsx.ts';
import { useCoordinator } from '../hooks/use-coordinator.ts';
import { RenderProps } from './type.ts';

/**
 * 未知项
 *
 * @tips 高度已知
 */
export const UnknownItem: FC<HTMLAttributes<HTMLDivElement> & RenderProps> =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  memo(({ visible, className, ...props }) => {
    const entity = useEntity();
    const i18n = useLingui();
    useCoordinator(entity.uid, true);
    const previewButton = useMemo<CustomMenuSlot>(
      () => ({
        key: 'viewer',
        component: (
          <>
            <EyeIcon className="h-4 w-4" />
            <span>{i18n._('Preview')}</span>
          </>
        ),
        event: () =>
          openViewer({
            resourceId: entity.uid,
            filename: entity.name,
            mimetype: entity.type,
          }),
      }),
      [entity.name, entity.type, entity.uid, i18n],
    );
    return (
      <div className={clsx('', className)} {...props}>
        <div className="item-header">
          <p className="item-title truncate" title={entity.name}>
            {entity.name}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Metadata entity={entity} />
          <Menu
            entity={entity}
            slots={[
              supportsFileViewer(entity.name, entity.type) && previewButton,
            ]}
          />
        </div>
      </div>
    );
  });
