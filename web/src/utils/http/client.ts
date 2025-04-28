import {
    createContext,
    createElement,
    FC,
    PropsWithChildren,
    useContext,
} from 'react';
import { QueriesCache } from './cache.ts';

type ClientOptions = {
    cache?: {
        capacity?: number;
        staleTime?: number;
    };
    baseUrl?: string;
    fetcher: (request: Request) => Promise<[unknown, Response]>;
    default?: {
        query?: {
            // query execute function options.
            execution?: {
                /**
                 * If the silent mode is true, then the execution will not trigger a re-render of React Component.
                 * @default true
                 */
                silent?: boolean;
            };
        };
        mutation?: {
            // mutation execute function options.
            execution?: {
                /**
                 * If the silent mode is true, then the execution will not trigger a re-render of React Component.
                 * @default true
                 */
                silent?: boolean;
            };
        };
    };
};

export type Client = {
    // internal use, Queries cache
    queries: QueriesCache<unknown, unknown>;
    // internal use
    options: ClientOptions;
};
const __CLIENT__ = createContext<Client | null>(null);

export const createHttpClient = (options: ClientOptions): Client => {
    return {
        options,
        queries: new QueriesCache(options.cache?.capacity ?? 24),
    };
};

export const useHttpClient = () => {
    const value = useContext(__CLIENT__);
    if (!value)
        throw new Error(
            ' "useHttpClient" hook must be invoked under <HttpClientProvider/>',
        );
    return value;
};

export const HttpClientProvider: FC<PropsWithChildren<{ value: Client }>> = ({
    value,
    children,
}) => {
    return createElement(
        __CLIENT__.Provider,
        {
            value,
        },
        children,
    );
};
