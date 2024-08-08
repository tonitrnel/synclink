import { FC, HTMLAttributes, memo, useMemo } from 'react';
import { useEntityConsumer } from '../entity-provider';
import { Metadata } from './metadata';
import { CustomMenuSlot, Menu } from './menu';
import { openViewer, supportsFileViewer } from '~/components/viewer-dialog';
import { EyeIcon } from 'icons';
import { useLingui } from '@lingui/react';
import { clsx } from '~/utils/clsx.ts';

export const UnknownItem: FC<HTMLAttributes<HTMLDivElement>> = memo(
  ({ className, ...props }) => {
    const entity = useEntityConsumer();
    const i18n = useLingui();
    const previewButton = useMemo<CustomMenuSlot>(
      () => ({
        key: 'viewer',
        component: (
          <>
            <EyeIcon className="w-4 h-4" />
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
        <div className="cedasync-item-header">
          <p className="cedasync-item-title">{entity.name}</p>
        </div>
        <div className="mt-4 flex justify-between items-center">
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
  },
);
