import { ReactComponent as LogoIcon } from './assets/logo.svg';
import { ReactComponent as UploadCloudIcon } from './assets/upload-cloud.svg';
import { ReactComponent as SendIcon } from './assets/send.svg';
import { ReactComponent as AlertTriangleIcon } from './assets/alert-triangle.svg';
import { ReactComponent as ClipboardPasteIcon } from './assets/clipboard-paste.svg';
import {
  FC,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  MouseEvent,
  createContext,
  useContext,
} from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import './App.css';
import { copy } from './utils/copy.ts';
import { openFilePicker } from './utils/open-file-picker.ts';
import { executeAsyncTask } from './utils/execute-async-task.ts';
import { UploadManager } from './components/upload-manager';
import { formatBytes } from './utils/format-bytes.ts';
import { Spin } from './components/spin';
import { DropZone } from './components/dropzone';
import { upload } from './utils/upload.ts';
import { IGNORE_FILE_TYPE } from './constants';

dayjs.extend(relativeTime);

const useGet = <T,>(
  url: string,
  transformer: (response: Response) => Promise<T>
): [T | undefined, { done: boolean; error?: Error }] => {
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<T>();
  const [error, setError] = useState<Error>();
  const transformerRef = useRef(transformer);
  const send = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setError(new Error(res.statusText));
        setResult(void 0);
      } else {
        setError(void 0);
        setResult(await transformerRef.current(res));
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(new Error(e.message));
      } else {
        setError(new Error(String(e)));
      }
      setResult(void 0);
    } finally {
      setDone(true);
    }
  }, [url]);
  useEffect(() => {
    send().catch(console.error);
  }, [send]);
  transformerRef.current = transformer;
  return [result, { error, done }];
};

const Input: FC = memo(() => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handleSend = useMemo(
    () =>
      executeAsyncTask(async () => {
        const textarea = textareaRef.current;
        if (!textarea || textarea.value.trim().length === 0) {
          return void 0;
        }
        try {
          await upload(new File([textarea.value], '', { type: 'text/plain' }));
          textarea.value = '';
        } catch (e) {
          console.error('Seed failed', e);
        }
      }),
    []
  );
  const handleUpload = useMemo(
    () =>
      executeAsyncTask(async () => {
        const files = await openFilePicker(['*']);
        if (files.length === 0) return void 0;
        const file = files[0];
        try {
          await upload(file);
        } catch (e) {
          console.error('Upload failed', e);
        }
      }),
    []
  );
  const handlePaste = useCallback(async () => {
    const textarea = textareaRef.current;
    if (!textarea) return void 0;
    try {
      const data = await navigator.clipboard.read();
      if (data.length === 0) return void 0;
      const items = await Promise.all(
        data
          .map((it) => {
            const type = it.types
              .filter((type) => !IGNORE_FILE_TYPE.includes(type))
              .at(-1);
            if (!type) return null;
            return it.getType(type);
          })
          .filter((it): it is NonNullable<typeof it> => Boolean(it))
      );
      for (const item of items) {
        await upload(new File([item], '', { type: item.type }));
      }
    } catch (e) {
      console.error(e);
    }
    // textarea.value
  }, []);
  const handleReceivedTransferData = useCallback(async (files: File[]) => {
    try {
      for (const file of files) {
        await upload(file);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);
  return (
    <section className="section-input">
      <textarea
        ref={textareaRef}
        className="section-input__textarea"
        placeholder="Just write something..."
      ></textarea>
      <div className="section-input__menu">
        <div className="section-input__menu-left">
          <button title="Upload" onClick={handleUpload}>
            <UploadCloudIcon />
          </button>
          <button title="Paste" onClick={handlePaste}>
            <ClipboardPasteIcon />
          </button>
        </div>
        <div className="section-input__menu-right">
          <button title="Send" onClick={handleSend}>
            <span>Send</span>
            <SendIcon />
          </button>
        </div>
      </div>
      <DropZone onReceivedTransferData={handleReceivedTransferData} />
    </section>
  );
});

interface IEntity {
  uid: string;
  name: string;
  created: number;
  type: string;
  size: number;
  hash: string;
  ext: string;
}

const getEntity = async (uid: string) => {
  return fetch(
    `${import.meta.env.VITE_APP_ENDPOINT}/${uid}/metadata`
  ).then<IEntity>((res) => res.json());
};

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
const SynclinkItemMetadata: FC<{ entity: IEntity }> = memo(({ entity }) => {
  return (
    <div className="synclink-item-metadata">
      <span className="synclink-item-date">
        {dayjs(entity.created).fromNow()}
      </span>
      <span className="synclink-item-type">Type: {entity.type}</span>
      <span className="synclink-item-size">
        Size: {formatBytes(entity.size)}
      </span>
    </div>
  );
});
const ENTITY_CONTEXT = createContext<IEntity | null>(null);
const EntityProvider: FC<{ value: IEntity; children: ReactNode }> = ({
  value,
  children,
}) => {
  return (
    <ENTITY_CONTEXT.Provider value={value}>{children}</ENTITY_CONTEXT.Provider>
  );
};
const useEntityConsumer = () => {
  const entity = useContext(ENTITY_CONTEXT);
  if (!entity)
    throw new Error(
      'Required context was not found. Please make sure to use it within an <EntityProvider/> component.'
    );
  return entity;
};
const TextItem: FC = () => {
  const entity = useEntityConsumer();
  const [content] = useGet(
    `${import.meta.env.VITE_APP_ENDPOINT}/${entity.uid}`,
    (res) => res.text()
  );
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
      <p className="synclink-item-preview">{content}</p>
      <SynclinkItemMetadata entity={entity} />
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
          src={`${import.meta.env.VITE_APP_ENDPOINT}/${entity.uid}`}
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
      <video preload="metadata" controls className="synclink-item-preview">
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

const SynclinkItem: FC<{ it: IEntity }> = memo(({ it }) => {
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

const List: FC = memo(() => {
  const [list, setList] = useState<IEntity[]>([]);
  const [, { done, error }] = useGet<void>(
    import.meta.env.VITE_APP_ENDPOINT,
    async (res) => {
      setList(await res.json());
    }
  );
  useEffect(() => {
    const sse = new EventSource(`${import.meta.env.VITE_APP_ENDPOINT}/notify`);
    sse.onopen = () => {
      console.log('sse ready');
    };
    sse.onerror = (error) => {
      console.error('sse error: ', error);
    };
    sse.onmessage = async (evt) => {
      const payload: { type: 'ADD' | 'DELETE'; uid: string } = JSON.parse(
        evt.data
      );
      switch (payload.type) {
        case 'DELETE':
          setList((list) => list.filter((it) => it.uid !== payload.uid));
          break;
        case 'ADD': {
          try {
            const entity = await getEntity(payload.uid);
            setList((list) => [entity, ...list]);
          } catch (e) {
            console.error('Update list failed', e);
          }
          break;
        }
        default:
          console.error(`Unknown notify type ${payload.type}`);
      }
    };
    return () => {
      sse.close();
    };
  }, []);
  return (
    <section className="synclink-list-container">
      {(() => {
        if (!done) return <Spin className="synclink-loading" />;
        if (error)
          return (
            <div className="synclink-error">
              <AlertTriangleIcon />
              <p>{error.message}</p>
            </div>
          );
        return (
          <ul className="synclink-list">
            <UploadManager />
            {list.map((it) => (
              <SynclinkItem key={it.uid} it={it} />
            ))}
          </ul>
        );
      })()}
    </section>
  );
});

function App() {
  return (
    <>
      <header className="header">
        <LogoIcon className="header-icon" />
        <h1 className="header-title">SyncLink</h1>
      </header>
      <main>
        <Input />
        <List />
      </main>
    </>
  );
}

export default App;
