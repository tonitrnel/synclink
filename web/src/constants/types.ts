import { InferSType } from '@painted/http';
import { useGetList } from '~/endpoints';

export type IEntity = InferSType<typeof useGetList, 'Response'>['data'][number];
