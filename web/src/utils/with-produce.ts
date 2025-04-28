/* eslint-disable @typescript-eslint/no-explicit-any */
import { produce } from 'immer';
import { Dispatch, SetStateAction } from 'react';

type InferState<T> = T extends Dispatch<SetStateAction<infer U>> ? U : never;

/**
 * 一个快捷使用immer produce和react setState操作的工具
 * @param dispatch
 * @param recipe
 * @example withProduce(setState, (draft) => void (draft.push("str")))
 */
export const withProduce = <
    T extends Dispatch<SetStateAction<any>>,
    S = InferState<T>,
>(
    dispatch: T,
    recipe: (draft: S) => void,
) => {
    dispatch((prevState: any) => produce(prevState, recipe));
};
