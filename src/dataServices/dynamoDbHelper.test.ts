/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceNotFoundError } from '@ascentms/fhir-works-on-aws-interface';
import { DynamoDB, DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { cloneDeep } from 'lodash';

import DynamoDbHelper from './dynamoDbHelper';
import { utcTimeRegExp } from '../../testUtilities/regExpressions';
import { ConditionalCheckFailedExceptionMock } from '../../testUtilities/ConditionalCheckFailedException';
import DOCUMENT_STATUS from './documentStatus';
import { DOCUMENT_STATUS_FIELD, DynamoDbUtil } from './dynamoDbUtil';

const id = '8cafa46d-08b4-4ee4-b51b-803e20ae8126';
const resourceType = 'Patient';
const resource: any = {
    id,
    vid: 1,
    resourceType: 'Patient',
    name: [
        {
            family: 'Jameson',
            given: ['Matt'],
        },
    ],
    meta: { versionId: '1', lastUpdated: new Date().toISOString() },
};
resource[DOCUMENT_STATUS_FIELD] = DOCUMENT_STATUS.AVAILABLE;

function getExpectedResponse(res: any, versionId: string) {
    let expectedResource: any = cloneDeep(res);
    expectedResource = DynamoDbUtil.cleanItem(expectedResource);
    expectedResource.meta = { versionId, lastUpdated: expect.stringMatching(utcTimeRegExp) };

    return {
        message: 'Resource found',
        resource: expectedResource,
    };
}

const dynamoDbMock = mockClient(DynamoDBClient);

describe('getMostRecentResource', () => {
    beforeEach(() => {
        //AWSMock.restore();
        dynamoDbMock.reset();
    });

    test('SUCCESS: Found most recent resource', async () => {
        // READ items (Success)
        /*
        AWSMock.mock('DynamoDB', 'query', (params: QueryInput, callback: Function) => {
            callback(null, {
                Items: [marshall(resource)],
            });
        });
        */
        dynamoDbMock.on(QueryCommand).resolvesOnce({
            Items: [marshall(resource)],
        });
        
        const expectedResponse = getExpectedResponse(resource, '1');

        const ddbHelper = new DynamoDbHelper(new DynamoDB());
        await expect(ddbHelper.getMostRecentResource(resourceType, id)).resolves.toEqual(expectedResponse);

        expect(dynamoDbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });
    test('FAILED: resourceType of request does not match resourceType retrieved', async () => {
        // READ items (Success)
        /*
        AWSMock.mock('DynamoDB', 'query', (params: QueryInput, callback: Function) => {
            callback(new ConditionalCheckFailedExceptionMock(), {});
        });
        */
        dynamoDbMock.on(QueryCommand).rejectsOnce(new ConditionalCheckFailedExceptionMock());

        const ddbHelper = new DynamoDbHelper(new DynamoDB());
        await expect(ddbHelper.getMostRecentResource(resourceType, id)).rejects.toThrowError(
            new ResourceNotFoundError(resourceType, id),
        );

        expect(dynamoDbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });

    test('FAILED: Resource not found', async () => {
        // READ items (Success)
        /*
        AWSMock.mock('DynamoDB', 'query', (params: QueryInput, callback: Function) => {
            callback(null, {});
        });
        */
        dynamoDbMock.on(QueryCommand).resolvesOnce({});

        const ddbHelper = new DynamoDbHelper(new DynamoDB());
        await expect(ddbHelper.getMostRecentResource(resourceType, id)).rejects.toThrowError(
            new ResourceNotFoundError(resourceType, id),
        );

        expect(dynamoDbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });
});

describe('getMostRecentValidResource', () => {
    beforeEach(() => {
        //AWSMock.restore();
        dynamoDbMock.reset();
    });
    const v2Resource = cloneDeep(resource);
    v2Resource.meta = { versionId: '2', lastUpdated: new Date().toISOString() };
    v2Resource.name = [
        {
            family: 'Smith',
            given: ['Matt'],
        },
    ];
    v2Resource.vid = 2;

    test('SUCCESS: Latest version is in AVAILABLE status', async () => {
        // READ items (Success)
        /*
        AWSMock.mock('DynamoDB', 'query', (params: QueryInput, callback: Function) => {
            callback(null, {
                Items: [marshall(v2Resource), marshall(resource)],
            });
        });
        */
        dynamoDbMock.on(QueryCommand).resolvesOnce({
            Items: [marshall(v2Resource), marshall(resource)],
        });

        const expectedResponse = getExpectedResponse(v2Resource, '2');

        const ddbHelper = new DynamoDbHelper(new DynamoDB());
        // If latest version is in AVAILABLE status, then the resource being returned should be the latest version
        await expect(ddbHelper.getMostRecentUserReadableResource(resourceType, id)).resolves.toEqual(expectedResponse);

        expect(dynamoDbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });

    test('SUCCESS: Second latest version is in AVAILABLE status', async () => {
        const clonedV2Resource = cloneDeep(v2Resource);
        clonedV2Resource[DOCUMENT_STATUS_FIELD] = DOCUMENT_STATUS.PENDING;

        // READ items (Success)
        /*
        AWSMock.mock('DynamoDB', 'query', (params: QueryInput, callback: Function) => {
            callback(null, {
                Items: [marshall(clonedV2Resource), marshall(resource)],
            });
        });
        */
        dynamoDbMock.on(QueryCommand).resolvesOnce({
            Items: [marshall(clonedV2Resource), marshall(resource)],
        });

        const expectedResponse = getExpectedResponse(resource, '1');

        const ddbHelper = new DynamoDbHelper(new DynamoDB());
        // If latest version is in PENDING status, then the resource being returned should be the second latest version
        await expect(ddbHelper.getMostRecentUserReadableResource(resourceType, id)).resolves.toEqual(expectedResponse);
        expect(dynamoDbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });

    test('FAILED: resourceType of request does not match resourceType retrieved', async () => {
        // READ items (Success)
        /*
        AWSMock.mock('DynamoDB', 'query', (params: QueryInput, callback: Function) => {
            callback(new ConditionalCheckFailedExceptionMock(), {});
        });
        */
        dynamoDbMock.on(QueryCommand).rejectsOnce(new ConditionalCheckFailedExceptionMock());

        const ddbHelper = new DynamoDbHelper(new DynamoDB());
        await expect(ddbHelper.getMostRecentUserReadableResource(resourceType, id)).rejects.toThrowError(
            new ResourceNotFoundError(resourceType, id),
        );

        expect(dynamoDbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });

    test('FAILED: Resource not found', async () => {
        // READ items (Success)
        /*
        AWSMock.mock('DynamoDB', 'query', (params: QueryInput, callback: Function) => {
            callback(null, {});
        });
        */
        dynamoDbMock.on(QueryCommand).resolvesOnce({});

        const ddbHelper = new DynamoDbHelper(new DynamoDB());
        await expect(ddbHelper.getMostRecentUserReadableResource(resourceType, id)).rejects.toThrowError(
            new ResourceNotFoundError(resourceType, id),
        );

        expect(dynamoDbMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    });
});
