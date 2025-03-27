import { useLatestRef } from '@ptdgrp/shared-react';
import { XIcon } from 'icons';
import {
  ChangeEvent,
  FC,
  HTMLAttributes,
  memo,
  useCallback,
  KeyboardEvent,
  useRef,
  useState,
  DOMAttributes,
  Ref,
} from 'react';
import { clsx } from '~/utils/clsx';
import './tag-input.less';

export interface TagInputProps {
  value: string[];
  placeholder?: string;
  max?: number;
  onChange(tags: string[]): void;
  onInputChange?(evt: ChangeEvent<HTMLInputElement>): void;
  separator?: string;
}

export const TagInput: FC<
  TagInputProps &
    Omit<HTMLAttributes<HTMLDivElement>, keyof DOMAttributes<HTMLDivElement>>
> = memo(
  ({
    value,
    placeholder,
    separator = ',',
    max = Infinity,
    onChange: onChangeProp,
    onInputChange,
    className,
    ...props
  }) => {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const valueRef = useLatestRef(value);
    const onChange = useCallback(
      (evt: ChangeEvent<HTMLInputElement>) => {
        setInput(evt.target.value);
        onInputChange?.(evt);
      },
      [onInputChange],
    );
    const onRemove = useCallback(
      (tag: string) => {
        const value = valueRef.current;
        const index = value.indexOf(tag);
        if (index >= 0) {
          const newValue = [...value];
          newValue.splice(index, 1);
          onChangeProp(newValue);
        }
      },
      [onChangeProp, valueRef],
    );
    const onKeyDown = useCallback(
      (evt: KeyboardEvent<HTMLInputElement>) => {
        const value = valueRef.current;
        const input = inputRef.current!;
        switch (evt.key) {
          case 'Enter':
          case separator: {
            evt.preventDefault();
            if (!value.includes(input.value) && input.value.length > 0) {
              onChangeProp([...value, input.value]);
              setInput('');
            }
            return void 0;
          }
          case 'Backspace': {
            if (input.value.length > 0) return void 0;
            evt.preventDefault();
            if (value.length > 0) {
              onChangeProp(value.slice(0, -1));
            }
            return void 0;
          }
        }
      },
      [onChangeProp, separator, valueRef],
    );
    return (
      <div className={clsx('ui-tag-input', className)} {...props}>
        <TagList tags={value} onRemove={onRemove} inputRef={inputRef} />
        <input
          ref={inputRef}
          value={input}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={placeholder}
          onKeyDown={onKeyDown}
          onChange={onChange}
          disabled={value.length >= max}
          className={value.length >= max ? 'hidden' : undefined}
        />
      </div>
    );
  },
);

const TagList: FC<{
  tags: string[];
  inputRef: Ref<HTMLInputElement>;
  onRemove(tags: string): void;
}> = memo(({ tags, onRemove }) => {
  return (
    <>
      {tags.map((it) => (
        <div aria-label={it} key={it}>
          <span>{it}</span>
          <XIcon
            role="button"
            aria-label="remove tag"
            className="h-4 w-4"
            onClick={() => onRemove(it)}
          />
        </div>
      ))}
    </>
  );
});
