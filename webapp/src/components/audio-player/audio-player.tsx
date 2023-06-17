import {
  FC,
  memo,
  MouseEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ReactComponent as PlayIcon } from '~/assets/play.svg';
import { ReactComponent as PauseIcon } from '~/assets/pause.svg';
import { ReactComponent as LoopOnIcon } from '~/assets/loop.svg';
import { ReactComponent as LoopOffIcon } from '~/assets/loop-off.svg';
import { executeAsyncTask } from '~/utils/execute-async-task.ts';
import { Logger } from '~/utils/logger.ts';
import { clsx } from '~/utils/clsx.ts';
import { ImageValue, metadataParser } from './metadata-parser';
import './audio-player.css';

const logger = new Logger('AudioPlayer');

interface State {
  ready: boolean;
  played: number;
  loaded: number;
  paused: boolean;
  loop: boolean;
  loading: boolean;
  error: boolean;
  duration: number;
  pointer: {
    pos: number;
    show: boolean;
  };
}

interface Metadata {
  title?: string;
  cover?: string;
  artist?: string;
}

export const AudioPlayer: FC<{
  src: string;
  type?: string;
  title?: string;
  className?: string;
}> = memo(({ src, type, title, className }) => {
  const [state, setState] = useState<State>(() => ({
    ready: false,
    played: 0,
    loaded: 0,
    duration: 0,
    paused: true,
    loop: false,
    loading: false,
    error: false,
    pointer: {
      pos: 0,
      show: false,
    },
  }));
  const [metadata, setMetadata] = useState<Metadata>(() => ({}));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllers = useMemo(() => {
    return new (class {
      private enabledPointer = false;
      private draggingPointer = false;

      private get audio() {
        const audio = audioRef.current;
        if (!audio) throw new Error('Missing Audio Node');
        return audio;
      }

      toggle = executeAsyncTask(async () => {
        if (this.audio.paused) {
          await this.audio.play();
        } else {
          this.audio.pause();
        }
      });
      setLoop = () => {
        this.audio.loop = !this.audio.loop;
        setState((prev) => ({
          ...prev,
          loop: this.audio.loop,
        }));
      };
      setTime: MouseEventHandler<HTMLDivElement> = (evt) => {
        const { left, width } = (
          evt.currentTarget as HTMLElement
        ).getBoundingClientRect();
        const x = evt.clientX - left;
        if (x > width) return void 0;
        this.audio.currentTime = (x / width) * this.audio.duration;
      };

      getWidth = (e: number) => {
        const audio = audioRef.current;
        if (!audio) return '0%';
        return ((e / audio.duration) * 100).toFixed(2) + `%`;
      };

      dragPointer: MouseEventHandler<HTMLDivElement> = (evt) => {
        const { left, width } = (
          evt.target as HTMLDivElement
        ).getBoundingClientRect();
        const x = evt.clientX - left;
        if (x > width) return void 0;
        requestAnimationFrame(() => {
          if (!this.enabledPointer) return void 0;
          const pointer = {
            pos: x,
            show: true,
          };
          if (this.draggingPointer) {
            setState((prev) => ({
              ...prev,
              played: (x / width) * this.audio.duration,
              pointer,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              pointer,
            }));
          }
        });
      };
      enablePointer = () => {
        this.enabledPointer = true;
      };
      onPointerDragStart = () => {
        this.draggingPointer = true;
        window.addEventListener('mouseup', this.onPointerDragEnd);
      };
      onPointerDragEnd = () => {
        this.draggingPointer = false;
        window.removeEventListener('mouseup', this.onPointerDragEnd);
        this.audio.play().catch(logger.error);
      };
      disablePointer = () => {
        if (this.draggingPointer) return void 0;
        this.enabledPointer = false;
        setState((prev) => ({
          ...prev,
          pointer: {
            pos: 0,
            show: false,
          },
        }));
      };
    })();
  }, []);
  useEffect(() => {
    let objectURL: string | void = void 0;
    const readCover = (image: ImageValue, ost: string) => {
      const file = new File(
        [image.data as ArrayBuffer],
        `${ost}-${image.description}`,
        { type: image.mime || 'image/png' }
      );
      objectURL = URL.createObjectURL(file);
      return objectURL;
    };
    metadataParser(src)
      .then((tags) => {
        if (!tags) return void 0;
        // console.log(`"${tags.title}"`, isNonUTF8(tags.title || ''));
        setMetadata({
          title: tags.title || void 0,
          artist: tags.artist || void 0,
          cover: tags.image
            ? readCover(tags.image, tags.album || 'Album cover')
            : void 0,
        });
      }, logger.error)
      .finally(() => {
        setState((state) => ({
          ...state,
          ready: true,
        }));
      });
    return () => {
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [src]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return void 0;
    const raw_document_title = document.title;
    audio.ondurationchange = () =>
      setState((prev) => ({
        ...prev,
        duration: audio.duration,
      }));
    audio.onplaying = () =>
      setState((prev) => ({
        ...prev,
        loading: true,
      }));
    audio.onerror = () =>
      setState((prev) => ({
        ...prev,
        error: true,
      }));
    audio.onwaiting = () =>
      setState((prev) => ({
        ...prev,
        loading: true,
      }));
    audio.onended = () => {
      document.title = raw_document_title;
      setState((prev) => ({
        ...prev,
        paused: true,
      }));
    };
    audio.onplay = () => {
      if (audio.dataset['audioTitle'])
        document.title = `🎵 ${audio.dataset['audioTitle']}`;
      setState((prev) => ({
        ...prev,
        paused: false,
      }));
    };
    audio.onpause = () => {
      document.title = raw_document_title;
      setState((prev) => ({
        ...prev,
        paused: true,
      }));
    };
    audio.ontimeupdate = () =>
      setState((prev) => ({
        ...prev,
        played: audio.currentTime,
        loading: false,
      }));
    audio.onsuspend = () =>
      setState((prev) => ({
        ...prev,
        loaded: audio.buffered.length > 0 ? audio.buffered.end(0) : 0,
      }));
  }, []);
  return (
    <div className={clsx('audio-player', className)}>
      {!state.ready && <div className="audio-skeleton" />}
      <audio
        ref={audioRef}
        controls={false}
        data-audio-title={metadata.title || title || void 0}
        data-audio-filename={title || void 0}
      >
        <source src={src} type={type} />
      </audio>
      <div
        className="audio-left"
        style={{ animationPlayState: state.paused ? 'paused' : 'running' }}
      >
        {metadata.cover && (
          <img className="album-cover" src={metadata.cover} alt="album cover" />
        )}
      </div>
      <div className="audio-right">
        <div>
          <span className="audio-title">
            {metadata.title || title || 'Unknown Audio'}
          </span>
          {metadata.artist && (
            <span className="audio-artist">{metadata.artist}</span>
          )}
          <span className="loading" style={{ opacity: state.loading ? 1 : 0 }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="audio-icon"
              viewBox="0 0 100 100"
            >
              <rect x="20" y="30" width="5" height="40">
                <animate
                  attributeName="y"
                  calcMode="linear"
                  values="40;20;40"
                  dur="1s"
                  begin="-0.2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="height"
                  calcMode="linear"
                  values="20;60;20"
                  dur="1s"
                  begin="-0.2s"
                  repeatCount="indefinite"
                />
              </rect>
              <rect x="50" y="30" width="5" height="40">
                <animate
                  attributeName="y"
                  calcMode="linear"
                  values="40;20;40"
                  dur="1.1s"
                  begin="-0.1s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="height"
                  calcMode="linear"
                  values="20;60;20"
                  dur="1.1s"
                  begin="-0.1s"
                  repeatCount="indefinite"
                />
              </rect>
              <rect x="80" y="30" width="5" height="40">
                <animate
                  attributeName="y"
                  calcMode="linear"
                  values="40;20;40"
                  dur="1.2s"
                  begin="0s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="height"
                  calcMode="linear"
                  values="20;60;20"
                  dur="1.2s"
                  begin="0s"
                  repeatCount="indefinite"
                />
              </rect>
            </svg>
          </span>
        </div>
        <div className="audio-controls">
          <button onClick={controllers.toggle} className="audio-button">
            {state.paused ? (
              <PlayIcon className="audio-icon" />
            ) : (
              <PauseIcon className="audio-icon" />
            )}
          </button>
          <button onClick={controllers.setLoop} className="audio-button">
            {state.loop ? (
              <LoopOnIcon className="audio-icon" />
            ) : (
              <LoopOffIcon className="audio-icon" />
            )}
          </button>
          <span>{mmss(state.played)}</span>
          <div
            className="audio-bar-wrap"
            onMouseMove={controllers.dragPointer}
            onMouseOut={controllers.disablePointer}
            onMouseOver={controllers.enablePointer}
            onMouseDown={controllers.onPointerDragStart}
            onClick={controllers.setTime}
          >
            <div
              className="audio-pointer"
              style={{
                display: state.pointer.show ? 'block' : 'none',
                transform: `translateX(${state.pointer.pos}px)`,
              }}
            />
            <div className="audio-bar-container">
              <div
                className="audio-loaded"
                style={{ width: controllers.getWidth(state.loaded) }}
              />
              <div
                className="audio-played"
                style={{ width: controllers.getWidth(state.played) }}
              />
            </div>
          </div>
          <span>{mmss(state.duration)}</span>
        </div>
      </div>
    </div>
  );
});

const pad = (str: number) => {
  return str.toString().padStart(2, '0');
};

const mmss = (duration: number) => {
  return `${pad(Math.floor(duration / 60) | 0)}:${pad(
    Math.floor(duration % 60) | 0
  )}`;
};
