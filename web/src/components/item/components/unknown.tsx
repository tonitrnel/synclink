import { FC, useMemo } from 'react';
import { useEntityConsumer } from '../entity-provider';
import { Metadata } from './metadata';
import { CustomMenuSlot, Menu } from './menu';
import { openViewer, supportsFileViewer } from '~/components/viewer-dialog';
import { EyeIcon } from 'icons';
import { useLingui } from '@lingui/react';

export const UnknownItem: FC = () => {
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
    <>
      <div className="cedasync-item-header">
        <p className="cedasync-item-title">{entity.name}</p>
      </div>
      <div className="mt-4 flex justify-between">
        <Metadata entity={entity} />
        <Menu
          entity={entity}
          slots={[
            supportsFileViewer(entity.name, entity.type) && previewButton,
          ]}
        />
      </div>
    </>
  );
};
