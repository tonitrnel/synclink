import { ExtractSchemaType, useListQuery } from '~/endpoints';
import { ItemTypeComponentMap } from '../_components/item/base';


export type DataEntry  = ExtractSchemaType<
    typeof useListQuery,
    'Response'
>['data'][number];
export type ItemType = keyof typeof ItemTypeComponentMap;
type FileMetadataType = NonNullable<DataEntry['metadata']>['type'];
export type FileMetadata = {
    [K in FileMetadataType]: Extract<NonNullable<DataEntry['metadata']>, { type: K }>
};
export type DataEntryWithExtras  = DataEntry  & {
    content?: string;
    __extras__: {
        itemType: ItemType;
        estimatedHeight: number;
    };
};
