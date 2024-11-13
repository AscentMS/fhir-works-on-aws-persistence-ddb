/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { uniqWith, isEqual, partition, groupBy, zipObject } from 'lodash';

import ESBulkCommand, { OperationType } from './ESBulkCommand';
import { DOCUMENT_STATUS_FIELD } from '../dataServices/dynamoDbUtil';
import DOCUMENT_STATUS from '../dataServices/documentStatus';
import getComponentLogger from '../loggerBuilder';

const REMOVE = 'REMOVE';
const DELETED = 'DELETED';

const logger = getComponentLogger();

let { ELASTICSEARCH_DOMAIN_ENDPOINT } = process.env;

if (process.env.IS_OFFLINE === 'true') {
    ELASTICSEARCH_DOMAIN_ENDPOINT = process.env.OFFLINE_ELASTICSEARCH_DOMAIN_ENDPOINT || 'https://fake-es-endpoint.com';
}

const formatDocument = (ddbImage: any): any => {
    if (ddbImage._tenantId) {
        return {
            ...ddbImage,
            id: ddbImage._id, // use the original resourceId as id instead of the DDB composite id
            _id: undefined, // _id is a reserved field in ES, so it must be removed.
        };
    }
    return ddbImage;
};

const getDefaultESClientFromEnvVars: () => Client = () => {
    const ES_DOMAIN_ENDPOINT = ELASTICSEARCH_DOMAIN_ENDPOINT || 'https://fake-es-endpoint.com';
    
    return new Client({
        ...AwsSigv4Signer({
            region: process.env.AWS_REGION || 'eu-west-2',
            service: 'es',
            getCredentials: () => {
                const credentialsProvider = defaultProvider();
                return credentialsProvider();
            },
        }),
        node: ES_DOMAIN_ENDPOINT,
    });
};

export default class DdbToEsHelper {
    public ElasticSearch: Client;

    constructor({ esClient = getDefaultESClientFromEnvVars() }: { esClient?: Client } = {}) {
        this.ElasticSearch = esClient;
    }

    // async createIndexAndAliasIfNotExist(resourceTypes: Set<string>) {
    async createIndexAndAliasIfNotExist(aliases: { alias: string; index: string }[]) {
        if (aliases.length === 0) {
            return;
        }

        const uniqAliases = uniqWith(aliases, isEqual);
        const listOfAliases = uniqAliases.map((x) => x.alias);

        const allFound = await this.ElasticSearch.indices.existsAlias({
            name: listOfAliases,
            expand_wildcards: 'all',
        });
        if (allFound) {
            // All needed aliases exist
            return;
        }

        logger.debug('There are missing aliases');

        const existingIndices: Set<string> = new Set();
        const existingAliases: Set<string> = new Set();

        const indices = await this.ElasticSearch.indices.getAlias();
        Object.entries(indices).forEach(([indexName, indexBody]) => {
            existingIndices.add(indexName);
            Object.keys((indexBody as any).aliases).forEach((alias: string) => {
                existingAliases.add(alias);
            });
        });

        const missingAliases = uniqAliases.filter((x) => !existingAliases.has(x.alias));

        const [aliasesWithExistingIndex, aliasesWithMissingIndex] = partition(missingAliases, (x) =>
            existingIndices.has(x.index),
        );

        try {
            const promises: any[] = [];

            const aliasesByIndex = groupBy(aliasesWithMissingIndex, 'index');

            Object.entries(aliasesByIndex).forEach(([index, aliasesForIndex]) => {
                const aliasesNames = aliasesForIndex.map((x) => x.alias);

                const aliasesArg = zipObject(aliasesNames, new Array(aliasesNames.length).fill({}));

                logger.info(`create index ${index} & aliases ${aliasesNames}`);
                const params = {
                    index,
                    body: {
                        mappings: {
                            properties: {
                                id: {
                                    type: 'keyword',
                                    index: true,
                                },
                                resourceType: {
                                    type: 'keyword',
                                    index: true,
                                },
                                _references: {
                                    type: 'keyword',
                                    index: true,
                                },
                                documentStatus: {
                                    type: 'keyword',
                                    index: true,
                                },
                                _tenantId: {
                                    type: 'keyword',
                                    index: true,
                                },
                            },
                        },
                        aliases: aliasesArg,
                    },
                };
                promises.push(this.ElasticSearch.indices.create(params));
            });
            aliasesWithExistingIndex.forEach((alias) => {
                // Create Alias; this block is creating aliases for existing indices
                logger.info(`create alias ${alias.alias} for index ${alias.index}`);
                promises.push(
                    this.ElasticSearch.indices.putAlias({
                        index: alias.index,
                        name: alias.alias,
                    }),
                );
            });

            await Promise.all(promises);
        } catch (error) {
            logger.error(`Failed to create indices and aliases:`, aliases);
            throw error;
        }
    }

     
    private generateFullId(ddbImage: any) {
        const { id, vid, _tenantId, _id } = ddbImage;
        if (_tenantId) {
            return `${_tenantId}_${_id}_${vid}`;
        }
        return `${id}_${vid}`;
    }

    // Getting promise params for actual deletion of the record from ES
    createBulkESDelete(ddbResourceImage: any, alias: string): ESBulkCommand {
        const compositeId = this.generateFullId(ddbResourceImage);
        return {
            bulkCommand: [
                {
                    delete: { _index: alias, _id: compositeId },
                },
            ],
            id: compositeId,
            type: 'delete',
        };
    }

    // Getting promise params for inserting a new record or editing a record
    createBulkESUpsert(newImage: any, alias: string): ESBulkCommand | null {
        // We only perform operations on records with documentStatus === AVAILABLE || DELETED
        if (
            newImage[DOCUMENT_STATUS_FIELD] !== DOCUMENT_STATUS.AVAILABLE &&
            newImage[DOCUMENT_STATUS_FIELD] !== DOCUMENT_STATUS.DELETED
        ) {
            return null;
        }

        let type: OperationType = 'upsert-DELETED';
        if (newImage[DOCUMENT_STATUS_FIELD] === DOCUMENT_STATUS.AVAILABLE) {
            type = 'upsert-AVAILABLE';
        }
        const compositeId = this.generateFullId(newImage);
        return {
            id: compositeId,
            bulkCommand: [
                { update: { _index: alias, _id: compositeId } },
                { doc: formatDocument(newImage), doc_as_upsert: true },
            ],
            type,
        };
    }

    async executeEsCmds(cmds: ESBulkCommand[]) {
        const bulkCmds: any[] = cmds.flatMap((cmd: ESBulkCommand) => {
            return cmd.bulkCommand;
        });

        if (bulkCmds.length === 0) {
            return;
        }
        const listOfIds = cmds.map((cmd) => {
            return cmd.id;
        });
        logger.info(`Starting bulk sync operation on ids: `, listOfIds);
        try {
            const bulkResponse = await this.ElasticSearch.bulk({
                refresh: 'wait_for',
                body: bulkCmds,
            });

            if (bulkResponse.body.errors) {
                const erroredDocuments: any[] = [];
                // The presence of the `error` key indicates that the operation
                // that we did for the document has failed.
                bulkResponse.body.items.forEach((action: any) => {
                    const operation = Object.keys(action)[0];
                    if (action[operation].error) {
                        erroredDocuments.push({
                            status: action[operation].status,
                            error: action[operation].error,
                            index: action[operation]._index,
                            id: action[operation]._id,
                            esOperation: operation,
                        });
                    }
                });
                throw new Error(JSON.stringify(erroredDocuments));
            }
        } catch (error) {
            logger.error(`Bulk sync operation failed on ids: `, listOfIds);
            throw error;
        }
    }

     
    isRemoveResource(record: any): boolean {
        if (record.eventName === REMOVE) {
            return true;
        }
        return record.dynamodb.NewImage.documentStatus.S === DELETED && process.env.ENABLE_ES_HARD_DELETE === 'true';
    }
}
