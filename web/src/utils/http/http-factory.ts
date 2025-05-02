/* eslint-disable @typescript-eslint/no-empty-object-type */
// https://github.com/tonitrnel/painted-http
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
} from 'react';
import { useHttpClient } from './client.ts';
import { useLatestFunc, useLatestRef } from '@ptdgrp/shared';
import {
    isEquals,
    isArray,
    isDef,
    isNumber,
    isPlainObject,
    isString,
    pick,
    pipe,
} from '@ptdgrp/shared';
import { QueryCacheObject } from './cache.ts';

export type HttpSchemaProperties = {
    Query: {};
    Path: {};
    Body:
        | Record<string, unknown>
        | number[]
        | ArrayBuffer
        | Uint8Array
        | Blob
        | File;
    Headers: object;
    Response: unknown;
    Error: unknown;
};

type ApplicableKeys = keyof HttpSchemaProperties;

type Override<Base extends {}, K extends keyof Base, V extends Base[K]> = {
    [P in keyof Base]: P extends K ? V : Base[P];
};

export interface Serializers<TQuery, TBody> {
    query?(query: TQuery): unknown;

    body?(body: TBody): unknown;
}

type RefreshOptions = {
    // 如果处于 pending 则忽略
    skipOnPending?: boolean;
    // 如果未启用则忽略
    skipOnDisabled?: boolean;
    // 如果组件已被卸载则忽略
    skipOnUnmounted?: boolean;
};

type RefreshFunc = (options?: RefreshOptions | UIEvent) => Promise<void>;

// 用于辅助函数参数，如果值为空的对象则可以省略传参（void 类型为 function 参数类型时可以省略穿参）
// type AcceptOptional<T extends {}> = {} extends T ? void | T : T;
type isAcceptOptional<T extends {}> = {} extends T ? true : false;

/**
 * 决定返回的类型
 * @param R1 请求返回的类型
 * @param R2 onSuccess 函数返回类型
 */
export type ResolvedResponseType<R1, R2> = unknown extends R2
    ? R1
    : R2 extends void
      ? R1
      : R2;

// ====== Query Type ======

export interface HttpQueryHookOptions<
    S extends HttpSchemaProperties,
    Mutated = S['Response'],
    I = Request,
    O = Response,
> {
    /**
     * 查询参数
     *
     * 注：`query` 所有字段将会作为自动发起请求的依赖，即指发生变化时自动发起请求
     *
     * @example ```typescript
     * const useUsersQuery = createQueryFactory('/api/users/list');
     * const [pagination, setPagination] = useState({ page: 1, size: 10 })
     * const usersQuery = useUsersQuery({
     *   query: {
     *     page: pagination.page,
     *     size: pagination.size,
     *   }
     * })
     * ```
     */
    query?: S['Query'];
    /**
     * 路径参数
     *
     * 注：`query` 所有字段将会作为自动发起请求的依赖，即指发生变化时自动发起请求
     *
     * @example ```typescript
     * const useUserQuery = createQueryFactory('/api/users/{userId}');
     * const [userId, setUserId] = useState("25654...")
     * const userQuery = useUserQuery({
     *   path: {
     *     userId
     *   }
     * })
     * ```
     */
    path?: S['Path'];
    /**
     * 启用该查询
     * @example ```typescript
     * const useUsersQuery = createQueryFactory('/api/users/list');
     * const [pagination, setPagination] = useState({ page: 1, size: 10 })
     * const usersQuery = useUsersQuery({
     *   query: {
     *     page: pagination.page,
     *     size: pagination.size,
     *   },
     *   enabled: false
     * })
     * ```
     * @tips 建议使用Boolean强行转为boolean值
     * @default true
     */
    enabled?: boolean;
    /**
     * 请求头数据
     *
     * 注: `headers` 不会作为自动发起请求的依赖
     */
    headers?: S['Headers'];
    /**
     * fetch init 配置
     *
     * 注: `init` 不会作为自动发起请求的依赖
     */
    init?: RequestInit;
    /**
     * 在禁用时保留存在的数据
     * @default false
     */
    keepDirtyOnDisabled?: boolean;
    /**
     * 在加载时保留存在的数据
     * @default true
     */
    keepDirtyOnPending?: boolean;
    /**
     * 自定义如何序列化 query 参数
     */
    serializers?: Omit<Serializers<S['Query'], unknown>, 'body'>;
    /**
     * Custom fetcher function
     * @description This function can be used to override default behaviors.
     */
    fetcher?: (input: I) => Promise<[S['Response'], O]>;
    /**
     * 是否启用缓存
     * @example ```ts
     * const useUsersQuery = createQueryFactory('/api/users/list')
     * useUsersQuery({
     *     cache: {
     *       cacheKey: 'users',
     *       cacheAge: 1000 * 60 * 60,
     *       cacheLife: 'outer',
     *     }
     * })
     * ```
     * @default false
     */
    cache?:
        | {
              /**
               * 缓存键
               */
              key: string;
              /**
               * 缓存有效期(unit: ms)
               * @default 5 Minutes
               */
              staleTime?: number;
              /**
               * 缓存生命周期
               * @param inner 只在当前组件生命周期内有效
               * @param outer `HttpClientProvider` 组件生命周期内有效
               * @default outer
               */
              scope?: 'inner' | 'outer';
          }
        | true;
    /**
     * 当成功时的回调，返回值将作为新的数据
     * @param data
     * @param response
     * @description 可以用于自定义返回数据，该方法返回的值不会作为 `execute` 方法的返回值
     */
    onSuccess?: (
        data: S['Response'],
        context: { input: I; output: O },
    ) => Mutated | Promise<Mutated>;
    /**
     * 当错误时的回调
     * @param error
     */
    onError?: (error: S['Error']) => void;
    /**
     * 当请求无论是错误或成功都会执行的回调函数
     */
    onFinally?: () => void;
    /**
     * 当请求发出前执行的回调函数
     */
    onBefore?: () => void | Promise<void>;
}

// QueryContext Variants
type QueryPendingContext<
    S extends HttpSchemaProperties,
    I = Request,
    O = Response,
> = Readonly<{
    kind: 'pending';
    pending: true | undefined;
    error: undefined;
    done: false | undefined;
    request: I | undefined;
    response: O | undefined;
    execute: QueryExecuteFunc<S>;
    refresh: RefreshFunc;
}>;

type QuerySuccessContext<
    S extends HttpSchemaProperties,
    I = Request,
    O = Response,
> = Readonly<{
    kind: 'success';
    pending: false;
    error: undefined;
    done: true;
    request: I;
    response: O;
    execute: QueryExecuteFunc<S>;
    refresh: RefreshFunc;
}>;

type QueryErrorContext<
    S extends HttpSchemaProperties,
    I = Request,
    O = Response,
> = Readonly<{
    kind: 'error';
    pending: false;
    error: S['Error'];
    done: true;
    request: I;
    response: O | undefined;
    execute: QueryExecuteFunc<S>;
    refresh: RefreshFunc;
}>;

type QueryExecuteOptions<S extends HttpSchemaProperties> = {
    init?: RequestInit;
    /**
     * 路径参数
     */
    path?: S['Path'];
    /**
     * 是否静默
     * @description 如果为false将触发React重新渲染
     * @default true
     */
    silent?: boolean;
    /**
     * 自定义如何对 query 进行序列化
     */
    serializers?: Omit<Serializers<S['Query'], never>, 'body'>;
};

type QueryExecuteFunc<S extends HttpSchemaProperties> = (
    ...args: isAcceptOptional<S['Query']> extends true
        ? [query?: S['Query'], options?: QueryExecuteOptions<S>]
        : [query: S['Query'], options?: QueryExecuteOptions<S>]
) => Promise<S['Response']>;

export type HttpQueryHookReturn<D, S extends HttpSchemaProperties, I, O> =
    | Readonly<{ data: undefined } & QueryPendingContext<S, I, O>>
    | Readonly<{ data: D } & QuerySuccessContext<S, I, O>>
    | Readonly<{ data: undefined } & QueryErrorContext<S, I, O>>;

// ====== Mutation Type ======

export type HttpMutationHookOptions<
    S extends HttpSchemaProperties,
    I = Request,
    O = Response,
> = {
    /**
     * 查询参数
     */
    query?: S['Query'];
    /**
     * 路径参数
     */
    path?: S['Path'];
    /**
     * header参数
     */
    headers?: S['Headers'];
    /**
     * Custom fetcher function
     * @description This function can be used to override default behaviors.
     */
    fetcher?: (request: Request) => Promise<[S['Response'], O]>;
    /**
     * fetch init 配置
     */
    init?: RequestInit;
    /**
     * 当请求发出前执行的回调函数
     */
    onBefore?: () => void | Promise<void>;
    /**
     * 当请求成功时的回调函数
     * @param data
     * @param response
     */
    onSuccess?: (data: S['Response'], context: { input: I; output: O }) => void;
    /**
     * 当请求失败时的回调函数
     * @param error
     */
    onError?: (error: S['Error']) => void;
    /**
     * 当请求无论是错误或成功都会执行的回调函数
     */
    onFinally?: () => void;
};

export type HttpMutationHookReturn<S extends HttpSchemaProperties> =
    | Readonly<{ data: undefined } & MutationPendingContext<S>>
    | Readonly<{ data: S['Response'] } & MutationSuccessContext<S>>
    | Readonly<{ data: undefined } & MutationErrorContext<S>>;

// MutationContext Variants
type MutationPendingContext<S extends HttpSchemaProperties> = Readonly<{
    kind: 'pending';
    pending: true | undefined;
    error: undefined;
    done: false | undefined;
    request: Request | undefined;
    response: Response | undefined;
    execute: MutationExecuteFunc<S>;
}>;

type MutationSuccessContext<S extends HttpSchemaProperties> = Readonly<{
    kind: 'success';
    pending: false;
    error: undefined;
    done: true;
    request: Request;
    response: Response;
    execute: MutationExecuteFunc<S>;
}>;

type MutationErrorContext<S extends HttpSchemaProperties> = Readonly<{
    kind: 'error';
    pending: false;
    error: S['Error'];
    done: true;
    request: Request;
    response: Response | undefined;
    execute: MutationExecuteFunc<S>;
}>;

type MutationExecuteFunc<S extends HttpSchemaProperties> = (
    ...args: isAcceptOptional<S['Body']> extends true
        ? [body?: S['Body'], config?: MutationExecuteOptions<S>]
        : [body: S['Body'], config?: MutationExecuteOptions<S>]
) => Promise<S['Response']>;

export type MutationExecuteOptions<S extends HttpSchemaProperties> = {
    init?: RequestInit;
    /**
     * 是否静默
     * @description 如果为false将触发React重新渲染
     * @default true
     */
    silent?: boolean;
    /**
     * query 参数
     */
    query?: S['Query'];
    /**
     * 路径参数
     */
    path?: S['Path'];
    /**
     * 自定义如何对 query 或 body 进行序列化
     */
    serializers?: Serializers<S['Query'], S['Body']>;
};

// ====== Request Type ======

type HttpRequestOptions<
    S extends HttpSchemaProperties,
    Serialized = S['Response'],
> = {
    baseUrl?: string;
    init?: RequestInit;
    serializers?: {
        query?(query: S['Query']): Record<string, string | number>;
        body?(body: S['Body']): unknown;
        response?(response: Response): Serialized | Promise<Serialized>;
    };
    fetcher?: (req: Request) => Promise<Response>;
} & ComposeOptions<S['Query'], 'query'> &
    ComposeOptions<S['Body'], 'body'> &
    ComposeOptions<S['Path'], 'path'> &
    ComposeOptions<S['Headers'], 'headers'>;
type ComposeOptions<Val, Key extends string> = {} extends Val
    ? { [K in Key]?: Val }
    : {
          [K in Key]: Val;
      };

export class HttpFactory<
    S extends HttpSchemaProperties,
    I = Request,
    O extends [unknown, unknown] = [unknown, Response],
> {
    constructor(
        private method: string,
        private pathname: string,
        // 可选，如果不指定则从 client 中获取
        private baseUrl?: string,
        private fetcher?: (input: I) => Promise<O>,
        // 或许永远用不到
        private mode: 'http' | 'custom' = 'http',
    ) {}

    // public static reconstruct<F extends Function, S extends ExtractFullSchema<F>>(
    //   fn: F,
    // ) {
    //   if (!Reflect.has(fn, ' __source'))
    //     throw new Error(`Unable to reconstruct the ${fn.name} function`);
    //   const { method, pathname } = Reflect.get(fn, ' __source') as {
    //     method: string;
    //     pathname: string;
    //   };
    //   return new HttpFactory<S>(method, pathname);
    // }

    /**
     * 应用 TypeScript 类型
     *
     * 可应用的类型有:
     *   - Query: 应用查询类型
     *   - Path: 应用路径参数类型（注: 不要指定该类型，路径参数会自动推导，详见示例）
     *   - Body: 应用数据主体类型
     *   - Headers: 应用 HTTP 头类型(不常见)
     *   - Response: 应用响应类型(不常见)
     *   - Error: 应用错误类型
     *
     * ## 示例代码
     * ```ts
     * createHttpFactory('GET:/users')
     *   .apply<'Query', { page: number, size: number }>
     *   .apply<'Response', { id: string, nickname: string }[]>
     * ```
     *
     * ## 示例代码
     * ```ts
     * // 自动推导路径参数
     * createHttpFactory('GET:/users/{user_id}')
     * // 等同与
     * createHttpFactory('GET:/users/{user_id}')
     *   .apply<'Path', { user_id: string }>
     * ```
     */
    public apply<
        K extends keyof HttpSchemaProperties | never = never,
        T extends K extends never ? never : HttpSchemaProperties[K] = never,
    >(
        ...args:
            | [key: 'fetcher', value: ((input: I) => Promise<O>) | undefined]
            | [key: 'method', value: string]
            | [key: 'pathname', value: string]
            | [key: 'baseUrl', value: string | undefined]
            | []
    ) {
        if (args.length === 2) {
            const [key, value] = args;
            switch (key) {
                case 'fetcher':
                    this.fetcher = value;
                    break;
                case 'method':
                    this.method = value;
                    break;
                case 'pathname':
                    this.pathname = value;
                    break;
                case 'baseUrl':
                    this.baseUrl = value;
                    break;
                default:
                    break;
            }
        }
        return this as unknown as K extends never
            ? HttpFactory<S, I, O>
            : // @ts-expect-error 强制应用新类型
              HttpFactory<Override<S, K, T>, I, O>;
    }

    /**
     * 制作一个 Query 请求 Hook，常用于 GET 请求
     *
     * 注: 该请求 Hook 会在使用时立即发出请求
     */
    public makeQuery = () => {
        const {
            pathname,
            method,
            baseUrl,
            fetcher: _local_fetcher,
            mode,
        } = this;
        let _call_seq = 0;

        function useHttpQuery<Serialized>(
            options: HttpQueryHookOptions<S, Serialized, I, O[1]> = {},
        ) {
            type SerializedData = ResolvedResponseType<
                S['Response'],
                Serialized
            >;
            type UnknownSubscriber = (
                subscriber: readonly [unknown, unknown, unknown],
                key: string,
            ) => void;
            type UnknownCacheObject = QueryCacheObject<unknown, unknown>;

            type Expose = {
                pending?: boolean;
                data?: SerializedData | undefined;
                error?: S['Error'] | undefined;
                response?: O[1];
                request?: I;
            };
            const exposeRef = useRef<Expose>({});
            type Metadata = {
                // 标记组件是否卸载
                unmounted?: boolean;
                // 标记组件第一次是否加载完成
                done?: boolean;
                // 标准当前请求的ID
                requestId?: string | undefined;
                // 查询参数
                query?: S['Query'];
                // 路径参数
                path?: S['Path'];
                // 当前Hooks缓存的ID
                cachedIds?: Set<string>;
                // 标记依赖是否过时，主要根据 Query 和 Path 参数来决定，用于防止 enabled 切换导致重新请求
                depOutdated?: boolean;
            };
            const metadataRef = useRef<Metadata>({});
            // 强制刷新
            const triggerUpdate = useReducer(() => ({}), { pathname })[1];

            const client = useHttpClient();
            // 引用最新的配置
            const mergedOptionsRef = useLatestRef({
                ...options,
                client,
                cache:
                    options.cache === true ? { key: pathname } : options.cache,
                fetcher: options.fetcher || client.options.fetcher,
            });

            const fetcher = (mergedOptionsRef.current?.fetcher ||
                _local_fetcher ||
                client.options.fetcher) as (
                request: Request,
            ) => Promise<[unknown, Response]>;
            if (!fetcher) throw new Error('Failed to initialize fetcher');

            // 构建参数依赖
            const deps = useMemo(() => {
                const { query: previousQuery, path: previousPath } =
                    metadataRef.current;
                if (
                    (!previousQuery && !!options.query) ||
                    !isEquals(previousQuery, options.query)
                ) {
                    metadataRef.current.query = options.query;
                    metadataRef.current.depOutdated = true;
                }
                if (
                    (!previousPath && !!options.path) ||
                    !isEquals(previousPath, options.path)
                ) {
                    metadataRef.current.path = options.path;
                    metadataRef.current.depOutdated = true;
                }
                return pick(metadataRef.current, ['query', 'path']);
            }, [options.path, options.query]);

            // 缓存订阅
            const cacheSubscriber = useCallback(
                async (ret: readonly [unknown, I, O[1]], key: string) => {
                    const metadata = metadataRef.current;
                    const expose = exposeRef.current;
                    const mergedOptions = mergedOptionsRef.current;
                    if (expose.pending || metadata.unmounted) return void 0;
                    if (
                        !mergedOptions.cache ||
                        makeCacheKey(mode, mergedOptions.cache.key) !== key
                    )
                        return void 0;

                    try {
                        expose.data = ((await mergedOptions.onSuccess?.(
                            ret[0] as S['Response'],
                            {
                                input: ret[1],
                                output: ret[2],
                            },
                        )) ?? ret[0]) as SerializedData;
                        expose.response = ret[2];
                        expose.request = ret[1];
                        triggerUpdate();
                    } catch (e) {
                        console.error('An error occurred while notifying', e);
                    }
                },
                [mergedOptionsRef, triggerUpdate],
            );

            // 清理状态
            const cleanup = useCallback(() => {
                // 注意 不要使用新的对象
                Object.keys(exposeRef.current).forEach(
                    (key) =>
                        void (exposeRef.current[key as keyof Expose] = void 0),
                );
            }, []);

            /**
             * 制作 request
             * @param options
             * @returns [响应数据，原始请求, 原始响应]
             */
            const makeRequest = useCallback(
                async (
                    options?: {
                        query?: S['Query'];
                        path?: S['Path'];
                    } & QueryExecuteOptions<S>,
                ) => {
                    const mergedOptions = mergedOptionsRef.current;
                    const url = new URL(
                        baseUrl ||
                            mergedOptions.client.options.baseUrl ||
                            location.origin,
                    );
                    populatePathParams(
                        url,
                        pathname,
                        options?.path || deps.path,
                    );
                    if (options?.query || deps.query) {
                        const search = new URLSearchParams();
                        const params = pipe(
                            (options?.query || deps.query) as S['Query'],
                        )(
                            options?.serializers?.query ||
                                mergedOptions.serializers?.query,
                        )() as Record<string, string>;
                        for (const key of Object.keys(params)) {
                            if (!isDef(params[key])) continue;
                            search.append(key, String(params[key]));
                        }
                        url.search = search.toString();
                    }
                    const req = new Request(url, {
                        method,
                        ...mergedOptions.init,
                        ...options?.init,
                        headers: mergeHeaders(
                            mergedOptions.headers,
                            options?.init?.headers,
                        ),
                    });
                    const ret = (await fetcher(req)) as [
                        S['Response'],
                        Response,
                    ];
                    return [ret[0], req as I, ret[1]] as const;
                },
                [mergedOptionsRef, deps.path, deps.query, fetcher],
            );
            const makeInvoke = useCallback(
                async (
                    params?: S['Body'],
                ): Promise<readonly [S['Response'], I, O[1]]> => {
                    if (!_local_fetcher)
                        throw new Error('Fetcher is not defined');
                    const ret = await _local_fetcher(
                        (params || deps.query) as I,
                    );
                    return [ret[0], (params || deps.query) as I, ret[1]];
                },
                [deps.query],
            );
            const executor = mode === 'http' ? makeRequest : makeInvoke;
            /**
             * Hook 请求执行函数
             * @param refreshCache 是否刷新缓存 (default: false)
             */
            const implicitly = useCallback(
                async (refreshCache = false) => {
                    const expose = exposeRef.current;
                    const metadata = metadataRef.current;
                    const mergedOptions = mergedOptionsRef.current;
                    expose.pending = true;
                    // 在loading时无需保留上一次的数据
                    if (!mergedOptions.keepDirtyOnPending) {
                        expose.data = void 0;
                        expose.response = void 0;
                        expose.error = void 0;
                    }
                    triggerUpdate();
                    const requestId = `:${mode}+${Date.now()}#${_call_seq++}`;
                    metadata.requestId = requestId;
                    try {
                        await mergedOptions.onBefore?.();
                        const ret = await new Promise<
                            readonly [S['Response'], I, O[1]]
                        >((resolve, reject) => {
                            let cacheObject: QueryCacheObject<I, O[1]>;
                            type DefaultResolveType = (value: unknown) => void;

                            // 未启用缓存，直接执行退出
                            if (!mergedOptions.cache)
                                return void executor().then(resolve, reject);
                            // 处理缓存等待队列的逻辑
                            const doPromise = () =>
                                executor()
                                    .then(
                                        (ret) => {
                                            // console.log(
                                            //   '处理缓存等待队列',
                                            //   cacheObject.waitingQueue.resolves.length
                                            // );
                                            // 更新缓存过期时间
                                            cacheObject.expireTime =
                                                Date.now() + staleTime;
                                            cacheObject.waitingQueue.resolves.forEach(
                                                (resolve) => resolve(ret),
                                            );
                                            cacheObject.notifyQueue.forEach(
                                                (notify) =>
                                                    notify(
                                                        ret,
                                                        mergedOptions.cache!
                                                            .key,
                                                    ),
                                            );
                                            cacheObject.stage = 'active';
                                            return ret;
                                        },
                                        (reason) => {
                                            cacheObject.waitingQueue.rejects.forEach(
                                                (reject) => reject(reason),
                                            );
                                            cacheObject.stage = 'inactive';
                                            throw reason;
                                        },
                                    )
                                    .finally(() => {
                                        cacheObject.waitingQueue.resolves = [];
                                        cacheObject.waitingQueue.rejects = [];
                                    });
                            const now = Date.now();
                            const staleTime =
                                mergedOptions.cache?.staleTime ??
                                mergedOptions.client.options.cache?.staleTime ??
                                300_000;
                            const expireTime = now + staleTime;
                            const cacheKey = makeCacheKey(
                                mode,
                                mergedOptions.cache.key,
                            );
                            // 存在缓存
                            if (mergedOptions.client.queries.has(cacheKey)) {
                                const item =
                                    mergedOptions.client.queries.get(cacheKey)!;
                                // 添加自身的缓存通知
                                const exists = item.notifyQueue.has(
                                    cacheSubscriber as UnknownSubscriber,
                                );
                                if (!exists)
                                    item.notifyQueue.add(
                                        cacheSubscriber as UnknownSubscriber,
                                    );
                                // 缓存还未生成
                                if (item.stage === 'pending') {
                                    // console.log('追加队列', item.expireTime, now);
                                    item.waitingQueue.resolves.push(
                                        resolve as DefaultResolveType,
                                    );
                                    item.waitingQueue.rejects.push(reject);
                                    return void 0;
                                }
                                // 缓存可用 并且 未指定强制刷新缓存 并且 缓存未过期
                                if (
                                    item.stage === 'active' &&
                                    !refreshCache &&
                                    item.expireTime > now
                                ) {
                                    // console.log('缓存命中');
                                    item.promise.then(
                                        resolve as DefaultResolveType,
                                        reject,
                                    );
                                    return void 0;
                                }
                                // 清除过期緩存
                                metadata.cachedIds!.delete(cacheKey);
                                mergedOptions.client.queries.delete(cacheKey);
                                // 重新设置缓存
                                cacheObject = {
                                    key: cacheKey,
                                    promise: doPromise(),
                                    stage: 'pending',
                                    expireTime,
                                    cacheScope:
                                        mergedOptions.cache.scope ?? 'outer',
                                    waitingQueue: {
                                        resolves: [
                                            resolve as DefaultResolveType,
                                        ],
                                        rejects: [reject],
                                    },
                                    notifyQueue: item.notifyQueue,
                                };
                            } else {
                                cacheObject = {
                                    key: cacheKey,
                                    promise: doPromise(),
                                    stage: 'pending',
                                    cacheScope: mergedOptions.cache.scope,
                                    expireTime,
                                    waitingQueue: {
                                        resolves: [
                                            resolve as DefaultResolveType,
                                        ],
                                        rejects: [reject],
                                    },
                                    notifyQueue: new Set([cacheSubscriber]),
                                };
                            }
                            // console.log('添加缓存,' cache.cacheKey, now);
                            mergedOptions.client.queries.set(
                                cacheKey,
                                cacheObject as UnknownCacheObject,
                            );
                            metadata.cachedIds!.add(cacheKey);
                        }).finally(() => {
                            // 请求是否过时(有一个新地请求已经发出)
                            if (requestId !== metadata.requestId) {
                                throw new OverdueError(
                                    'The request is outdated',
                                    {
                                        currentRequestId: requestId,
                                        latestRequestId: metadata.requestId,
                                    },
                                );
                            }
                            // hook是否卸载
                            if (metadata.unmounted) {
                                throw new OverdueError('The hook is unmounted');
                            }
                            // 请求完成，清理状态
                            cleanup();
                            expose.pending = false;
                            metadata.done = true;
                        });
                        expose.data = ((await mergedOptions.onSuccess?.(
                            ret[0],
                            {
                                input: ret[1],
                                output: ret[2],
                            },
                        )) ?? ret[0]) as SerializedData;
                        expose.request = ret[1];
                        expose.response = ret[2];
                        triggerUpdate();
                    } catch (e) {
                        if (e instanceof OverdueError) return void 0;
                        checkUnexpectedError(e);
                        mergedOptions.onError?.(e as S['Error']);
                        expose.error = e as S['Error'];
                        triggerUpdate();
                    } finally {
                        mergedOptions.onFinally?.();
                    }
                },
                [
                    mergedOptionsRef,
                    triggerUpdate,
                    executor,
                    cacheSubscriber,
                    cleanup,
                ],
            );
            /**
             * 执行GET请求
             * @param params 查询参数
             * @param config 配置项
             */
            const execute = useCallback<QueryExecuteFunc<S>>(
                async (...args) => {
                    const query = args[0] as S['Query'];
                    const executeOptions = (args[1] ?? {
                        silent: client.options.default?.query?.execution
                            ?.silent,
                    }) as QueryExecuteOptions<S>;
                    const expose = exposeRef.current;
                    const metadata = metadataRef.current;
                    const mergedOptions = mergedOptionsRef.current;

                    const rerender = createRerender(
                        executeOptions.silent === false,
                        triggerUpdate,
                    );
                    await mergedOptions.onBefore?.();
                    rerender(() => {
                        expose.pending = true;
                    });
                    let request: I;
                    try {
                        const ret = await executor({
                            query,
                            ...executeOptions,
                        }).finally(() => rerender(cleanup, false));
                        request = ret[1];
                        const serializedData =
                            ((await mergedOptions.onSuccess?.(ret[0], {
                                input: ret[1],
                                output: ret[2],
                            })) ?? ret[0]) as SerializedData;
                        rerender(() => {
                            expose.data = serializedData;
                            expose.request = ret[1];
                            expose.response = ret[2];
                        }, false);
                        return ret[0];
                    } catch (e) {
                        checkUnexpectedError(e);
                        rerender(() => {
                            expose.request = request;
                            expose.error = e as S['Error'];
                        }, false);
                        mergedOptions.onError?.(e as S['Error']);
                        throw e;
                    } finally {
                        if (!metadata.unmounted) {
                            rerender(() => {
                                expose.pending = false;
                                metadata.done = true;
                            });
                        }
                        mergedOptions.onFinally?.();
                    }
                },
                [
                    client.options.default?.query?.execution?.silent,
                    mergedOptionsRef,
                    triggerUpdate,
                    executor,
                    cleanup,
                ],
            );
            /**
             * 刷新请求
             *
             * ## 参数
             * - skipOnPending: 如果处于加载中则退出, 默认值:`false`
             * - skipOnDisabled: 如果未启用则退出, 默认值:`false`
             * - skipOnUnmounted: 如果已卸载则退出, 默认值:`false`
             */
            const refresh = useLatestFunc<RefreshFunc>(
                async (refreshOptions): Promise<void> => {
                    const { enabled } = mergedOptionsRef.current;
                    const { pending } = exposeRef.current;
                    const { unmounted } = metadataRef.current;
                    if (refreshOptions && isPlainObject(refreshOptions)) {
                        if (
                            unmounted &&
                            (options as RefreshOptions).skipOnUnmounted
                        )
                            return void 0;
                        if (
                            !enabled &&
                            (options as RefreshOptions).skipOnDisabled
                        )
                            return void 0;
                        if (
                            pending &&
                            (options as RefreshOptions).skipOnPending
                        )
                            return void 0;
                    }
                    await implicitly(true);
                },
            );
            // 在组件卸载时进行标记
            useEffect(() => {
                const metadata = metadataRef.current;
                metadata.unmounted = false;
                return () => {
                    metadata.unmounted = true;
                };
            }, []);
            // 初始化缓存和卸载时对部分缓存进行清除
            useEffect(() => {
                const { cache, client } = mergedOptionsRef.current;
                if (!cache) return void 0;
                const cacheIds = new Set<string>();
                metadataRef.current.cachedIds = cacheIds;
                return () => {
                    const now = Date.now();
                    for (const cacheId of cacheIds) {
                        const cacheObject = client.queries.get(cacheId);
                        if (!cacheObject) continue;
                        cacheObject.notifyQueue.delete(
                            cacheSubscriber as UnknownSubscriber,
                        );
                        if (cacheObject.cacheScope === 'inner') {
                            client.queries.delete(cacheId);
                        }
                        if (cacheObject.expireTime <= now) {
                            client.queries.delete(cacheId);
                        }
                    }
                };
            }, [mergedOptionsRef, cacheSubscriber]);
            // 触发请求
            useEffect(() => {
                if (options.enabled === false) return void 0;
                // 数据未过时，不需要重新触发
                if (metadataRef.current.depOutdated === false) {
                    return void 0;
                }
                metadataRef.current.depOutdated = false;
                implicitly().catch((err) => {
                    // 都是致命的错误，需要抛出让使用者解决
                    throw err;
                });
            }, [options.enabled, implicitly]);
            // 在 Hook enabled 设置为 false 时的相关逻辑
            useLayoutEffect(() => {
                if (options.enabled !== false) return void 0;
                const metadata = metadataRef.current;
                const expose = exposeRef.current;
                // 当该请求有启用变为未启用时的处理逻辑, 根据metadata.requestId判断当前hook是否处于活跃
                if (!options.keepDirtyOnDisabled && metadata.requestId) {
                    cleanup();
                    triggerUpdate();
                    metadata.depOutdated = true;
                } else if (expose.pending) {
                    // 在未启用时 pending 应始终为false
                    expose.pending = false;
                    triggerUpdate();
                }
                // 在 hook 处于 unable 时，将 requestId 设为空，标记处于请求中的已失效
                metadata.requestId = void 0;
            }, [
                cleanup,
                triggerUpdate,
                options.enabled,
                options.keepDirtyOnDisabled,
            ]);
            return {
                kind:
                    exposeRef.current.error !== void 0
                        ? 'error'
                        : exposeRef.current.pending !== false
                          ? 'pending'
                          : 'success',
                data: exposeRef.current.data,
                /**
                 * 当前组件是否处于 loading 状态
                 */
                pending: exposeRef.current.pending,
                /**
                 * 当前组件是否存在错误
                 */
                error: exposeRef.current.error,
                /**
                 * 当前组件是否处于 done 状态，该状态不会重置，意味着第一次请求后永远都是 true
                 */
                done: metadataRef.current.done,
                /**
                 * 上一次请求的响应
                 */
                request: exposeRef.current.request,
                response: exposeRef.current.response,
                /**
                 * 主动执行请求
                 */
                execute,
                /**
                 * 刷新请求
                 */
                refresh,
            } satisfies Record<
                keyof HttpQueryHookReturn<unknown, S, unknown, unknown>,
                unknown
            > as HttpQueryHookReturn<SerializedData, S, I, O[1]>;
        }

        Reflect.set(useHttpQuery, ' __source', { method, pathname, baseUrl });
        return useHttpQuery;
    };
    /**
     * 制作一个 Mutation 请求 Hook，常用于 POST 请求
     *
     * 注: 该请求 Hook 不会自动发出请求，需要主动调用 `execute` 方法才可发出请求
     */
    public makeMutation = () => {
        const {
            pathname,
            method,
            baseUrl,
            fetcher: _local_fetcher,
            mode,
        } = this;

        function useHttpMutation(
            options: HttpMutationHookOptions<S, I, O[1]> = {},
        ) {
            type Expose = {
                pending?: boolean;
                data?: S['Response'];
                error?: S['Error'];
                request?: I;
                response?: O[1];
            };
            const exposeRef = useRef<Expose>({});
            type Metadata = {
                done?: boolean;
                unmounted?: boolean;
            };
            const metadataRef = useRef<Metadata>({});

            // 强制刷新
            const triggerUpdate = useReducer(() => ({}), { pathname })[1];

            const client = useHttpClient();
            const mergedOptionsRef = useLatestRef({
                ...options,
                client,
                fetcher: options.fetcher || client.options.fetcher,
            });

            const fetcher = (mergedOptionsRef.current?.fetcher ||
                _local_fetcher ||
                client.options.fetcher) as (
                request: Request,
            ) => Promise<[unknown, Response]>;
            if (!fetcher) throw new Error('Failed to initialize fetcher');

            // 清理相关状态
            const cleanup = useCallback(() => {
                Object.keys(exposeRef.current).forEach(
                    (key) =>
                        void (exposeRef.current[key as keyof Expose] = void 0),
                );
            }, []);

            const makeRequest = useCallback(
                async (
                    params: S['Body'],
                    executeOptions: MutationExecuteOptions<S> = {},
                ): Promise<readonly [S['Response'], I, O[1]]> => {
                    const mergedOptions = mergedOptionsRef.current;
                    const url = new URL(
                        baseUrl ||
                            mergedOptions.client.options.baseUrl ||
                            location.origin,
                    );
                    populatePathParams(
                        url,
                        pathname,
                        executeOptions?.path || mergedOptions.path,
                    );
                    if (executeOptions.query || mergedOptions.query) {
                        populateQueryParams(
                            url,
                            pipe(
                                (executeOptions.query ||
                                    mergedOptions.query ||
                                    {}) as S['Query'],
                            )(executeOptions.serializers?.query)() as Record<
                                string,
                                string
                            >,
                        );
                    }
                    const [contentType, body] = pipe(params)(
                        executeOptions.serializers?.body,
                    )((body) => serializeBody(body))();
                    const req = new Request(url, {
                        method,
                        body,
                        ...mergedOptions.init,
                        ...executeOptions?.init,
                        headers: mergeHeaders(
                            contentType === false
                                ? null
                                : { 'Content-Type': contentType },
                            mergedOptions.headers,
                            mergedOptions.init?.headers,
                            executeOptions.init?.headers,
                            mergedOptions.headers,
                        ),
                    });
                    const ret = await fetcher(req).then(
                        (res) => res as [S['Response'], Response],
                    );
                    return [ret[0], req as I, ret[1]];
                },
                [fetcher, mergedOptionsRef],
            );
            const makeInvoke = useCallback(
                async (
                    params: S['Body'],
                ): Promise<readonly [S['Response'], I, O[1]]> => {
                    if (!_local_fetcher)
                        throw new Error('Fetcher is not defined');
                    const ret = await _local_fetcher(params as I);
                    return [ret[0], params as I, ret[1]];
                },
                [],
            );
            const executor = mode === 'http' ? makeRequest : makeInvoke;

            // 请求执行函数
            const execute = useCallback<MutationExecuteFunc<S>>(
                async (...args) => {
                    const executeOptions = (args[1] ?? {
                        silent: client.options.default?.mutation?.execution
                            ?.silent,
                    }) as MutationExecuteOptions<S>;
                    const expose = exposeRef.current;
                    const metadata = metadataRef.current;
                    const mergedOptions = mergedOptionsRef.current;
                    const rerender = createRerender(
                        executeOptions.silent === false,
                        triggerUpdate,
                    );
                    await mergedOptions.onBefore?.();
                    rerender(() => {
                        expose.pending = true;
                    });
                    let request: I;
                    try {
                        const ret = await executor(
                            args[0] as S['Body'],
                            executeOptions,
                        ).finally(() => rerender(cleanup, false));
                        request = ret[1];
                        rerender(() => {
                            expose.data = ret[0];
                            expose.response = ret[2];
                            expose.request = ret[1];
                        }, false);
                        mergedOptions.onSuccess?.(ret[0], {
                            input: ret[1],
                            output: ret[2],
                        });
                        return ret[0];
                    } catch (e) {
                        rerender(() => {
                            expose.request = request;
                            expose.error = e as S['Error'];
                        }, false);
                        mergedOptions.onError?.(e as S['Error']);
                        throw e;
                    } finally {
                        if (!metadata.unmounted) {
                            rerender(() => {
                                expose.pending = false;
                                metadata.done = true;
                            });
                        }
                        mergedOptions.onFinally?.();
                    }
                },
                [
                    client.options.default?.mutation?.execution?.silent,
                    mergedOptionsRef,
                    triggerUpdate,
                    executor,
                    cleanup,
                ],
            );
            // 标记组件已经卸载
            useEffect(() => {
                const metadata = metadataRef.current;
                metadata.unmounted = false;
                return () => {
                    metadata.unmounted = true;
                };
            }, []);
            return {
                kind:
                    exposeRef.current.error !== void 0
                        ? 'error'
                        : exposeRef.current.pending !== false
                          ? 'pending'
                          : 'success',
                data: exposeRef.current.data,
                pending: exposeRef.current.pending,
                error: exposeRef.current.error,
                done: metadataRef.current.done,
                request: exposeRef.current.request,
                response: exposeRef.current.response,
                execute,
            } satisfies Record<
                keyof HttpMutationHookReturn<S>,
                unknown
            > as HttpMutationHookReturn<S>;
        }

        Reflect.set(useHttpMutation, ' __source', {
            method,
            pathname,
            baseUrl,
        });
        return useHttpMutation;
    };
    /**
     * 制作一个普通地请求，即一个 `fetch` 函数的包装，用于直接调用
     *
     * ## 例子
     * ```typescript
     * const createUser = createHttpFactory('POST:/users')
     *   .apply<'Body', { nickname: string, address: string }>
     *   .apply<'Response', { code: number, msg: string }>
     *
     * await createUser({
     *   body: {
     *     nickname: 'Bob',
     *     address: '...'
     *   }
     * })
     * ```
     */
    public makeRequest = () => {
        const { pathname, method, baseUrl } = this;

        async function request<Serialized = S['Response']>(
            options: HttpRequestOptions<
                S,
                Serialized
            > = {} as HttpRequestOptions<S, Serialized>,
        ): Promise<Serialized> {
            const url = new URL(baseUrl || options.baseUrl || location.origin);
            populatePathParams(
                url,
                pathname,
                options.path as Record<string, string | number>,
            );
            if (options.query) {
                populateQueryParams(
                    url,
                    pipe(options.query)(options.serializers?.query)(),
                );
            }
            const [contentType, payload] = pipe(options.body as S['Body'])(
                options.serializers?.body,
            )((body) => serializeBody(body))();
            const req = new Request(url, {
                method,
                body: payload,
                ...options.init,
                headers: mergeHeaders(
                    contentType === false
                        ? null
                        : { 'Content-Type': contentType },
                    options.headers,
                    options.init?.headers,
                ),
            });
            const res = await (options.fetcher || fetch)(req);
            if (options.serializers?.response)
                return (await options.serializers.response(
                    res,
                )) as Promise<Serialized>;
            else return (await res.json()) as Promise<Serialized>;
        }

        Reflect.set(request, ' __source', { method, pathname, baseUrl });
        return request;
    };
}

export const createHttpFactory = <S extends string>(
    url: S,
    sep = ':',
    fetcher:
        | ((input: Request) => Promise<[unknown, Response]>)
        | undefined = undefined,
) => {
    const [method, pathname] = url.split(sep);

    return new HttpFactory(
        method.toUpperCase(),
        pathname,
        undefined,
        fetcher,
    ).apply<'Path', ParsePathParameters<S>>();
};
type ParsePathParameters<
    S,
    Ret extends {} = {},
> = S extends `${string}{${infer K}}${infer Rest}`
    ? ParsePathParameters<
          Rest,
          Ret & {
              [P in K]: string;
          }
      >
    : Ret;

// ====== Utils ================

/**
 * 检测是否为有语法等导致的错误
 * @param error
 */
const checkUnexpectedError = (error: unknown) => {
    if (
        [TypeError, SyntaxError, ReferenceError, RangeError].some(
            (Err) => error instanceof Err,
        )
    ) {
        throw error;
    }
};

/**
 * 有条件的重新渲染或者为赋值ref
 * @param allowRendering
 * @param render
 */
const createRerender = (
    allowRendering: boolean | undefined,
    render: () => void,
) => {
    return (before?: () => void, update = true) => {
        if (!allowRendering) return void 0;
        before?.();
        if (update) render();
    };
};

const makeCacheKey = (mode: string, key: string) => `:${mode}+${key}`;

type InferableHookFn<Options> = (options?: Options) => unknown;

// 辅助类型工具，用于提取 Hook 的 HttpSchemaProperties 内的某个类型
type ExtractFullSchema<T> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends InferableHookFn<HttpQueryHookOptions<infer S1, any, any, any>>
        ? S1
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          T extends InferableHookFn<HttpMutationHookOptions<infer S2, any, any>>
          ? S2
          : T extends InferableHookFn<HttpRequestOptions<infer S3, unknown>>
            ? S3
            : never;
export type ExtractSchemaType<
    T,
    K extends ApplicableKeys,
> = ExtractFullSchema<T>[K];

// for internal use only
class OverdueError extends Error {
    constructor(
        message: string,
        readonly context?: { [key: string]: unknown },
    ) {
        super(message);
        this.name = 'OverdueError';
    }
}

/**
 * 合并 Headers
 * @param args
 */
const mergeHeaders = (
    ...args: (HeadersInit | object | undefined | false | null)[]
) => {
    const headers = new Headers();
    for (const arg of args) {
        if (isArray(arg)) {
            for (const [key, value] of arg as [string, string][]) {
                headers.set(key, value);
            }
        } else if (isPlainObject(arg)) {
            for (const key of Object.keys(arg)) {
                headers.set(key, String(arg[key]));
            }
        } else if (arg instanceof Headers) {
            for (const [key, value] of arg.entries()) {
                headers.set(key, value);
            }
        }
    }
    return headers;
};
const populatePathParams = (
    url: URL,
    pathname: string,
    params?: Record<string, string | number>,
) => {
    if (!params) {
        url.pathname += pathname;
    } else {
        url.pathname += Object.keys(params).reduce((pathname, key) => {
            return pathname.replace(`{${key}}`, String(params[key]));
        }, pathname);
    }
    url.pathname = url.pathname.replace('//', '/');
};
const populateQueryParams = (
    url: URL,
    params?: Record<string, string | number>,
) => {
    if (!params) return void 0;
    url.search = Object.keys(params)
        .reduce((search, key) => {
            if (isDef(params[key])) search.append(key, String(params[key]));
            return search;
        }, new URLSearchParams())
        .toString();
};
const serializeBody = (body?: HttpSchemaProperties['Body']) => {
    if (body instanceof URLSearchParams)
        return ['application/x-www-form-urlencoded', body] as const;
    if (body instanceof FormData) return [false, body] as const;
    if (body instanceof Blob) return [false, body] as const;
    if (body instanceof ArrayBuffer) return [false, body] as const;
    if (isPlainObject(body))
        return ['application/json', JSON.stringify(body) as string] as const;
    return [false, null] as const;
};

export const serializerHelpers = {
    /**
     * Query参数序列化
     * @param values
     * @param options
     * @examples ```ts
     * serializerHelpers.query({a: [1, 2, 3]}, { arrayFormat: 'repeat' }) // a=1&a=2&a=3
     * serializerHelpers.query({a: [1, 2, 3]}, { arrayFormat: 'pipes' }) // a=1|2|3
     * serializerHelpers.query({a: [1, 2, 3]}, { arrayFormat: 'csv' }) // a=1,2,3
     * serializerHelpers.query({a: [1, 2, 3]}, { arrayFormat: 'bracket' }) // a[]=1&a[]=2&a[]=3
     * serializerHelpers.query({a: [1, 2, 3]}, { arrayFormat: 'bracket' }) // a[]=1&a[]=2&a[]=3
     * serializerHelpers.query({a: [1, 2, 3]}, { arrayFormat: 'bracket-index' }) // ?a[0]=1&a[1]=2&a[2]=3
     * serializerHelpers.query({a: [1, 2, 3]}, { arrayFormat: 'json' }) // a=[1,2,3]
     * ```
     */
    query: (
        values: Record<string, unknown>,
        {
            arrayFormat,
        }: {
            // 数组格式化方式
            arrayFormat:
                | 'csv'
                | 'pipes'
                | 'repeat'
                | 'bracket'
                | 'bracket-index'
                | 'json';
        } = { arrayFormat: 'repeat' },
    ): string => {
        const search = new URLSearchParams();
        Object.entries(values).forEach(([k, v]) => {
            if (!isDef(v)) return void 0;
            if (isString(v) || isNumber(v)) {
                search.append(k, v.toString());
                return void 0;
            }
            if (Array.isArray(v)) {
                switch (arrayFormat) {
                    case 'csv':
                        search.append(k, v.join(','));
                        break;
                    case 'pipes':
                        search.append(k, v.join('|'));
                        break;
                    case 'repeat':
                        v.forEach((item) => search.append(k, item));
                        break;
                    case 'bracket':
                        v.forEach((item) => search.append(`${k}[]`, item));
                        break;
                    case 'bracket-index':
                        v.forEach((item, index) =>
                            search.append(`${k}[${index}]`, item),
                        );
                        break;
                    case 'json':
                        search.append(k, JSON.stringify(v));
                        break;
                }
                return void 0;
            }
            if (v instanceof Date) {
                search.append(k, v.toISOString());
                return void 0;
            }
            search.append(k, String(v));
        });
        return search.toString();
    },
    /**
     * 将 Object 序列化为 FormData
     * @param values
     * @examples ```ts
     * serializerHelpers.formData({a: 'value1', b: 'value2'}) // FormData
     * ```
     */
    formData: (values: Record<string, unknown>): FormData => {
        const formData = new FormData();
        Object.entries(values).forEach(([k, v]) => {
            if (!isDef(v)) return void 0;
            if (v instanceof File) {
                formData.append(k, v);
            } else {
                formData.append(k, v.toString());
            }
        });
        return formData;
    },
};
