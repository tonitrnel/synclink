import {
  FC,
  memo,
  MouseEvent,
  MouseEventHandler,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { EntityProvider, useEntityConsumer } from './entity-provider.ts';
import { executeAsyncTask } from '~/utils/execute-async-task.ts';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatBytes } from '~/utils/format-bytes.ts';
import { useGet } from '~/utils/hooks/use-get.ts';
import { IEntity } from '~/constants/types.ts';
import { copy } from '~/utils/copy.ts';
import dayjs from 'dayjs';
import './item.css';

dayjs.extend(relativeTime);

type CustomMenu = {
  key: string;
  component: ReactNode;
  event: (evt: MouseEvent<HTMLButtonElement>) => void;
};
const SynclinkItemMenu: FC<{
  entity: IEntity;
  features?: Array<'previewable' | 'downloadable' | 'deletable'>;
  slots?: Array<CustomMenu>;
}> = memo(
  ({ entity, features = ['downloadable', 'deletable'], slots = [] }) => {
    const onDelete = useMemo(
      () =>
        executeAsyncTask(async (uid: string) => {
          await fetch(`${import.meta.env.VITE_APP_ENDPOINT}/${uid}`, {
            method: 'DELETE',
          });
        }),
      []
    );
    return (
      <>
        <div className="synclink-item-menus">
          {slots.map((it) => (
            <button
              key={it.key}
              className="synclink-item-link"
              onClick={it.event}
            >
              {it.component}
            </button>
          ))}
          {features.includes('downloadable') && (
            <a
              className="synclink-item-link"
              href={`${import.meta.env.VITE_APP_ENDPOINT}/${entity.uid}?raw`}
              target="_blank"
            >
              Download
            </a>
          )}
          {features.includes('deletable') && (
            <button
              className="synclink-item-link"
              onClick={() => onDelete(entity.uid)}
            >
              Delete
            </button>
          )}
        </div>
      </>
    );
  }
);
const SynclinkItemMetadata: FC<{
  entity: IEntity;
  features?: Array<'date' | 'type' | 'size'>;
}> = memo(({ entity, features = ['date', 'type', 'size'] }) => {
  return (
    <div className="synclink-item-metadata">
      {features.includes('date') && (
        <span className="synclink-item-date">
          {dayjs(entity.created).fromNow()}
        </span>
      )}
      {features.includes('type') && (
        <span className="synclink-item-type">type: {entity.type}</span>
      )}
      {features.includes('size') && (
        <span className="synclink-item-size">
          size: {formatBytes(entity.size)}
        </span>
      )}
    </div>
  );
});

/* === Preview Item === */

const TextItem: FC = () => {
  const entity = useEntityConsumer();
  const [content] = useGet(
    `${import.meta.env.VITE_APP_ENDPOINT}/${entity.uid}`,
    (res) => res.text()
  );
  const handleDoubleClick = useCallback<
    MouseEventHandler<HTMLParagraphElement>
  >((evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const selection = window.getSelection();

    if (selection) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(evt.currentTarget);
      selection.addRange(range);
    }
  }, []);
  const copyButton = useMemo<CustomMenu>(
    () => ({
      key: 'copy',
      event: async () => {
        if (!content) return void 0;
        await copy(content);
      },
      component: 'Copy',
    }),
    [content]
  );
  return (
    <>
      <p className="synclink-item-preview" onDoubleClick={handleDoubleClick}>
        {content}
      </p>
      <SynclinkItemMetadata entity={entity} features={['date']} />
      <SynclinkItemMenu
        entity={entity}
        features={['deletable']}
        slots={[copyButton]}
      />
    </>
  );
};
const FigureItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <figure className="synclink-item-preview">
        <img
          src={`${import.meta.env.VITE_APP_ENDPOINT}/${
            entity.uid
          }?thumbnail-prefer`}
          alt={entity.name}
          loading="lazy"
        />
        <figcaption>{entity.name}</figcaption>
      </figure>
      <SynclinkItemMetadata entity={entity} />
      <SynclinkItemMenu entity={entity} />
    </>
  );
};
const VideoItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <video
        preload="metadata"
        controls
        className="synclink-item-preview"
        controlsList="nodownload"
      >
        <source
          src={`${import.meta.env.VITE_APP_ENDPOINT}/${entity.uid}`}
          type={entity.type}
        />
      </video>
      <SynclinkItemMetadata entity={entity} />
      <SynclinkItemMenu entity={entity} />
    </>
  );
};
const AudioItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <audio controls className="synclink-item-preview">
        <source
          src={`${import.meta.env.VITE_APP_ENDPOINT}/${entity.uid}`}
          type={entity.type}
        />
      </audio>
      <SynclinkItemMetadata entity={entity} />
      <SynclinkItemMenu entity={entity} />
    </>
  );
};
const UnknownItem: FC = () => {
  const entity = useEntityConsumer();
  return (
    <>
      <div className="synclink-item-header">
        <h3 className="synclink-item-title">{entity.name}</h3>
        <SynclinkItemMetadata entity={entity} />
      </div>
      <SynclinkItemMenu entity={entity} />
    </>
  );
};

export const SynclinkItem: FC<{ it: IEntity }> = memo(({ it }) => {
  const file = useMemo(() => {
    const [category, format] = it.type.split('/');
    return { category, format };
  }, [it]);
  const render = useMemo(() => {
    switch (file.category) {
      case 'text':
        return <TextItem />;
      case 'image':
        return <FigureItem />;
      case 'video':
        return <VideoItem />;
      case 'audio':
        return <AudioItem />;
      default:
        return <UnknownItem />;
    }
  }, [file.category]);
  return (
    <EntityProvider value={it}>
      <li className="synclink-item" key={it.uid}>
        {render}
      </li>
    </EntityProvider>
  );
});
