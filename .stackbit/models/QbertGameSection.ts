import { Model } from '@stackbit/types';
import { colorFields, settingFields, settingFieldsGroup, styleFieldsGroup } from './section-common-fields';

export const QbertGameSectionModel: Model = {
    type: 'object',
    name: 'QbertGameSection',
    label: 'Q-Bert Game',
    labelField: 'title',
    thumbnail: 'https://assets.stackbit.com/components/models/thumbnails/default.png',
    groups: ['SectionModels'],
    fieldGroups: [...styleFieldsGroup, ...settingFieldsGroup],
    fields: [
        {
            type: 'string',
            name: 'title',
            description: 'The value of the field is used for presentation purposes in Stackbit',
            default: 'Q-Bert Game'
        },
        ...colorFields,
        ...settingFields,
        {
            type: 'style',
            name: 'styles',
            styles: {
                self: {
                    height: ['auto', 'screen'],
                    width: ['narrow', 'wide', 'full'],
                    padding: ['tw0:96']
                }
            },
            default: {
                self: {
                    height: 'auto',
                    width: 'narrow',
                    padding: ['pt-12', 'pb-12', 'pl-4', 'pr-4']
                }
            }
        }
    ]
};
