import { FC, useCallback, useEffect, useState } from 'react';
import { clsx } from '~/utils/clsx.ts';
import { motion, AnimatePresence } from 'framer-motion';
import { useConstant } from '@ptdgrp/shared-react';
import { MusicIcon } from 'lucide-react';

export const AudioGlobalController: FC<{
  className?: string;
}> = ({ className }) => {
  const audioIds = useConstant(() => new Set<string>());
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const rec = (evt: Event) => {
      if (evt instanceof CustomEvent) {
        const id = evt.detail as string;
        if (!id) return void 0;
        const audio = document.body.querySelector(
          `audio[data-audio-id="${id}"]`,
        ) as HTMLAudioElement;
        if (!audio) return void 0;
        if (audio.paused) {
          audioIds.delete(id);
          if (audioIds.size == 0) setPlaying(false);
        } else {
          audioIds.add(id);
          setPlaying(true);
        }
      }
    };
    document.body.addEventListener('audio-playback-change', rec);
    return () => {
      return document.body.removeEventListener('audio-playback-change', rec);
    };
  }, [audioIds]);
  const stopAll = useCallback(() => {
    for (const id of audioIds) {
      const audio = document.body.querySelector(
        `audio[data-audio-id="${id}"]`,
      ) as HTMLAudioElement;
      if (!audio) continue;
      audio.pause();
    }
    audioIds.clear();
  }, [audioIds]);
  return (
    <AnimatePresence>
      {playing && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          whileHover={{ opacity: 0.5 }}
          className={clsx(
            className,
            'text-white',
            playing ? 'inline-flex' : 'none',
          )}
          onClick={stopAll}
        >
          <MusicIcon className="h-6 w-6 stroke-current" />
        </motion.button>
      )}
    </AnimatePresence>
  );
};
