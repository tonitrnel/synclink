import { createContext, createElement, FC, ReactNode, useContext } from 'react';
import { DataEntryWithExtras } from '../_types';

const __ENTRY_CONTEXT__ = createContext<DataEntryWithExtras | null>(null);

export const EntryProvider: FC<{
    value: DataEntryWithExtras;
    children: ReactNode;
}> = ({ value, children }) => {
    return createElement(
        __ENTRY_CONTEXT__.Provider,
        {
            value,
        },
        children,
    );
};

export const useEntry = () => {
    const entry = useContext(__ENTRY_CONTEXT__);
    if (!entry)
        throw new Error(
            'Required context was not found. Please make sure to use it within an <EntryProvider/> component.',
        );
    return entry;
};
