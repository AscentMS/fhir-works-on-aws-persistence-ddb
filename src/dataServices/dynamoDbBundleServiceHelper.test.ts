/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { BatchReadWriteRequest, BatchReadWriteResponse, ResourceNotFoundError } from '@ascentms/fhir-works-on-aws-interface';
import { BatchExecuteStatementCommand, BatchWriteItemCommand, DynamoDB, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import DynamoDbBundleServiceHelper from './dynamoDbBundleServiceHelper';
import GenerateStagingRequestsFactory from '../../testUtilities/GenerateStagingRequestsFactory';
import GenerateRollbackRequestsFactory from '../../testUtilities/GenerateRollbackRequestsFactory';
import DynamoDbHelper from './dynamoDbHelper';
import { restore, stub } from 'sinon';

const utcTimeRegExp = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d+)?Z/;

describe('generateStagingRequests', () => {
    test('CREATE', () => {
        const actualResult = DynamoDbBundleServiceHelper.generateStagingRequests(
            [GenerateStagingRequestsFactory.getCreate().request],
            GenerateStagingRequestsFactory.getCreate().idToVersionId,
        );
        const expectedResult: any = {
            deleteRequests: [],
            createRequests: [GenerateStagingRequestsFactory.getCreate().expectedRequest],
            updateRequests: [],
            readRequests: [],
            newLocks: [GenerateStagingRequestsFactory.getCreate().expectedLock],
            newStagingResponses: [GenerateStagingRequestsFactory.getCreate().expectedStagingResponse],
        };

        expect(actualResult).toMatchObject(expectedResult);
    });

    test('READ', () => {
        const actualResult = DynamoDbBundleServiceHelper.generateStagingRequests(
            [GenerateStagingRequestsFactory.getRead().request],
            GenerateStagingRequestsFactory.getRead().idToVersionId,
        );
        const expectedResult: any = {
            deleteRequests: [],
            createRequests: [],
            updateRequests: [],
            readRequests: [GenerateStagingRequestsFactory.getRead().expectedRequest],
            newLocks: [],
            newStagingResponses: [GenerateStagingRequestsFactory.getRead().expectedStagingResponse],
        };

        expect(actualResult).toMatchObject(expectedResult);
    });

    test('UPDATE', () => {
        const actualResult = DynamoDbBundleServiceHelper.generateStagingRequests(
            [GenerateStagingRequestsFactory.getUpdate().request],
            GenerateStagingRequestsFactory.getUpdate().idToVersionId,
        );

        const expectedResult: any = {
            deleteRequests: [],
            createRequests: [],
            updateRequests: [GenerateStagingRequestsFactory.getUpdate().expectedRequest],
            readRequests: [],
            newLocks: [GenerateStagingRequestsFactory.getUpdate().expectedLock],
            newStagingResponses: [GenerateStagingRequestsFactory.getUpdate().expectedStagingResponse],
        };

        expect(actualResult).toMatchObject(expectedResult);
    });

    test('DELETE', () => {
        const actualResult = DynamoDbBundleServiceHelper.generateStagingRequests(
            [GenerateStagingRequestsFactory.getDelete().request],
            GenerateStagingRequestsFactory.getDelete().idToVersionId,
        );
        const expectedResult: any = {
            deleteRequests: [GenerateStagingRequestsFactory.getDelete().expectedRequest],
            createRequests: [],
            updateRequests: [],
            readRequests: [],
            newLocks: [],
            newStagingResponses: [GenerateStagingRequestsFactory.getDelete().expectedStagingResponse],
        };

        expect(actualResult).toMatchObject(expectedResult);
    });

    test('CRUD', () => {
        let idToVersionId: Record<string, number> = {};
        idToVersionId = {
            ...GenerateStagingRequestsFactory.getRead().idToVersionId,
            ...GenerateStagingRequestsFactory.getUpdate().idToVersionId,
            ...GenerateStagingRequestsFactory.getDelete().idToVersionId,
        };

        const requests: BatchReadWriteRequest[] = [
            GenerateStagingRequestsFactory.getCreate().request,
            GenerateStagingRequestsFactory.getRead().request,
            GenerateStagingRequestsFactory.getUpdate().request,
            GenerateStagingRequestsFactory.getDelete().request,
        ];
        const actualResult = DynamoDbBundleServiceHelper.generateStagingRequests(requests, idToVersionId);

        const expectedResult = {
            createRequests: [GenerateStagingRequestsFactory.getCreate().expectedRequest],
            readRequests: [GenerateStagingRequestsFactory.getRead().expectedRequest],
            updateRequests: [GenerateStagingRequestsFactory.getUpdate().expectedRequest],
            deleteRequests: [GenerateStagingRequestsFactory.getDelete().expectedRequest],
            newLocks: [
                GenerateStagingRequestsFactory.getCreate().expectedLock,
                GenerateStagingRequestsFactory.getUpdate().expectedLock,
            ],
            newStagingResponses: [
                GenerateStagingRequestsFactory.getCreate().expectedStagingResponse,
                GenerateStagingRequestsFactory.getRead().expectedStagingResponse,
                GenerateStagingRequestsFactory.getUpdate().expectedStagingResponse,
                GenerateStagingRequestsFactory.getDelete().expectedStagingResponse,
            ],
        };

        expect(actualResult).toMatchObject(expectedResult);
    });
});

describe('generateRollbackRequests', () => {
    const testRunner = (operation: any, vid: string) => {
        const bundleEntryResponse = GenerateRollbackRequestsFactory.buildBundleEntryResponse(operation, vid);

        const actualResult = DynamoDbBundleServiceHelper.generateRollbackRequests([bundleEntryResponse]);

        const expectedResult = GenerateRollbackRequestsFactory.buildExpectedBundleEntryResult(bundleEntryResponse);
        expect(actualResult).toEqual(expectedResult);
    };

    test('CREATE', () => {
        testRunner('create', '1');
    });

    test('READ', () => {
        testRunner('read', '1');
    });

    test('UPDATE', () => {
        testRunner('update', '2');
    });

    test('DELETE', () => {
        testRunner('delete', '1');
    });

    test('CRUD', () => {
        const createBundleEntryResponse = GenerateRollbackRequestsFactory.buildBundleEntryResponse('create', '1');
        const readBundleEntryResponse = GenerateRollbackRequestsFactory.buildBundleEntryResponse('read', '1');
        const updateBundleEntryResponse = GenerateRollbackRequestsFactory.buildBundleEntryResponse('update', '1');
        const deleteBundleEntryResponse = GenerateRollbackRequestsFactory.buildBundleEntryResponse('delete', '1');

        const actualResult = DynamoDbBundleServiceHelper.generateRollbackRequests([
            createBundleEntryResponse,
            readBundleEntryResponse,
            updateBundleEntryResponse,
            deleteBundleEntryResponse,
        ]);

        const expectedCreateResult =
            GenerateRollbackRequestsFactory.buildExpectedBundleEntryResult(createBundleEntryResponse);
        const expectedReadResult =
            GenerateRollbackRequestsFactory.buildExpectedBundleEntryResult(readBundleEntryResponse);
        const expectedUpdateResult =
            GenerateRollbackRequestsFactory.buildExpectedBundleEntryResult(updateBundleEntryResponse);
        const expectedDeleteResult =
            GenerateRollbackRequestsFactory.buildExpectedBundleEntryResult(deleteBundleEntryResponse);

        let itemsToRemoveFromLock: any = [];
        itemsToRemoveFromLock = itemsToRemoveFromLock.concat(expectedCreateResult.itemsToRemoveFromLock);
        itemsToRemoveFromLock = itemsToRemoveFromLock.concat(expectedReadResult.itemsToRemoveFromLock);
        itemsToRemoveFromLock = itemsToRemoveFromLock.concat(expectedUpdateResult.itemsToRemoveFromLock);
        itemsToRemoveFromLock = itemsToRemoveFromLock.concat(expectedDeleteResult.itemsToRemoveFromLock);

        //itemsToRemoveFromLock = itemsToRemoveFromLock.filter((item: any) => item !== []);
        itemsToRemoveFromLock = itemsToRemoveFromLock.filter((item: any) => item.constructor.name !== 'Array');

        let transactionRequests: any = [];
        transactionRequests = transactionRequests.concat(expectedCreateResult.transactionRequests);
        transactionRequests = transactionRequests.concat(expectedReadResult.transactionRequests);
        transactionRequests = transactionRequests.concat(expectedUpdateResult.transactionRequests);
        transactionRequests = transactionRequests.concat(expectedDeleteResult.transactionRequests);

        //transactionRequests = transactionRequests.filter((req: any) => req !== []);
        transactionRequests = transactionRequests.filter((req: any) => req.constructor.name !== 'Array');

        expect(actualResult).toEqual({ itemsToRemoveFromLock, transactionRequests });
    });
});

describe('populateBundleEntryResponseWithReadResult', () => {
    test('readResults are merged correctly into bundleEntryResponses', () => {
        const stagingResponses: BatchReadWriteResponse[] = [
            {
                id: '8cafa46d-08b4-4ee4-b51b-803e20ae8126',
                vid: '3',
                operation: 'update',
                lastModified: '2020-04-23T16:22:16.355Z',
                resourceType: 'Patient',
                resource: {},
            },
            {
                id: '3f0830ce-e759-4b07-b75d-577630f2ae4d',
                vid: '1',
                operation: 'create',
                lastModified: '2020-04-23T16:22:16.357Z',
                resourceType: 'Patient',
                resource: {},
            },
            {
                id: '47135b80-b721-430b-9d4b-1557edc64947',
                vid: '1',
                operation: 'read',
                lastModified: '',
                resource: {},
                resourceType: 'Patient',
            },
            {
                id: 'bce8411e-c15e-448c-95dd-69155a837405',
                vid: '1',
                operation: 'delete',
                lastModified: '2020-04-23T16:22:16.357Z',
                resource: {},
                resourceType: 'Patient',
            },
            {
                id: 'vdo49rks-cie9-dkd3-coe0-djei03d83i30',
                vid: '1',
                operation: 'read',
                lastModified: '',
                resource: {},
                resourceType: 'Patient',
            },
        ];

        const firstReadItem = {
            resourceType: 'Patient',
            id: '47135b80-b721-430b-9d4b-1557edc64947',
            vid: '1',
            name: [
                {
                    family: 'Jameson',
                    given: ['Matt'],
                },
            ],
            gender: 'male',
            documentStatus: 'LOCKED',
        };

        const secondReadItem = {
            resourceType: 'Patient',
            id: 'vdo49rks-cie9-dkd3-coe0-djei03d83i30',
            vid: '1',
            name: [
                {
                    family: 'Smith',
                    given: ['Emily'],
                },
            ],
            gender: 'female',
            documentStatus: 'LOCKED',
        };

        const readResult = {
            Responses: [
                {
                    Item: marshall(firstReadItem),
                },
                {
                    Item: marshall(secondReadItem),
                },
            ],
        };

        const actualResult = DynamoDbBundleServiceHelper.populateBundleEntryResponseWithReadResult(
            stagingResponses,
            readResult,
        );

        const firstReadStagingResponse = stagingResponses[2];
        firstReadStagingResponse.resource = firstReadItem;

        const secondReadStagingResponse = stagingResponses[4];
        secondReadStagingResponse.resource = secondReadItem;

        const expectedResult = [
            stagingResponses[0],
            stagingResponses[1],
            firstReadStagingResponse,
            stagingResponses[3],
            secondReadStagingResponse,
        ];

        expect(actualResult).toEqual(expectedResult);
    });
});

describe('processBatchRequests', () => {
    const dynamoDbMock = mockClient(DynamoDBClient);

    const writeOperations = [
        {
            PutRequest: {
                Item: marshall({
                    id: 'create',
                    vid: 1,
                }),
            },
            originalRequestIndex: 0,
        },
        {
            PutRequest: {
                Item: marshall({
                    id: 'update',
                    vid: 2,
                }),
            },
            originalRequestIndex: 1,
        },
        {
            PutRequest: {
                Item: marshall({
                    id: 'createSuccess',
                    vid: 1,
                }),
            },
            originalRequestIndex: 2,
        },
    ];
    const deleteOperations = [
        {
            Statement: `UPDATE "resource-table" SET "documentStatus" = 'DELETED' WHERE "id" = 'abcd1234' AND "vid" = 1`,
            originalRequestIndex: 0,
        },
        {
            Statement: `UPDATE "resource-table" SET "documentStatus" = 'DELETED' WHERE "id" = 'abc123' AND "vid" = 1`,
            originalRequestIndex: 1,
        },
    ];

    afterEach(() => {
        //AWSMock.restore();
        dynamoDbMock.reset();
    });

    afterAll(() => {
        dynamoDbMock.restore();
    });

    test('successfully deleted a resource', async () => {
        /*
        AWSMock.mock('DynamoDB', 'batchExecuteStatement', (params: QueryInput, callback: Function) => {
            callback(null, {
                Responses: [[{ TableName: 'resource-table' }]],
            });
        });
        */
        dynamoDbMock.on(BatchExecuteStatementCommand).resolvesOnce({
            Responses: [{ TableName: 'resource-table' }],
        });

        // nothing is returned in the array if everything is successful
        await expect(
            DynamoDbBundleServiceHelper.processBatchDeleteRequests(deleteOperations, [], new DynamoDB()),
        ).resolves.toEqual([]);

        expect(dynamoDbMock).toReceiveCommandTimes(BatchExecuteStatementCommand, 1);
    });

    test('failed to delete a resource', async () => {
        const batchResponse: BatchReadWriteResponse[] = [
            {
                id: 'delete',
                vid: '1',
                operation: 'delete',
                resourceType: 'Patient',
                resource: {},
                lastModified: '',
            },
            {
                id: 'deleteSuccess',
                vid: '1',
                operation: 'delete',
                resourceType: 'Patient',
                resource: {},
                lastModified: '',
            },
        ];
        /*
        AWSMock.mock('DynamoDB', 'batchExecuteStatement', (params: QueryInput, callback: Function) => {
            callback(null, {
                Responses: [
                    {
                        Error: {
                            Code: 400,
                            Message: 'Failed to Delete Resource',
                        },
                    },
                    {
                        Item: {},
                    },
                ],
            });
        });
        */
        dynamoDbMock.on(BatchExecuteStatementCommand).resolves({
            Responses: [
                {
                    Error: {
                        Code: "400" as any,
                        Message: 'Failed to Delete Resource',
                    },
                },
                {
                    Item: {},
                },
            ],
        });

        // ensure responses are in same order as requests.
        await expect(
            DynamoDbBundleServiceHelper.processBatchDeleteRequests(deleteOperations, batchResponse, new DynamoDB()),
        ).resolves.toMatchObject([
            {
                ...batchResponse[0],
                error: '400 Failed to Delete Resource',
            },
            {
                ...batchResponse[1],
            },
        ]);

        expect(dynamoDbMock).toReceiveCommandTimes(BatchExecuteStatementCommand, 1);
    });

    test('successfully created/updated a resource', async () => {
        /*
        AWSMock.mock('DynamoDB', 'batchWriteItem', (params: QueryInput, callback: Function) => {
            callback(null, {});
        });
        */
        dynamoDbMock.on(BatchWriteItemCommand).resolves({});

        await expect(
            DynamoDbBundleServiceHelper.processBatchEditRequests(writeOperations, [], new DynamoDB()),
        ).resolves.toEqual([]);

        expect(dynamoDbMock).toReceiveCommandTimes(BatchWriteItemCommand, 1);
    });

    test('failed to create/update a resource', async () => {
        /*
        AWSMock.mock('DynamoDB', 'batchWriteItem', (params: QueryInput, callback: Function) => {
            callback(null, {
                UnprocessedItems: {
                    '': [writeOperations[0], writeOperations[1]],
                },
            });
        });
        */
        dynamoDbMock.on(BatchWriteItemCommand).resolves({
            UnprocessedItems: {
                '': [writeOperations[0], writeOperations[1]],
            },
        });

        const batchResponses: BatchReadWriteResponse[] = [
            {
                id: 'create',
                vid: '1',
                operation: 'create',
                resourceType: 'Patient',
                resource: {},
                lastModified: '',
            },
            {
                id: 'update',
                vid: '2',
                operation: 'update',
                resourceType: 'Patient',
                resource: {},
                lastModified: '',
            },
            {
                id: 'createSuccess',
                vid: '1',
                operation: 'create',
                resourceType: 'Patient',
                resource: {},
                lastModified: '',
            },
        ];

        // make sure they are in the correct order
        await expect(
            DynamoDbBundleServiceHelper.processBatchEditRequests(writeOperations, batchResponses, new DynamoDB()),
        ).resolves.toMatchObject([
            {
                ...batchResponses[0],
                error: '400 Bad Request',
            },
            {
                ...batchResponses[1],
                error: '400 Bad Request',
            },
            {
                ...batchResponses[2],
            },
        ]);

        expect(dynamoDbMock).toReceiveCommandTimes(BatchWriteItemCommand, 1);
    });
});

describe('sortBatchRequests', () => {

    afterAll(() => {
        restore();
    });

    const readResource = {
        message: 'Resource found',
        resource: {
            resourceType: 'Patient',
            meta: {
                versionId: '1',
            },
            id: 'read',
            active: true,
            gender: 'male',
            birthDate: '1974-12-25',
            vid: 1,
        },
    };
    const writeResource = {
        ...readResource.resource,
        id: 'write',
    };
    const operations: BatchReadWriteRequest[] = [
        {
            operation: 'read',
            resource: '/Patient/read',
            fullUrl: '',
            resourceType: 'Patient',
            id: 'read',
        },
        {
            operation: 'delete',
            resource: '/Patient/read',
            fullUrl: '',
            resourceType: 'Patient',
            id: 'read',
        },
        {
            operation: 'update',
            resource: readResource,
            resourceType: 'Patient',
            id: 'read',
        },
        {
            operation: 'create',
            resource: writeResource,
            fullUrl: '',
            resourceType: 'Patient',
            id: 'write',
        },
    ];
    const expectedBatchReadWriteResponsesResourceFound: BatchReadWriteResponse[] = [
        {
            id: readResource.resource.id,
            vid: '1',
            operation: 'read',
            resourceType: 'Patient',
            resource: {
                resourceType: 'Patient',
                meta: {
                    versionId: '1',
                },
                id: 'read',
                active: true,
                gender: 'male',
                birthDate: '1974-12-25',
                vid: 1,
            },
            lastModified: '',
        },
        {
            id: 'read',
            lastModified: expect.stringMatching(utcTimeRegExp),
            operation: 'delete',
            resource: {},
            resourceType: 'Patient',
            vid: '1',
        },
        {
            id: 'read',
            lastModified: expect.stringMatching(utcTimeRegExp),
            operation: 'update',
            resource: {},
            resourceType: 'Patient',
            vid: '2',
        },
        {
            id: 'write',
            lastModified: expect.stringMatching(utcTimeRegExp),
            operation: 'create',
            resourceType: 'Patient',
            vid: '1',
            resource: {
                resourceType: 'Patient',
                meta: {
                    versionId: '1',
                },
                id: 'write',
                active: true,
                gender: 'male',
                birthDate: '1974-12-25',
                vid: 1,
            },
        },
    ];

    const expectedBatchReadWriteResponsesNoResource: BatchReadWriteResponse[] = [
        {
            id: 'read',
            vid: '0',
            operation: 'read',
            resourceType: 'Patient',
            resource: {},
            lastModified: '',
            error: '404 Not Found',
        },
        {
            id: 'read',
            vid: '0',
            operation: 'delete',
            resourceType: 'Patient',
            resource: {},
            lastModified: '',
            error: '404 Not Found',
        },
        {
            id: 'read',
            vid: '0',
            operation: 'update',
            resourceType: 'Patient',
            resource: {},
            lastModified: '',
            error: '404 Not Found',
        },
        {
            id: 'write',
            lastModified: expect.stringMatching(utcTimeRegExp),
            operation: 'create',
            resourceType: 'Patient',
            vid: '1',
            resource: {
                resourceType: 'Patient',
                meta: {
                    versionId: '1',
                },
                id: 'write',
                active: true,
                gender: 'male',
                birthDate: '1974-12-25',
                vid: 1,
            },
        },
    ];

    const expectedDeleteRequests = [
        {
            Statement: `
                            UPDATE ""
                            SET "documentStatus" = 'DELETED'
                            WHERE "id" = 'read' AND "vid" = 1
                        `,
            originalRequestIndex: 1,
        },
    ];

    const expectedCreateRequests = [
        {
            PutRequest: {
                Item: marshall(writeResource),
            },
            originalRequestIndex: 3,
        },
    ];
    const expectedUpdateRequests = [
        {
            PutRequest: {
                Item: marshall(readResource),
            },
            originalRequestIndex: 2,
        },
    ];

    // resource exists
    const ddbHelperReturnReadResource = new DynamoDbHelper(new DynamoDB());
    stub(ddbHelperReturnReadResource, 'getMostRecentUserReadableResource').callsFake(function stubbedGet() {
        return Promise.resolve(readResource);
    });

    // resource does not exist
    const ddbHelperResourceNotFound = new DynamoDbHelper(new DynamoDB());
    stub(ddbHelperResourceNotFound, 'getMostRecentUserReadableResource').callsFake(function stubbedGet() {
        throw new ResourceNotFoundError('Patient', 'read');
    });

    test('CRUD operations updateCreateSupported=false', async () => {
        // read esource exists
        const actualResponseReturnReadResource = await DynamoDbBundleServiceHelper.sortBatchRequests(
            operations,
            ddbHelperReturnReadResource,
        );

        expect(actualResponseReturnReadResource.batchReadWriteResponses).toMatchObject(
            expectedBatchReadWriteResponsesResourceFound,
        );
        expect(actualResponseReturnReadResource.deleteRequests).toMatchObject(expectedDeleteRequests);
        expect(actualResponseReturnReadResource.writeRequests).toMatchObject([
            ...expectedCreateRequests,
            ...expectedUpdateRequests,
        ]);

        // no resource exists - all operations should return the same results
        const actualResponseNoResource = await DynamoDbBundleServiceHelper.sortBatchRequests(
            operations,
            ddbHelperResourceNotFound,
        );
        // if no resource is found only create will successfully run
        expect(actualResponseNoResource.batchReadWriteResponses).toMatchObject(
            expectedBatchReadWriteResponsesNoResource,
        );

        expect(actualResponseNoResource.deleteRequests).toMatchObject([]);

        expect(actualResponseNoResource.writeRequests).toMatchObject([...expectedCreateRequests]);
    });

    test('CRUD operations updateCreateSupported=true', async () => {
        const expectedCreateRequestsUpsert = [
            {
                PutRequest: {
                    Item: marshall(readResource),
                },
                originalRequestIndex: 2,
            },
            {
                PutRequest: {
                    Item: marshall(writeResource),
                },
                originalRequestIndex: 3,
            },
        ];
        const expectedBatchReadWriteResponsesUpsert: BatchReadWriteResponse[] = [
            {
                id: readResource.resource.id,
                vid: '0',
                operation: 'read',
                resourceType: 'Patient',
                resource: {},
                lastModified: '',
                error: '404 Not Found',
            },
            {
                id: 'read',
                lastModified: '',
                operation: 'delete',
                resource: {},
                resourceType: 'Patient',
                vid: '0',
                error: '404 Not Found',
            },
            {
                id: 'read',
                lastModified: expect.stringMatching(utcTimeRegExp),
                operation: 'update',
                resourceType: 'Patient',
                vid: '1',
                resource: {
                    meta: {
                        versionId: '1',
                    },
                    id: 'read',
                    vid: 1,
                },
            },
            {
                id: 'write',
                lastModified: expect.stringMatching(utcTimeRegExp),
                operation: 'create',
                resourceType: 'Patient',
                vid: '1',
                resource: {
                    resourceType: 'Patient',
                    meta: {
                        versionId: '1',
                    },
                    id: 'write',
                    active: true,
                    gender: 'male',
                    birthDate: '1974-12-25',
                    vid: 1,
                },
            },
        ];

        const updateCreateSupportedResponseReturnReadResource = await DynamoDbBundleServiceHelper.sortBatchRequests(
            operations,
            ddbHelperReturnReadResource,
            undefined,
            true,
        );
        const updateCreateSupportedResponseResourceNotFound = await DynamoDbBundleServiceHelper.sortBatchRequests(
            operations,
            ddbHelperResourceNotFound,
            undefined,
            true,
        );

        expect(updateCreateSupportedResponseReturnReadResource.batchReadWriteResponses).toMatchObject(
            expectedBatchReadWriteResponsesResourceFound,
        );
        expect(updateCreateSupportedResponseReturnReadResource.deleteRequests).toMatchObject(expectedDeleteRequests);
        expect(updateCreateSupportedResponseReturnReadResource.writeRequests).toMatchObject([
            ...expectedCreateRequests,
            ...expectedUpdateRequests,
        ]);

        // update operation wil create resource
        expect(updateCreateSupportedResponseResourceNotFound.batchReadWriteResponses).toMatchObject(
            expectedBatchReadWriteResponsesUpsert,
        );
        expect(updateCreateSupportedResponseResourceNotFound.writeRequests).toMatchObject([
            ...expectedCreateRequestsUpsert,
        ]);
    });
});
