import { createContext, createElement, FC, ReactNode, useContext } from 'react';
import { IEntity } from '~/constants/types.ts';

const __ENTITY_CONTEXT = createContext<IEntity | null>(null);
export const EntityProvider: FC<{ value: IEntity; children: ReactNode }> = ({
  value,
  children,
}) => {
  return createElement(
    __ENTITY_CONTEXT.Provider,
    {
      value,
    },
    children
  );
};
export const useEntityConsumer = () => {
  const entity = useContext(__ENTITY_CONTEXT);
  if (!entity)
    throw new Error(
      'Required context was not found. Please make sure to use it within an <EntityProvider/> component.'
    );
  return entity;
};
