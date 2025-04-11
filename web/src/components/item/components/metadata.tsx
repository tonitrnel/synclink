import { FC, memo } from 'react';
import { IEntity } from '~/constants/types';
import { formatBytes } from '~/utils/format-bytes';

export const Metadata: FC<{
  entity: IEntity;
  features?: Array<'type' | 'size'>;
}> = memo(({ entity, features = ['type', 'size'] }) => {
  return (
    <div className="flex flex-1 gap-2 items-center min-w-0 h-4">
      {features.includes('size') && (
        <span className="text-gray-800 leading-none whitespace-nowrap text-sm">
          {formatBytes(entity.size)}
        </span>
      )}
      {features.includes('type') && (
        <span className="text-gray-400 block leading-none truncate text-sm pr-4 pad:pr-10">
          {entity.type}
        </span>
      )}
    </div>
  );
});
